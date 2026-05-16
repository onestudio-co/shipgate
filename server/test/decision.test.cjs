const test = require('node:test');
const assert = require('node:assert');
const { compile } = require('../decision.cjs');

const cards = {
  baseline: 'abc123', title: 'PRD v2.0 restructure',
  cards: [
    { id: 'c1', title: 'PRD reorganised', risk: 'SAFE' },
    { id: 'c2', title: 'B2B/B2C left open', risk: 'NEEDS-YOU' },
    { id: 'c3', title: '43 docs removed', risk: 'DELETION' }
  ]
};

test('latest verdict per card wins; message is human-readable', () => {
  const events = [
    '{"type":"verdict","cardId":"c1","verdict":"question","note":"old"}',
    '{"type":"verdict","cardId":"c1","verdict":"approve","note":""}',
    '{"type":"verdict","cardId":"c2","verdict":"change","note":"make it a firm rule"}',
    '{"type":"verdict","cardId":"c3","verdict":"approve","note":""}'
  ];
  const { decision, message } = compile(cards, events);
  assert.equal(decision.baseline, 'abc123');
  assert.equal(decision.decisions.length, 3);
  const c1 = decision.decisions.find(d => d.cardId === 'c1');
  assert.equal(c1.verdict, 'approve');
  assert.match(message, /PRD v2\.0 restructure/);
  assert.match(message, /make it a firm rule/);
  assert.match(message, /Approved: 2/);
});

test('throws if a card has no verdict (incomplete review)', () => {
  assert.throws(() => compile(cards, ['{"type":"verdict","cardId":"c1","verdict":"approve","note":""}']),
    /incomplete/i);
});
