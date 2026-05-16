'use strict';
// shipgate-server.cjs — purpose-built minimal Node http server for Studio Shipgate
// Zero dependencies beyond Node builtins.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const RISK_ORDER = ['NEEDS-YOU', 'DELETION', 'BEHAVIOR', 'SAFE'];
const MAX_EVENT_BODY = 64 * 1024; // 64KB

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// ── validation ────────────────────────────────────────────────────────────────

const REQUIRED_STRING_FIELDS = ['headline', 'plain', 'why', 'impact', 'decision', 'ifApprove', 'ifPushBack'];
const VALID_RISKS = new Set(RISK_ORDER);

function validateCards(cardsJson) {
  // Must have baseline, title, cards[]
  if (!cardsJson || typeof cardsJson !== 'object') return 'root object is missing';
  if (!Array.isArray(cardsJson.cards)) return 'cards must be an array';
  for (let i = 0; i < cardsJson.cards.length; i++) {
    const c = cardsJson.cards[i];
    for (const f of REQUIRED_STRING_FIELDS) {
      if (typeof c[f] !== 'string' || c[f].trim() === '') {
        return `card ${i}: missing '${f}' — narrator must fill v2 fields`;
      }
    }
    if (!c.example || typeof c.example !== 'object') {
      return `card ${i}: missing 'example' object — narrator must fill v2 fields`;
    }
    if (typeof c.example.before !== 'string' || c.example.before.trim() === '') {
      return `card ${i}: missing 'example.before' — narrator must fill v2 fields`;
    }
    if (typeof c.example.after !== 'string' || c.example.after.trim() === '') {
      return `card ${i}: missing 'example.after' — narrator must fill v2 fields`;
    }
    if (!VALID_RISKS.has(c.risk)) {
      return `card ${i}: 'risk' must be one of ${RISK_ORDER.join(', ')} — narrator must fill v2 fields`;
    }
    if (typeof c.hasDiff !== 'boolean') {
      return `card ${i}: 'hasDiff' must be boolean — narrator must fill v2 fields`;
    }
  }
  return null; // valid
}

// ── helpers ───────────────────────────────────────────────────────────────────

function sanitizeId(id) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(Object.assign(new Error('body too large'), { code: 'TOO_LARGE' }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, contentType, body) {
  const buf = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': buf.length,
  });
  res.end(buf);
}

function sendJSON(res, status, obj) {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(obj));
}

function serveFile(res, filePath) {
  let data;
  try { data = fs.readFileSync(filePath); } catch {
    send(res, 404, 'text/plain; charset=utf-8', 'Not Found');
    return;
  }
  const ext = path.extname(filePath);
  const ct = MIME[ext] || 'application/octet-stream';
  send(res, 200, ct, data);
}

// ── server factory ────────────────────────────────────────────────────────────

function startServer({ contentDir, stateDir, host = '127.0.0.1', port = 0 }) {
  // Resolve the server/app directory relative to this file (not contentDir)
  const appDir = path.join(__dirname, 'app');

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${host}`);
    const pathname = url.pathname;
    const method = req.method;

    // ── GET / → serve app/index.html ─────────────────────────────────────────
    if (method === 'GET' && pathname === '/') {
      serveFile(res, path.join(appDir, 'index.html'));
      return;
    }

    // ── GET /app/<file> → serve from app/ directory ───────────────────────────
    if (method === 'GET' && pathname.startsWith('/app/')) {
      const file = path.basename(pathname.slice('/app/'.length));
      if (!file || file.includes('..')) {
        send(res, 400, 'text/plain; charset=utf-8', 'Bad Request');
        return;
      }
      serveFile(res, path.join(appDir, file));
      return;
    }

    // ── GET /cards.json ───────────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/cards.json') {
      const cardsPath = path.join(stateDir, 'cards.json');
      let cardsJson;
      try {
        cardsJson = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
      } catch {
        sendJSON(res, 503, { ok: false, error: 'cards.json missing or unreadable — narrator must fill v2 fields' });
        return;
      }
      const err = validateCards(cardsJson);
      if (err) {
        sendJSON(res, 503, { ok: false, error: err });
        return;
      }
      // Sort cards by risk order
      const sorted = [...cardsJson.cards].sort(
        (a, b) => RISK_ORDER.indexOf(a.risk) - RISK_ORDER.indexOf(b.risk)
      );
      sendJSON(res, 200, { ...cardsJson, cards: sorted });
      return;
    }

    // ── GET /diff/:id ─────────────────────────────────────────────────────────
    if (method === 'GET' && pathname.startsWith('/diff/')) {
      const rawId = pathname.slice('/diff/'.length);
      const safeId = sanitizeId(rawId);
      if (!safeId) { send(res, 400, 'text/plain; charset=utf-8', 'Bad id'); return; }
      const diffPath = path.join(stateDir, 'diffs', safeId + '.txt');
      serveFile(res, diffPath);
      return;
    }

    // ── POST /event ───────────────────────────────────────────────────────────
    if (method === 'POST' && pathname === '/event') {
      readBody(req, MAX_EVENT_BODY).then(body => {
        let parsed;
        try { parsed = JSON.parse(body); } catch {
          sendJSON(res, 400, { ok: false, error: 'invalid JSON' });
          return;
        }
        const line = JSON.stringify(parsed) + '\n';
        fs.appendFileSync(path.join(stateDir, 'events'), line);
        sendJSON(res, 200, { ok: true });
      }).catch(err => {
        if (err.code === 'TOO_LARGE') {
          sendJSON(res, 413, { ok: false, error: 'body too large' });
        } else {
          sendJSON(res, 500, { ok: false, error: String(err.message) });
        }
      });
      return;
    }

    // ── POST /submit ──────────────────────────────────────────────────────────
    if (method === 'POST' && pathname === '/submit') {
      readBody(req, MAX_EVENT_BODY).then(() => {
        let cardsJson;
        try {
          cardsJson = JSON.parse(fs.readFileSync(path.join(stateDir, 'cards.json'), 'utf8'));
        } catch {
          sendJSON(res, 503, { ok: false, error: 'cards.json unreadable' });
          return;
        }
        let eventLines = [];
        try {
          const raw = fs.readFileSync(path.join(stateDir, 'events'), 'utf8');
          eventLines = raw.split('\n').filter(l => l.trim());
        } catch { /* no events file yet → empty */ }

        // Shim: decision.cjs expects title, not headline
        const { compile } = require('./decision.cjs');
        const shimmedCards = {
          ...cardsJson,
          cards: cardsJson.cards.map(c => ({ ...c, title: c.headline }))
        };
        let result;
        try {
          result = compile(shimmedCards, eventLines);
        } catch (e) {
          sendJSON(res, 409, { ok: false, error: e.message });
          return;
        }
        fs.writeFileSync(
          path.join(stateDir, 'decision.json'),
          JSON.stringify(result.decision, null, 2)
        );
        fs.writeFileSync(
          path.join(stateDir, 'prepared-message.txt'),
          result.message
        );
        sendJSON(res, 200, { ok: true });
      }).catch(err => {
        sendJSON(res, 500, { ok: false, error: String(err.message) });
      });
      return;
    }

    // ── 404 fallthrough ───────────────────────────────────────────────────────
    send(res, 404, 'text/plain; charset=utf-8', 'Not Found');
  });

  // Track connections for graceful close
  const connections = new Set();
  server.on('connection', conn => {
    connections.add(conn);
    conn.on('close', () => connections.delete(conn));
  });

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const actualPort = server.address().port;
      resolve({
        port: actualPort,
        close() {
          return new Promise(r => {
            // Destroy lingering connections
            for (const conn of connections) conn.destroy();
            server.close(r);
          });
        }
      });
    });
    server.on('error', reject);
  });
}

module.exports = { startServer };

// ── CLI mode ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  const contentDir = process.env.CONTENT_DIR || path.join(process.cwd(), 'content');
  const stateDir   = process.env.STATE_DIR   || path.join(process.cwd(), 'state');
  const host       = process.env.HOST        || '127.0.0.1';
  const port       = parseInt(process.env.PORT || '0', 10);

  fs.mkdirSync(contentDir, { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'diffs'), { recursive: true });

  startServer({ contentDir, stateDir, host, port }).then(({ port: actualPort, close }) => {
    const url = `http://${host}:${actualPort}`;
    const info = { type: 'server-started', port: actualPort, host, url, state_dir: stateDir };

    // Write server-info JSON
    fs.writeFileSync(path.join(stateDir, 'server-info'), JSON.stringify(info));
    // Write pid file for stop.sh
    fs.writeFileSync(path.join(stateDir, 'server.pid'), String(process.pid));

    process.stdout.write(JSON.stringify(info) + '\n');

    // Idle-exit after 30 minutes (unref so tests don't hang)
    const idleTimer = setTimeout(() => {
      close().then(() => process.exit(0));
    }, 30 * 60 * 1000);
    idleTimer.unref();
  }).catch(err => {
    process.stderr.write('shipgate-server failed to start: ' + err.message + '\n');
    process.exit(1);
  });
}
