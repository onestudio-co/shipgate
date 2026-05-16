# Studio Shipgate — v0.2

Purpose-built stepwise change reviewer for non-technical decision-makers (founders, PMs, designers). At the end of a Claude work cycle it turns "what changed" into rich, plain-language **Change Cards** — one per screen, decision-framed, with a human-terms before/after — reviewed in a browser, no diffs required.

Bundles `/turbo`: Shipgate is turbo's end-of-run human gate.

## What makes v0.2 different

- **Stepwise, one card at a time.** Each Change Card fills the screen. You action it (approve / request change / ask a question) and the next card appears automatically. No overwhelming list of everything at once.
- **Decision-framed cards.** Every card answers the questions a real decision-maker needs: what changed, why, what it means for the product or business, and the exact question being put to you. Cards include a before/after preview in plain English — what a person experiences, not a code diff.
- **Optional technical drawer.** "View technical detail" opens a slide-over with the raw diff for the technically curious. Everything in the card itself is jargon-free.
- **Editable summary before final submit.** After all cards are reviewed, a summary screen shows every verdict with its note, each editable in place. One "Submit review" button finalises.
- **Studio Shipgate brand.** Purpose-built UI — no shared chrome from other tools.

## How it works

### Operator (Claude — the narrator)

At the end of a work cycle the `shipgate` skill:

1. Determines the baseline (kickoff SHA → merge-base → last tag) and states the assumption.
2. Collects the full change-set (`git diff baseline..HEAD` + uncommitted) and groups hunks by **intent** (a feature, decision, or deletion) — not by file.
3. Writes a v2 **Change Card** for each group: headline, plain explanation (2–4 sentences), why, concrete impact, the explicit decision question, what happens on approve/push-back, and a human-terms before/after example. Risk-ordered: NEEDS-YOU → DELETION → BEHAVIOR → SAFE.
4. Writes `state/cards.json` and, for cards with `hasDiff: true`, the raw diff to `state/diffs/<id>.txt`.
5. Starts the server (`bash <plugin>/server/start.sh --project-dir <repo>`), reads `state/server-info` for the URL, and hands off to the reviewer. Nothing is live until the reviewer submits.
6. Next turn: reads `state/decision.json` and acts on each verdict — applies change notes, answers questions, proceeds on approvals.

The server validates every v2 field for presence. A 503 means a card is incomplete — the narrator rewrites it; it never thins the content to pass.

### Reviewer (the human)

1. Open the URL in your browser.
2. Read the first card. All the fields you need are on the card — no diffs, no code.
3. Choose an action in the footer:
   - **Approve** — you're happy, move on.
   - **Request change** — you want something different; add a note explaining what.
   - **Ask a question** — you need more information before deciding; add the question as a note.
4. The next card appears automatically. Use **← Back** to revisit any card.
5. After the last card, the Summary screen lists every decision. Edit any note in place, then click **Submit review**.
6. You'll see a "Sent — return to Claude" confirmation. Claude picks up the decision in the next turn.

**Keyboard shortcuts:** ← / → to move between cards; A to approve; C to request change; Q to ask a question.

## Commands

- `/shipgate` — run a review now (on demand).
- `/turbo` — autonomous work cycle; Shipgate is invoked automatically at the end as the human gate.

## Architecture

```
server/
  shipgate-server.cjs   purpose-built Node http server
  decision.cjs          decision compiler (round-trip bus)
  app/
    index.html          Studio Shipgate branded shell
    review.js           stepwise controller (nav, actions, drawer, summary, submit)
  start.sh / stop.sh    server launchers (write state/server-info, idle-exit)
  test/
    decision.test.cjs   decision compiler regression tests
    server.test.cjs     v2 contract validation + brand guard tests
skills/
  shipgate/
    SKILL.md            narrator contract — v2 Change Card schema + worked examples
```

### Endpoints

| method | path | description |
|---|---|---|
| GET | `/` | Studio Shipgate shell (`app/index.html`) |
| GET | `/app/review.js` | stepwise controller |
| GET | `/cards.json` | reads `state/cards.json`; 503 + message if any v2 field is empty |
| GET | `/diff/:id` | `state/diffs/<id>.txt`, text/plain; 404 if absent |
| POST | `/event` | append verdict JSONL to `state/events` |
| POST | `/submit` | compile → write `decision.json` + `prepared-message.txt` |

### State files

| file | written by | read by |
|---|---|---|
| `state/cards.json` | narrator (Claude) | server → browser |
| `state/diffs/<id>.txt` | narrator (Claude) | server `/diff/:id` → drawer |
| `state/server-info` | `start.sh` | narrator reads URL |
| `state/events` | browser → `/event` | `decision.cjs` |
| `state/decision.json` | `decision.cjs` via `/submit` | narrator next turn |
| `state/prepared-message.txt` | `decision.cjs` via `/submit` | user pastes to Claude (non-turbo) |
