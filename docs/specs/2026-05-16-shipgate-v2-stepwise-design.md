# Design — shipgate v0.2: purpose-built stepwise reviewer

Date: 2026-05-16
Status: turbo redesign (advisor-reviewed in lieu of user spec approval)
Supersedes the UI/narration layer of: docs/superpowers/specs/2026-05-16-shipgate-plugin-design.md (in revxai)

## 1. Why v0.1 failed (verified in a real browser)

v0.1 forked the visual-companion brainstorm server. In a real browser the
product failed its purpose:

- **Wrong identity:** the page showed "Superpowers Brainstorming" and
  "Click an option above, then return to the terminal" — the forked
  brainstorm chrome was never replaced.
- **Not scrollable:** the forked frame constrained height/overflow; with >2
  cards the rest of the deck and the Submit bar were unreachable.
- **Cards not answerable:** title + one-line what/why/safety cannot support a
  real decision by a non-technical person.
- **Wrong paradigm:** one long list of all changes; should be paced,
  one-at-a-time, like the visual companion.
- **Verification blind spot:** CLI tests passed; the browser experience was
  never opened. Green CLI ≠ done.

## 2. Goal

A **purpose-built, stepwise** change reviewer (its own clean UI, not a fork):
one Change Card per screen, advance after each decision, branded "Shipgate",
scrollable, with rich self-contained decision-framed cards including a
human-terms before/after preview. Keep ONLY the proven round-trip bus
(local server + `state/` files + `decision.json` / `prepared-message.txt`)
and the tested `decision.cjs` compiler.

## 3. Decisions (user-set; turbo assumption log)

- [DECISION] Full redesign from scratch; discard forked `frame.html`/chrome.
- [DECISION] Stepwise: one card per screen, like the visual companion.
- [DECISION] Card depth bar = decision-framed + impact + options + a worked
  before/after example/preview.
- [DECISION] Keep decision.cjs + the round-trip bus + /event /submit /diff.
- [DECISION] Brand string is **"Studio Shipgate"** — verbatim from the user
  ("…instead of Studio Shipgate"). Used exactly in `app/index.html`, the
  `<title>`, and the verification grep. No abbreviation.
- [ASSUMPTION] Stepwise mechanics: action on a card auto-advances to the next;
  a Back control revisits prior cards; after the last card a final **editable
  summary** screen lists all decisions; Submit there finalizes.
- [ASSUMPTION] The before/after example is authored by the narrator (Claude)
  per card in human terms — NOT a diff. The raw diff stays in an optional
  drawer for the technically curious.
- [ASSUMPTION] Risk-first ordering still applies to the card sequence
  (NEEDS-YOU → DELETION → BEHAVIOR → SAFE).

## 4. Change Card v2 contract (the "answerable" bar)

Every card MUST contain (narrator writes these; UI renders them):

| field | content |
|---|---|
| `headline` | plain-language what changed, no jargon |
| `plain` | 2–4 sentences a non-technical person fully understands |
| `why` | why this was done |
| `impact` | concrete effect on product / user / business |
| `decision` | the explicit question being asked of the reviewer |
| `ifApprove` | what happens if they approve |
| `ifPushBack` | what happens if they request a change |
| `example` | `{ before: "...", after: "..." }` — human-terms preview, NOT a diff |
| `risk` | NEEDS-YOU \| DELETION \| BEHAVIOR \| SAFE |
| `hasDiff` | bool; if true, `state/diffs/<id>.txt` holds the real raw diff |

A card with any of `plain/why/impact/decision/ifApprove/ifPushBack/example`
empty is invalid — the server rejects the deck with a clear error so the
narrator must fill them (prevents v0.1 thin-card regression).

## 5. Stepwise UX

- **Shell:** branded header "Shipgate · <repo>", a progress bar
  "Change k of N", a scrollable card body, a fixed action footer.
- **Per card:** render all v2 fields with clear visual hierarchy; a
  collapsible-free **"View technical detail"** button → right slide-over
  drawer (scrollable `<pre>`, real diff from `/diff/:id`).
- **Actions (footer):** ✅ Approve · ✏️ Request change (note required) ·
  💬 Ask question (note required). Acting records the verdict and
  **auto-advances** to the next card. A **← Back** control returns to the
  previous card (verdict editable). Keyboard: ←/→ to move, A/C/Q for actions.
- **End:** after the last card, a **Summary** screen lists every card with
  its verdict + note, each editable in place; one **Submit review** button.
- **Submit:** POST /submit → `decision.cjs` → `state/decision.json` +
  `state/prepared-message.txt`; success screen "Sent — return to Claude".
- Scroll is correct by construction: normal document flow, body is the only
  scroll region, header/footer sticky; single card keeps content short anyway.

## 6. Architecture (purpose-built, not a fork)

```
server/
  shipgate-server.cjs   minimal Node http server (NEW — not the brainstorm fork)
  decision.cjs          KEPT verbatim from v0.1 (tested)
  app/
    index.html          Shipgate-branded shell (own CSS, no brainstorm chrome)
    review.js           stepwise controller (nav, actions, drawer, summary, submit)
  start.sh / stop.sh    NEW tiny launchers (write state/server-info, idle-exit)
  test/decision.test.cjs  KEPT (regression guard)
```

Endpoints (purpose-built, minimal):
- `GET /` → the branded shell (`app/index.html`, static).
- `GET /app/review.js` → controller (static).
- `GET /cards.json` → reads `state/cards.json` (server validates v2 contract;
  503 + message if invalid/missing so the skill knows to rewrite).
- `GET /diff/:id` → `state/diffs/<sanitized>.txt`, text/plain, 404 if absent.
- `POST /event` → append verdict JSONL to `state/events` (64KB cap, 400 on
  bad JSON — carried over from v0.1 M3 fix).
- `POST /submit` → `decision.cjs` compile → write `decision.json` +
  `prepared-message.txt`; 200 `{ok}` / 409 `{ok:false,error}` on incomplete.

Data shapes unchanged from v0.1 except `cards.json.cards[]` now uses the v2
contract (§4). `decision.json` / `prepared-message.txt` formats unchanged
(decision.cjs reused as-is; it keys off verdict events + card id/title only).

The brand/identity is fully owned: no "Superpowers"/"Brainstorming"/"return
to the terminal" strings anywhere. A verification grep enforces this.

## 7. Skill change (fixes "too concise")

`skills/shipgate/SKILL.md` narrator contract upgraded to the §4 v2 schema:
the narrator MUST write all rich fields + a concrete human-terms before/after
`example` per card + the real diff to `state/diffs/<id>.txt` when `hasDiff`.
Add an explicit "answerable test": if a non-technical reader would need to ask
"what does this mean / what am I deciding / what changes?", the card is
incomplete. One card per change-group; risk-first order.

**The contract enforces presence; the skill enforces depth.** SKILL.md MUST
include **2–3 worked good-vs-bad card examples** (a real change rendered the
thin v0.1 way next to the rich v2 way) so the narrator has a template, not
just a field list. Server-side non-empty validation is only the floor.

## 8. Verification (mandatory — closes the v0.1 blind spot)

1. `node --test server/test/*.cjs` green, including:
   - `decision.test.cjs` (kept, regression guard).
   - `server.test.cjs` (NEW): (a) `GET /cards.json` → **503 with a clear
     message** when any v2 field is empty/whitespace (regression-guards the
     v0.1 thin-card failure at load); (b) brand-grep — `app/index.html`
     contains "Studio Shipgate" and contains none of
     `Superpowers|Brainstorming|return to the terminal`.
2. CLI smoke: start.sh → server-info → GET /cards.json (valid) → /diff →
   /event → /submit → decision.json + prepared-message.txt.
3. **Real-browser gate (BLOCKING):** coordinator opens the URL in Chrome with
   a populated v2 `cards.json`, and confirms ALL of:
   - header reads "Shipgate" (grep+visual: NO "Superpowers"/"Brainstorming"/
     "return to the terminal" anywhere in served HTML/JS).
   - exactly one card visible; actioning advances; Back works; progress
     "Change k of N" correct.
   - body scrolls when content is long; drawer opens, shows the real diff,
     scrolls, closes.
   - all v2 fields render with hierarchy; before/after example present.
   - summary screen lists all verdicts, editable; Submit → success screen;
     `decision.json` + `prepared-message.txt` written.
   - **zero console errors.**
   - **automatable check:** the served HTML+JS grepped for
     `Superpowers|Brainstorming|return to the terminal` returns empty, and
     for `Studio Shipgate` returns a match.
   No DONE claim until this gate passes with a screenshot AND the grep result.

## 9. Out of scope (YAGNI)

SaaS/hosting/auth, mobile-offline, changing `/turbo` internals, multi-user,
the data-providers product. Pure local plugin UI/narration rebuild.

## 10. Deliverables

1. New purpose-built `server/shipgate-server.cjs` + branded `app/` shell &
   stepwise `review.js`; `decision.cjs` + its test retained.
2. New `start.sh`/`stop.sh`; old forked `server.cjs`/`helper.js`/`frame.html`/
   `start-server.sh`/`stop-server.sh` removed.
3. `skills/shipgate/SKILL.md` upgraded to the v2 narrator contract.
4. Updated server test for the v2 contract validation + the existing decision
   test; CLI smoke; **passed real-browser gate with screenshot evidence**.
5. Merge `turbo/shipgate-v2-stepwise-2026-05-16` → shipgate `main`.
