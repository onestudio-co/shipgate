'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer } = require('../shipgate-server.cjs');

function req(port, method, urlPath, body, contentType) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (body) headers['Content-Type'] = contentType || 'application/json';
    const r = http.request(
      { host: '127.0.0.1', port, method, path: urlPath, headers },
      res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      }
    );
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

// Build a minimal valid v2 card
function makeCard(id, overrides) {
  return Object.assign({
    id,
    headline: 'A headline',
    plain: 'Plain text a non-technical person fully understands.',
    why: 'Why this was done.',
    impact: 'Concrete impact on product.',
    decision: 'The explicit question.',
    ifApprove: 'What happens if approved.',
    ifPushBack: 'What happens if pushed back.',
    example: { before: 'Before state.', after: 'After state.' },
    risk: 'SAFE',
    hasDiff: false
  }, overrides);
}

function makeCardsJson(cardOverrides) {
  return JSON.stringify({
    baseline: 'abc123',
    title: 'Test Review',
    cards: [makeCard('c1', cardOverrides)]
  });
}

test('GET /cards.json → 503 when a card is missing "impact"', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-invalid-'));
  const contentDir = path.join(dir, 'content');
  const stateDir = path.join(dir, 'state');
  fs.mkdirSync(contentDir, { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'diffs'), { recursive: true });

  // Card missing 'impact' field
  const invalidCard = makeCard('c1', { impact: '' });
  fs.writeFileSync(path.join(stateDir, 'cards.json'), JSON.stringify({
    baseline: 'abc123',
    title: 'Test Review',
    cards: [invalidCard]
  }));

  const { port, close } = await startServer({
    contentDir,
    stateDir,
    host: '127.0.0.1',
    port: 0
  });

  try {
    const res = await req(port, 'GET', '/cards.json');
    assert.equal(res.status, 503, `Expected 503, got ${res.status}: ${res.body}`);
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /impact/, `Expected error to mention 'impact', got: ${parsed.error}`);
    assert.match(parsed.error, /narrator must fill v2 fields/i);
  } finally {
    await close();
  }
});

test('valid v2 cards.json: GET /cards.json 200, GET /diff/:id, POST /event, POST /submit', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-valid-'));
  const contentDir = path.join(dir, 'content');
  const stateDir = path.join(dir, 'state');
  fs.mkdirSync(contentDir, { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'diffs'), { recursive: true });

  // Valid v2 cards.json with hasDiff: true
  fs.writeFileSync(path.join(stateDir, 'cards.json'), JSON.stringify({
    baseline: 'abc123',
    title: 'Test Review',
    cards: [makeCard('c1', { hasDiff: true })]
  }));
  fs.writeFileSync(path.join(stateDir, 'diffs', 'c1.txt'), '- old line\n+ new line\n');

  const { port, close } = await startServer({
    contentDir,
    stateDir,
    host: '127.0.0.1',
    port: 0
  });

  try {
    // GET /cards.json → 200
    const cardsRes = await req(port, 'GET', '/cards.json');
    assert.equal(cardsRes.status, 200, `Expected 200, got ${cardsRes.status}: ${cardsRes.body}`);
    const cards = JSON.parse(cardsRes.body);
    assert.equal(cards.baseline, 'abc123');
    assert.equal(cards.cards.length, 1);

    // GET /diff/c1 → diff text
    const diffRes = await req(port, 'GET', '/diff/c1');
    assert.equal(diffRes.status, 200);
    assert.match(diffRes.body, /\+ new line/);

    // POST /event
    const eventBody = JSON.stringify({ type: 'verdict', cardId: 'c1', verdict: 'approve', note: '' });
    const eventRes = await req(port, 'POST', '/event', eventBody);
    assert.equal(eventRes.status, 200);

    // POST /submit
    const submitRes = await req(port, 'POST', '/submit', '{}');
    assert.equal(submitRes.status, 200, `Submit failed: ${submitRes.body}`);
    const submitParsed = JSON.parse(submitRes.body);
    assert.equal(submitParsed.ok, true);

    // Verify decision.json written
    const decisionPath = path.join(stateDir, 'decision.json');
    assert.ok(fs.existsSync(decisionPath), 'decision.json should exist');
    const decision = JSON.parse(fs.readFileSync(decisionPath, 'utf8'));
    assert.equal(decision.decisions[0].verdict, 'approve');

    // Verify prepared-message.txt written
    const msgPath = path.join(stateDir, 'prepared-message.txt');
    assert.ok(fs.existsSync(msgPath), 'prepared-message.txt should exist');
    const msg = fs.readFileSync(msgPath, 'utf8');
    assert.ok(msg.includes('Reviewed: Test Review'), `prepared-message.txt missing expected text: ${msg}`);
  } finally {
    await close();
  }
});

test('brand guard: index.html contains "Studio Shipgate" and no forbidden strings', () => {
  const indexPath = path.join(__dirname, '..', 'app', 'index.html');
  const content = fs.readFileSync(indexPath, 'utf8');
  assert.ok(content.includes('Studio Shipgate'), 'index.html must contain "Studio Shipgate"');
  assert.ok(!(/Superpowers|Brainstorming|return to the terminal/).test(content),
    'index.html must NOT contain Superpowers, Brainstorming, or "return to the terminal"');
});
