'use strict';
// Pure compiler: (cardsManifest, eventLines[]) -> { decision, message }
function compile(cards, eventLines) {
  const latest = new Map(); // cardId -> {verdict, note}
  for (const line of eventLines) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e && e.type === 'verdict' && e.cardId) {
      latest.set(e.cardId, { verdict: e.verdict, note: e.note || '' });
    }
  }
  const decisions = cards.cards.map(c => {
    const v = latest.get(c.id);
    if (!v) throw new Error(`Review incomplete: card ${c.id} ("${c.title}") has no verdict`);
    return { cardId: c.id, title: c.title, verdict: v.verdict, note: v.note };
  });
  const decision = {
    baseline: cards.baseline, title: cards.title,
    submittedAt: Math.floor(Date.now() / 1000), decisions
  };
  const approved = decisions.filter(d => d.verdict === 'approve');
  const changes = decisions.filter(d => d.verdict === 'change');
  const questions = decisions.filter(d => d.verdict === 'question');
  const lines = [];
  lines.push(`Reviewed: ${cards.title}.`);
  lines.push(`Approved: ${approved.length}. Changes requested: ${changes.length}. Questions: ${questions.length}.`);
  for (const d of changes) lines.push(`CHANGE — "${d.title}": ${d.note}`);
  for (const d of questions) lines.push(`QUESTION — "${d.title}": ${d.note}`);
  if (changes.length === 0 && questions.length === 0)
    lines.push('Everything approved — proceed.');
  else
    lines.push('Apply the changes above and answer the questions, then continue.');
  return { decision, message: lines.join('\n') };
}
module.exports = { compile };
