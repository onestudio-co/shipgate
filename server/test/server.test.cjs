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

    // POST /event approve
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

test('POST /event approve → card status becomes "approved" in cards.json; GET /cards.json reflects it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-approve-'));
  const contentDir = path.join(dir, 'content');
  const stateDir = path.join(dir, 'state');
  fs.mkdirSync(contentDir, { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'diffs'), { recursive: true });

  fs.writeFileSync(path.join(stateDir, 'cards.json'), JSON.stringify({
    baseline: 'abc123',
    title: 'Test Review',
    cards: [makeCard('c1')]
  }));

  const { port, close } = await startServer({ contentDir, stateDir, host: '127.0.0.1', port: 0 });

  try {
    // GET first — card has no status (defaulted to pending)
    const before = await req(port, 'GET', '/cards.json');
    assert.equal(before.status, 200);
    const beforeData = JSON.parse(before.body);
    assert.equal(beforeData.cards[0].status, 'pending', 'Default status should be pending');
    assert.equal(beforeData.complete, false, 'Should not be complete yet');

    // POST approve
    const ev = JSON.stringify({ type: 'verdict', cardId: 'c1', verdict: 'approve', note: '', ts: 1234 });
    const evRes = await req(port, 'POST', '/event', ev);
    assert.equal(evRes.status, 200);

    // Verify cards.json on disk was updated
    const onDisk = JSON.parse(fs.readFileSync(path.join(stateDir, 'cards.json'), 'utf8'));
    assert.equal(onDisk.cards[0].status, 'approved', 'Card status should be approved on disk');

    // GET /cards.json reflects approved status
    const after = await req(port, 'GET', '/cards.json');
    assert.equal(after.status, 200);
    const afterData = JSON.parse(after.body);
    assert.equal(afterData.cards[0].status, 'approved', 'GET /cards.json should return approved status');
  } finally {
    await close();
  }
});

test('POST /event change → card status becomes "blocked" with note stored', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-block-'));
  const contentDir = path.join(dir, 'content');
  const stateDir = path.join(dir, 'state');
  fs.mkdirSync(contentDir, { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'diffs'), { recursive: true });

  fs.writeFileSync(path.join(stateDir, 'cards.json'), JSON.stringify({
    baseline: 'abc123',
    title: 'Test Review',
    cards: [makeCard('c1')]
  }));

  const { port, close } = await startServer({ contentDir, stateDir, host: '127.0.0.1', port: 0 });

  try {
    // POST change verdict
    const ev = JSON.stringify({ type: 'verdict', cardId: 'c1', verdict: 'change', note: 'Please make it bigger', ts: 1234 });
    const evRes = await req(port, 'POST', '/event', ev);
    assert.equal(evRes.status, 200);

    // Verify cards.json on disk was updated with blocked status and blockNote
    const onDisk = JSON.parse(fs.readFileSync(path.join(stateDir, 'cards.json'), 'utf8'));
    assert.equal(onDisk.cards[0].status, 'blocked', 'Card status should be blocked on disk');
    assert.equal(onDisk.cards[0].blockNote, 'Please make it bigger', 'blockNote should be stored');

    // GET /cards.json reflects blocked status
    const cardsRes = await req(port, 'GET', '/cards.json');
    assert.equal(cardsRes.status, 200);
    const cardsData = JSON.parse(cardsRes.body);
    assert.equal(cardsData.cards[0].status, 'blocked', 'GET /cards.json should return blocked status');
    assert.equal(cardsData.complete, false, 'Should not be complete when a card is blocked');
  } finally {
    await close();
  }
});

test('POST /event question → card status becomes "blocked" with note stored', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-question-'));
  const contentDir = path.join(dir, 'content');
  const stateDir = path.join(dir, 'state');
  fs.mkdirSync(contentDir, { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'diffs'), { recursive: true });

  fs.writeFileSync(path.join(stateDir, 'cards.json'), JSON.stringify({
    baseline: 'abc123',
    title: 'Test Review',
    cards: [makeCard('c1')]
  }));

  const { port, close } = await startServer({ contentDir, stateDir, host: '127.0.0.1', port: 0 });

  try {
    // POST question verdict
    const ev = JSON.stringify({ type: 'verdict', cardId: 'c1', verdict: 'question', note: 'Why was this needed?', ts: 1234 });
    const evRes = await req(port, 'POST', '/event', ev);
    assert.equal(evRes.status, 200);

    // Verify cards.json on disk
    const onDisk = JSON.parse(fs.readFileSync(path.join(stateDir, 'cards.json'), 'utf8'));
    assert.equal(onDisk.cards[0].status, 'blocked', 'Question verdict should set status to blocked');
    assert.equal(onDisk.cards[0].blockNote, 'Why was this needed?', 'blockNote should be stored');
  } finally {
    await close();
  }
});

test('all cards approved/resolved → GET /cards.json has complete:true AND decision.json + prepared-message.txt written', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-complete-'));
  const contentDir = path.join(dir, 'content');
  const stateDir = path.join(dir, 'state');
  fs.mkdirSync(contentDir, { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'diffs'), { recursive: true });

  // Two cards: one will be approved, one will be resolved
  fs.writeFileSync(path.join(stateDir, 'cards.json'), JSON.stringify({
    baseline: 'abc123',
    title: 'Test Review',
    cards: [
      makeCard('c1'),
      makeCard('c2', { headline: 'Second card', plain: 'Second card plain text for a non-technical person.', why: 'Why second.', impact: 'Second impact.', decision: 'Second decision question.', ifApprove: 'Second if approve.', ifPushBack: 'Second if pushback.' })
    ]
  }));

  const { port, close } = await startServer({ contentDir, stateDir, host: '127.0.0.1', port: 0 });

  try {
    // Approve c1
    await req(port, 'POST', '/event', JSON.stringify({ type: 'verdict', cardId: 'c1', verdict: 'approve', note: '', ts: 1 }));

    // Mark c2 as resolved directly in cards.json (simulates Claude resolving a block)
    const raw = JSON.parse(fs.readFileSync(path.join(stateDir, 'cards.json'), 'utf8'));
    raw.cards[1].status = 'resolved';
    // Also need a verdict event for decision.cjs to work — post a change event that Claude resolved
    fs.writeFileSync(path.join(stateDir, 'cards.json'), JSON.stringify(raw));
    await req(port, 'POST', '/event', JSON.stringify({ type: 'verdict', cardId: 'c2', verdict: 'change', note: 'Fix it', ts: 2 }));

    // Manually set c2 status to resolved on disk (Claude would do this)
    const raw2 = JSON.parse(fs.readFileSync(path.join(stateDir, 'cards.json'), 'utf8'));
    raw2.cards[1].status = 'resolved';
    fs.writeFileSync(path.join(stateDir, 'cards.json'), JSON.stringify(raw2));

    // GET /cards.json → should be complete
    const cardsRes = await req(port, 'GET', '/cards.json');
    assert.equal(cardsRes.status, 200);
    const cardsData = JSON.parse(cardsRes.body);
    assert.equal(cardsData.complete, true, 'Should be complete when all cards approved/resolved');

    // decision.json and prepared-message.txt should have been written
    const decisionPath = path.join(stateDir, 'decision.json');
    assert.ok(fs.existsSync(decisionPath), 'decision.json should be written when complete');
    const msgPath = path.join(stateDir, 'prepared-message.txt');
    assert.ok(fs.existsSync(msgPath), 'prepared-message.txt should be written when complete');

    const msg = fs.readFileSync(msgPath, 'utf8');
    assert.ok(msg.includes('Reviewed: Test Review'), `prepared-message.txt should include review title: ${msg}`);

    // GET again → should not overwrite (idempotent)
    const decisionMtime1 = fs.statSync(decisionPath).mtimeMs;
    await req(port, 'GET', '/cards.json');
    const decisionMtime2 = fs.statSync(decisionPath).mtimeMs;
    assert.equal(decisionMtime1, decisionMtime2, 'decision.json should not be rewritten on second GET');
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

test('brand guard: review.js must not contain forbidden strings', () => {
  const reviewPath = path.join(__dirname, '..', 'app', 'review.js');
  const content = fs.readFileSync(reviewPath, 'utf8');
  assert.ok(!(/Superpowers|Brainstorming|return to the terminal/).test(content),
    'review.js must NOT contain Superpowers, Brainstorming, or "return to the terminal"');
});
