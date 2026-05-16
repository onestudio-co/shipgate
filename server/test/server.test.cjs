const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer } = require('../server.cjs');

function req(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: urlPath },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    r.on('error', reject); if (body) r.write(body); r.end();
  });
}

test('deck render + /event + /submit writes decision.json & prepared-message.txt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-'));
  const content = path.join(dir, 'content'); const state = path.join(dir, 'state');
  fs.mkdirSync(content); fs.mkdirSync(path.join(state, 'diffs'), { recursive: true });
  fs.writeFileSync(path.join(state, 'cards.json'), JSON.stringify({
    baseline: 'x1', title: 'T',
    cards: [{ id: 'c1', title: 'A', risk: 'SAFE', what: 'w', why: 'y', safety: 's', hasDiff: true }]
  }));
  fs.writeFileSync(path.join(state, 'diffs', 'c1.txt'), '- old\n+ new\n');
  const { port, close } = await startServer({ contentDir: content, stateDir: state, host: '127.0.0.1', port: 0 });
  try {
    const deck = await req(port, 'GET', '/');
    assert.match(deck.body, /Change Cards|shipgate|review/i);
    const diff = await req(port, 'GET', '/diff/c1');
    assert.match(diff.body, /\+ new/);
    await req(port, 'POST', '/event', '{"type":"verdict","cardId":"c1","verdict":"approve","note":""}');
    const sub = await req(port, 'POST', '/submit', '{}');
    assert.equal(sub.status, 200);
    const decision = JSON.parse(fs.readFileSync(path.join(state, 'decision.json')));
    assert.equal(decision.decisions[0].verdict, 'approve');
    assert.ok(fs.readFileSync(path.join(state, 'prepared-message.txt'), 'utf8').includes('Reviewed: T'));
  } finally { await close(); }
});
