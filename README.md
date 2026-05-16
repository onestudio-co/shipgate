# Studio Shipgate

**Plain-language change review for the people who decide — founders, PMs, designers — not engineers.**

When Claude finishes a cycle of work, Shipgate turns *"what changed"* into a
guided, one-thing-at-a-time review in the browser. Each change is a
**Change Card**: what changed, why, what it means for the product or business,
the exact decision being put to you, and a plain-English before/after — **no
diffs, no PRs, no red and green lines**. The technical detail is one optional
click away for anyone who wants it.

Shipgate also bundles **`/turbo`** — it is turbo's end-of-run human gate, so an
autonomous run still lands in front of a person who can actually approve it.

---

## The review is a conversation, not a form (v0.3)

Earlier versions showed every change and asked you to submit them all at the
end. v0.3 makes it **interactive and blocking**:

- **Approve → it flows.** Approving a card immediately moves to the next one.
  No round-trip, no waiting. Approvals never interrupt you.
- **Request a change / Ask a question → it blocks.** The review **pauses** on
  that card and tells you to go back to Claude. You don't review anything
  further past an unresolved item — no reviewing fiction.
- **Claude does the work, then you Continue.** Back in your terminal, Claude
  resolves it: a *question* gets answered; a *change* gets actually made —
  and Claude **re-narrates the remaining cards** so the rest of the review
  reflects reality, not the pre-edit state. It tells you when it's done; you
  click **Continue** and the next item unlocks.
- **It ends itself.** When nothing is left pending or blocked, you see
  **"✅ All reviewed — nothing left for Claude."** The decision record is
  written automatically. There is no batch "submit", and no going back —
  approved is approved, blocked waits on Claude.

Cards are shown **risk-first** (NEEDS-YOU → DELETION → BEHAVIOR → SAFE) so the
things that need your judgement come first. The UI is purpose-built and
branded — no borrowed chrome from other tools.

---

## How it works

### Operator (Claude — the narrator)

The `shipgate` skill runs at the end of a work cycle (or on demand via
`/shipgate`):

1. Determines the baseline (kickoff SHA → `merge-base` → last tag) and states
   the assumption.
2. Collects the change-set (`git diff baseline..HEAD` + uncommitted) and
   groups it by **intent** — a feature, a decision, a deletion — not by file.
3. Writes one v2 **Change Card** per group with every required field filled:
   headline, plain explanation, why, concrete impact, the explicit decision,
   what approve vs. push-back each lead to, and a human-terms before/after.
   Each card starts at `status: "pending"`.
4. Writes `state/cards.json` (+ `state/diffs/<id>.txt` for cards with
   `hasDiff`), starts the server with
   `bash <plugin>/server/start.sh --project-dir <repo>`, reads
   `state/server-info` for the URL, and hands the URL to the reviewer.
5. **While the review is live:** whenever the reviewer returns, Claude checks
   `state/cards.json` for a `blocked` card. A *question* → Claude writes the
   answer and marks it `resolved`. A *change* → Claude makes the edit,
   **re-narrates the still-pending cards**, marks the card `resolved`, and
   rewrites `cards.json`. Claude never advances the review itself — it tells
   the reviewer to click **Continue**.
6. When the queue empties the server writes `state/decision.json` +
   `state/prepared-message.txt` automatically; Claude reads them as the
   record (auto-applied under `/turbo`+`/loop`; otherwise the reviewer pastes
   the prepared message back).

The server enforces the contract: every v2 field must be present, or
`/cards.json` returns **503** with which field is missing — Claude rewrites
the card properly rather than thinning it to pass.

### Reviewer (the human)

1. Open the URL.
2. Read the card — everything you need is on it; no code required.
3. Footer actions:
   - **Approve** — happy → next card appears immediately.
   - **Request a change** — add a note saying what you want different.
   - **Ask a question** — add the question as a note.
4. After a change/question the screen says **Paused** — go to your Claude
   terminal. Claude handles it and tells you it's done.
5. Click **Continue** — the next item unlocks (the remaining cards may have
   been refreshed to match what Claude just changed).
6. When done you'll see **"✅ All reviewed — nothing left for Claude."**

**Keyboard:** `A` approve · `C` request a change · `Q` ask a question.

---

## Commands

- **`/shipgate`** — run a review of the current cycle now.
- **`/turbo`** — autonomous, parallel work cycle; Shipgate runs automatically
  at the end as the human gate.

## Install

```
claude plugin marketplace add /path/to/shipgate    # or the GitHub repo
claude plugin install shipgate@shipgate
```

Then restart / `/reload-plugins`. `/shipgate` and `/turbo` become available.

---

## Architecture

```
server/
  shipgate-server.cjs   purpose-built zero-dependency Node http server;
                        owns per-card status, auto-writes the final record
  decision.cjs          decision compiler (events → decision.json + message)
  app/
    index.html          Studio Shipgate branded shell (own CSS, offline)
    review.js           interactive controller: approve-flow, Paused/Continue,
                        risk-first resume, auto-complete
  start.sh / stop.sh    launchers — start.sh honors --project-dir (default $PWD)
  test/
    decision.test.cjs   decision compiler regression tests
    server.test.cjs     v2-contract validation, status transitions, brand guard
skills/
  shipgate/SKILL.md     narrator contract — v2 Change Card schema, worked
                        good-vs-bad examples, the active-review block contract
```

### Endpoints

| method | path | description |
|---|---|---|
| GET | `/` | Studio Shipgate shell |
| GET | `/app/review.js` | interactive controller |
| GET | `/cards.json` | validated, risk-sorted deck; per-card `status`; `complete` flag; auto-writes the record when complete; 503 if a v2 field is empty |
| GET | `/diff/:id` | `state/diffs/<id>.txt`, text/plain; 404 if absent |
| POST | `/event` | append verdict JSONL **and** set card `status` (`approve→approved`, `change`/`question`→`blocked`+note); 64 KB cap, 400 on bad JSON |
| POST | `/submit` | retained for compatibility — compiles the record (no longer the primary path) |

### State files

| file | written by | read by |
|---|---|---|
| `state/cards.json` | narrator (Claude); status updated by server & resolver | server → browser |
| `state/diffs/<id>.txt` | narrator | `/diff/:id` → technical drawer |
| `state/server-info` | `start.sh` | narrator (reads URL) |
| `state/events` | browser → `/event` | `decision.cjs` |
| `state/decision.json` | `decision.cjs` (auto, on completion) | narrator next turn |
| `state/prepared-message.txt` | `decision.cjs` (auto, on completion) | reviewer pastes to Claude (non-turbo) |

---

*Built by OneStudio. Private plugin — `onestudio-co/shipgate`.*
