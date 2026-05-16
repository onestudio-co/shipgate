'use strict';
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ========== WebSocket Protocol (RFC 6455) ==========

const OPCODES = { TEXT: 0x01, CLOSE: 0x08, PING: 0x09, PONG: 0x0A };
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function computeAcceptKey(clientKey) {
  return crypto.createHash('sha1').update(clientKey + WS_MAGIC).digest('base64');
}

function encodeFrame(opcode, payload) {
  const fin = 0x80;
  const len = payload.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = fin | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = fin | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = fin | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payload]);
}

function decodeFrame(buffer) {
  if (buffer.length < 2) return null;

  const secondByte = buffer[1];
  const opcode = buffer[0] & 0x0F;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLen = secondByte & 0x7F;
  let offset = 2;

  if (!masked) throw new Error('Client frames must be masked');

  if (payloadLen === 126) {
    if (buffer.length < 4) return null;
    payloadLen = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return null;
    payloadLen = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  const maskOffset = offset;
  const dataOffset = offset + 4;
  const totalLen = dataOffset + payloadLen;
  if (buffer.length < totalLen) return null;

  const mask = buffer.slice(maskOffset, dataOffset);
  const data = Buffer.alloc(payloadLen);
  for (let i = 0; i < payloadLen; i++) {
    data[i] = buffer[dataOffset + i] ^ mask[i % 4];
  }

  return { opcode, payload: data, bytesConsumed: totalLen };
}

// ========== Configuration (CLI mode defaults) ==========

const DEFAULT_PORT = process.env.BRAINSTORM_PORT || (49152 + Math.floor(Math.random() * 16383));
const DEFAULT_HOST = process.env.BRAINSTORM_HOST || '127.0.0.1';
const DEFAULT_URL_HOST = process.env.BRAINSTORM_URL_HOST || (DEFAULT_HOST === '127.0.0.1' ? 'localhost' : DEFAULT_HOST);
const DEFAULT_SESSION_DIR = process.env.BRAINSTORM_DIR || '/tmp/brainstorm';
let ownerPid = process.env.BRAINSTORM_OWNER_PID ? Number(process.env.BRAINSTORM_OWNER_PID) : null;

const MIME_TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml'
};

// ========== Templates and Constants ==========

const WAITING_PAGE = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Shipgate Review</title>
<style>body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; }
h1 { color: #333; } p { color: #666; }</style>
</head>
<body><h1>Shipgate review</h1>
<p>Waiting for the agent to push a screen...</p></body></html>`;

// ========== Helper Functions ==========

function isFullDocument(html) {
  const trimmed = html.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

function getNewestScreen(contentDir) {
  const files = fs.readdirSync(contentDir)
    .filter(f => f.endsWith('.html'))
    .map(f => {
      const fp = path.join(contentDir, f);
      return { path: fp, mtime: fs.statSync(fp).mtime.getTime() };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files.length > 0 ? files[0].path : null;
}

// ========== Core server factory ==========

function startServer({ contentDir, stateDir, host, port: bindPort }) {
  return new Promise((resolve, reject) => {
    const frameHtmlPath = path.join(__dirname, 'frame.html');
    const frameTemplatePath = path.join(__dirname, 'frame-template.html');
    const framePath = fs.existsSync(frameHtmlPath) ? frameHtmlPath : frameTemplatePath;
    const frameTemplate = fs.readFileSync(framePath, 'utf-8');
    const helperScript = fs.readFileSync(path.join(__dirname, 'helper.js'), 'utf-8');
    const helperInjection = '<script>\n' + helperScript + '\n</script>';

    const decisionCompiler = require('./decision.cjs');

    const RISK_ORDER = ['NEEDS-YOU', 'DELETION', 'BEHAVIOR', 'SAFE'];

    function wrapInFrame(content) {
      return frameTemplate.replace('<!-- CONTENT -->', content);
    }

    const clients = new Set();

    // ========== Activity Tracking ==========
    const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
    let lastActivity = Date.now();
    function touchActivity() { lastActivity = Date.now(); }

    // ========== HTTP Request Handler ==========

    function handleRequest(req, res) {
      touchActivity();

      // GET /diff/:id  → raw diff payload (lazy)
      if (req.method === 'GET' && req.url.startsWith('/diff/')) {
        const id = req.url.slice('/diff/'.length).replace(/[^a-zA-Z0-9_-]/g, '');
        const f = path.join(stateDir, 'diffs', id + '.txt');
        if (fs.existsSync(f)) { res.writeHead(200, {'Content-Type':'text/plain'}); return res.end(fs.readFileSync(f)); }
        res.writeHead(404); return res.end('no diff');
      }

      // POST /event  → append verdict to state/events (proven bus)
      if (req.method === 'POST' && req.url === '/event') {
        let b = ''; req.on('data', c => b += c); req.on('end', () => {
          try { JSON.parse(b); fs.appendFileSync(path.join(stateDir,'events'), b.trim()+'\n'); } catch {}
          res.writeHead(200); res.end('ok');
        }); return;
      }

      // POST /submit → compile decision.json + prepared-message.txt
      if (req.method === 'POST' && req.url === '/submit') {
        req.on('data', () => {}); req.on('end', () => {
          try {
            const cards = JSON.parse(fs.readFileSync(path.join(stateDir,'cards.json'),'utf8'));
            const ev = fs.existsSync(path.join(stateDir,'events'))
              ? fs.readFileSync(path.join(stateDir,'events'),'utf8').split('\n').filter(Boolean) : [];
            const { decision: dj, message } = decisionCompiler.compile(cards, ev);
            fs.writeFileSync(path.join(stateDir,'decision.json'), JSON.stringify(dj,null,2));
            fs.writeFileSync(path.join(stateDir,'prepared-message.txt'), message+'\n');
            res.writeHead(200,{'Content-Type':'application/json'}); res.end('{"ok":true}');
          } catch (e) { res.writeHead(409,{'Content-Type':'application/json'});
            res.end(JSON.stringify({ok:false,error:String(e.message||e)})); }
        }); return;
      }

      if (req.method === 'GET' && req.url === '/') {
        // Render deck if cards.json present; fall back to newest screen
        const cardsPath = path.join(stateDir, 'cards.json');
        if (fs.existsSync(cardsPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
            // Sort cards by risk order
            const sorted = [...manifest.cards].sort((a, b) => {
              const ai = RISK_ORDER.indexOf(a.risk); const bi = RISK_ORDER.indexOf(b.risk);
              return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
            });
            const deckData = { ...manifest, cards: sorted };
            let html = frameTemplate;
            // Inject __SHIPGATE_CARDS__ before </body>
            const injection = '<script>window.__SHIPGATE_CARDS__ = ' + JSON.stringify(deckData) + ';</script>\n' + helperInjection;
            if (html.includes('</body>')) {
              html = html.replace('</body>', injection + '\n</body>');
            } else {
              html += injection;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(html);
          } catch (e) {
            // fall through to legacy behavior
          }
        }

        // Legacy: serve newest screen
        const screenFile = getNewestScreen(contentDir);
        let html = screenFile
          ? (raw => isFullDocument(raw) ? raw : wrapInFrame(raw))(fs.readFileSync(screenFile, 'utf-8'))
          : WAITING_PAGE;

        if (html.includes('</body>')) {
          html = html.replace('</body>', helperInjection + '\n</body>');
        } else {
          html += helperInjection;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      if (req.method === 'GET' && req.url.startsWith('/files/')) {
        const fileName = req.url.slice(7);
        const filePath = path.join(contentDir, path.basename(fileName));
        if (!fs.existsSync(filePath)) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(fs.readFileSync(filePath));
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    }

    // ========== WebSocket Connection Handling ==========

    function handleUpgrade(req, socket) {
      const key = req.headers['sec-websocket-key'];
      if (!key) { socket.destroy(); return; }

      const accept = computeAcceptKey(key);
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
      );

      let buffer = Buffer.alloc(0);
      clients.add(socket);

      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length > 0) {
          let result;
          try {
            result = decodeFrame(buffer);
          } catch (e) {
            socket.end(encodeFrame(OPCODES.CLOSE, Buffer.alloc(0)));
            clients.delete(socket);
            return;
          }
          if (!result) break;
          buffer = buffer.slice(result.bytesConsumed);

          switch (result.opcode) {
            case OPCODES.TEXT:
              handleMessage(result.payload.toString());
              break;
            case OPCODES.CLOSE:
              socket.end(encodeFrame(OPCODES.CLOSE, Buffer.alloc(0)));
              clients.delete(socket);
              return;
            case OPCODES.PING:
              socket.write(encodeFrame(OPCODES.PONG, result.payload));
              break;
            case OPCODES.PONG:
              break;
            default: {
              const closeBuf = Buffer.alloc(2);
              closeBuf.writeUInt16BE(1003);
              socket.end(encodeFrame(OPCODES.CLOSE, closeBuf));
              clients.delete(socket);
              return;
            }
          }
        }
      });

      socket.on('close', () => clients.delete(socket));
      socket.on('error', () => clients.delete(socket));
    }

    function handleMessage(text) {
      let event;
      try {
        event = JSON.parse(text);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e.message);
        return;
      }
      touchActivity();
      console.log(JSON.stringify({ source: 'user-event', ...event }));
      if (event.choice) {
        const eventsFile = path.join(stateDir, 'events');
        fs.appendFileSync(eventsFile, JSON.stringify(event) + '\n');
      }
    }

    // ========== File Watching ==========
    const debounceTimers = new Map();

    if (!fs.existsSync(contentDir)) fs.mkdirSync(contentDir, { recursive: true });
    if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });

    const knownFiles = new Set(
      fs.readdirSync(contentDir).filter(f => f.endsWith('.html'))
    );

    const server = http.createServer(handleRequest);
    server.on('upgrade', handleUpgrade);

    const watcher = fs.watch(contentDir, (eventType, filename) => {
      if (!filename || !filename.endsWith('.html')) return;

      if (debounceTimers.has(filename)) clearTimeout(debounceTimers.get(filename));
      debounceTimers.set(filename, setTimeout(() => {
        debounceTimers.delete(filename);
        const filePath = path.join(contentDir, filename);

        if (!fs.existsSync(filePath)) return;
        touchActivity();

        if (!knownFiles.has(filename)) {
          knownFiles.add(filename);
          const eventsFile = path.join(stateDir, 'events');
          if (fs.existsSync(eventsFile)) fs.unlinkSync(eventsFile);
          console.log(JSON.stringify({ type: 'screen-added', file: filePath }));
        } else {
          console.log(JSON.stringify({ type: 'screen-updated', file: filePath }));
        }

        const frame = encodeFrame(OPCODES.TEXT, Buffer.from(JSON.stringify({ type: 'reload' })));
        for (const socket of clients) {
          try { socket.write(frame); } catch (e) { clients.delete(socket); }
        }
      }, 100));
    });
    watcher.on('error', (err) => console.error('fs.watch error:', err.message));

    // Lifecycle check (only for CLI mode — tests use close() directly)
    const lifecycleCheck = setInterval(() => {
      if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
        console.log(JSON.stringify({ type: 'server-stopped', reason: 'idle timeout' }));
        server.close();
      }
    }, 60 * 1000);
    lifecycleCheck.unref();

    server.listen(bindPort || 0, host || '127.0.0.1', () => {
      const addr = server.address();
      const actualPort = addr.port;
      const info = JSON.stringify({
        type: 'server-started', port: actualPort, host: host || '127.0.0.1',
        url: 'http://' + (host || '127.0.0.1') + ':' + actualPort,
        screen_dir: contentDir, state_dir: stateDir
      });
      console.log(info);
      try { fs.writeFileSync(path.join(stateDir, 'server-info'), info + '\n'); } catch {}

      resolve({
        port: actualPort,
        close: () => new Promise(res2 => {
          watcher.close();
          clearInterval(lifecycleCheck);
          server.close(() => res2());
          // Destroy all WebSocket clients
          for (const socket of clients) { try { socket.destroy(); } catch {} }
        })
      });
    });

    server.on('error', reject);
  });
}

// ========== CLI entry point ==========

if (require.main === module) {
  const PORT = process.env.BRAINSTORM_PORT || (49152 + Math.floor(Math.random() * 16383));
  const HOST = process.env.BRAINSTORM_HOST || '127.0.0.1';
  const URL_HOST = process.env.BRAINSTORM_URL_HOST || (HOST === '127.0.0.1' ? 'localhost' : HOST);
  const SESSION_DIR = process.env.BRAINSTORM_DIR || '/tmp/brainstorm';
  const CONTENT_DIR = path.join(SESSION_DIR, 'content');
  const STATE_DIR = path.join(SESSION_DIR, 'state');
  ownerPid = process.env.BRAINSTORM_OWNER_PID ? Number(process.env.BRAINSTORM_OWNER_PID) : null;

  if (ownerPid) {
    try { process.kill(ownerPid, 0); }
    catch (e) {
      if (e.code !== 'EPERM') {
        console.log(JSON.stringify({ type: 'owner-pid-invalid', pid: ownerPid, reason: 'dead at startup' }));
        ownerPid = null;
      }
    }
  }

  startServer({ contentDir: CONTENT_DIR, stateDir: STATE_DIR, host: HOST, port: Number(PORT) })
    .then(({ port, close }) => {
      process.on('SIGTERM', () => close().then(() => process.exit(0)));
      process.on('SIGINT', () => close().then(() => process.exit(0)));
    })
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { startServer, computeAcceptKey, encodeFrame, decodeFrame, OPCODES };
