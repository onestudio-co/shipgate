# Playbook — prototype

Output: a **frontend-only prototype** with rich fake data, plus the spec that
defines its data model. NO real app code is written. The run HARD-STOPS after
the prototype is presented; the user must approve it before anything else
happens. On approval, suggest `/kaizen build` — do not start it.

Order is fixed: **data model first → fake data second → prototype third.**

---

## Phases

| Phase | What happens |
|---|---|
| LOAD | Read this playbook + `.claude/kaizen/memory/facts.md` + `domains/ui.md` (visual conventions) + `domains/db.md` only if the prototype mirrors existing entities |
| PREPARE | Planner designs the **data model** (entities, fields, relations, states) and the screen list in one spec; interviews only on hard unknowns |
| EXECUTE | One implementer generates `fake-data.json` from the data model, then builds the static prototype that renders ONLY that data; one committer makes a single commit |
| RETRO | Sensei logs the session, updates memory (mandatory, even if the user rejects the prototype) |
| REPORT | Print spec path + prototype path + how to open it, then HARD STOP for approval |

---

## Cached answers

| Question | Answer |
|---|---|
| Does prototype produce app code? | No. Nothing under `app/`, `lib/`, `components/`. Output lives ONLY under `prototypes/<slug>/`. |
| What files? | `prototypes/<slug>/index.html` + `fake-data.json` + optional `styles.css` / `app.js`. Self-contained; opens via `open prototypes/<slug>/index.html`. No build step, no framework, no npm deps. |
| Gates? | None. No tsc, no `pnpm build` — the prototype is outside the app source. Smoke check = it renders in a browser with the fake data visible. |
| Backend / DB / server actions? | Forbidden. All data comes from `fake-data.json` loaded client-side. |
| Worktree? | Not needed — `prototypes/` never collides with app code. Work directly on main. |
| Commits? | Exactly ONE: `kaizen(prototype): <slug>` (plus sensei's separate retro commit). |
| QA? | Skipped. |
| Agents needed? | planner (+ interviewer if gaps), ONE implementer, ONE committer. No reviewer, no QA. |
| Where does the spec live? | `docs/superpowers/specs/<YYYY-MM-DD>-<slug>-design.md` — same spec is reused by the follow-up `/kaizen build`. |

---

## Fake data quality bar (non-negotiable)

The fake data is the heart of this workflow. It must be good enough that the
prototype looks like a screenshot of the finished product.

1. **Conforms exactly to the data model** in the spec — same entities, field
   names, types, and relations. The build run later reuses this file as seed
   fixtures, so drift here becomes drift in the real schema.
2. **Realistic domain content.** Real-sounding names, dates, amounts, and text
   written in the product's voice. NEVER "Lorem ipsum", "Test 1", "foo".
3. **Realistic volume.** Enough records that lists, feeds, and tables look
   alive — roughly 15–50 per primary entity, with related records linked by id.
4. **Edge cases included on purpose:** one very long title/name, one record
   with all optional fields empty, one zero-state collection, extreme dates
   (today, very old), and a few records per status/state in the model.
5. **One source of truth:** all data lives in `fake-data.json` and is rendered
   by the prototype's JS. Never hardcode records into the HTML markup.

### How to load the data (the `file://` gotcha)

`fetch('./fake-data.json')` SILENTLY FAILS when the prototype is opened via
`file://` (CORS blocks file reads), so the page renders empty when the user
just double-clicks `index.html`. The fix is a wrapper, not a server:

- Keep `fake-data.json` as the canonical contract (the build run reuses it).
- GENERATE `fake-data.js` from it that assigns `window.FAKE_DATA = { ... }`,
  and load that via `<script src="fake-data.js">`. The prototype's JS reads
  `window.FAKE_DATA` — no `fetch`, works over `file://`.
- Node's `require('./fake-data.json')` parses the canonical JSON directly, so
  you can smoke-check edge cases (long text, empty optionals, zero-state) with
  plain `node` assertions BEFORE writing any HTML — no test framework needed.

Evidence: run c12-flow-os-home-prototype (first prototype run; implementer hit
the `file://` fetch failure and shipped the `window.FAKE_DATA` wrapper +
`fake-data.json`/`fake-data.js` pair in commit ada51bf).

---

## Known wave shapes

Prototype has a fixed 3-step chain — no parallelism:

```
brief → [planner: data model + screens spec]
      → [implementer: fake-data.json, then index.html that renders it]
      → [committer: one commit]
      → HARD STOP — present to user, wait for approval
```

If the brief covers many screens, the planner trims to the 1–3 screens that
prove the concept and lists the rest under "Out of scope (prototype)". A
prototype that takes more than one implementer pass is over-scoped.

---

## HARD STOP — approval gate

After REPORT, the run is over. While waiting for the user's verdict:

- Do NOT write real code (no `app/`, `lib/`, `components/`, schema files).
- Do NOT start `/kaizen build`, write a plan, or do any other "extra work".
- Do NOT iterate on the prototype unless the user asks for changes.

Then, based on the user's verdict:

- **Approved** → suggest exactly this next step:
  `/kaizen build <brief> — implement the approved prototype at prototypes/<slug>/ using its spec and reusing fake-data.json as seed fixtures`
- **Changes requested** → revise ONLY the prototype/fake data, re-present,
  stop again.
- **Rejected** → stop. Sensei still runs the retro on the failed run.

---

## Risks

- **Real code leaks in** — the implementer "helpfully" adds a Next.js route,
  a schema change, or a shared component. Forbidden: everything stays under
  `prototypes/<slug>/`.
- **Data model skipped** — implementer invents data shapes while building UI.
  The planner's data model section is the contract; fake data is generated
  from it BEFORE any HTML is written.
- **Lazy fake data** — 3 records named "Item 1..3" make the prototype
  worthless for judgment. Apply the quality bar above.
- **Approval gate skipped** — the run rolls straight into build. The HARD
  STOP section above is the rule; build starts only after an explicit user
  "approved" and a new `/kaizen build` invocation.
- **Over-polish** — pixel-perfecting a throwaway. Good-enough visuals that
  match `domains/ui.md` conventions; the point is judging the concept and the
  data model, not shipping CSS.

---

## Questions the planner must NOT re-ask

- "What package manager?" — irrelevant here; the prototype has no deps.
- "What are the gates?" — none for prototypes (this playbook).
- "Where does the prototype live?" — `prototypes/<slug>/` (this playbook).
- "Should the prototype use React/Next?" — no; static HTML + vanilla JS (this playbook).
- "Where does the spec live?" — `docs/superpowers/specs/` (facts.md).

---

## Skeleton spec template

```markdown
# Spec — <title> (prototype)

Date: <YYYY-MM-DD>
Status: draft | prototype-approved | rejected
Prototype: `prototypes/<slug>/index.html`

## Problem

<what we want to validate before building for real>

## Data model (the contract)

### <Entity 1>
- field: type — notes (required/optional, states, relations)
- ...

### <Entity 2>
- ...

Relations: <Entity 1> 1—N <Entity 2>, ...
States: <entity>.status ∈ { ... }

## Screens (1–3 max)

1. <screen> — what it shows, which entities it renders
2. <screen>

## Fake data plan

- Volumes: <entity>: N records, ...
- Edge cases seeded: <list — long text, empty optionals, zero-state, ...>

## Assumptions

- **A1**: <assumption> [ASSUMPTION]

## Out of scope (prototype)

- Real implementation (waits for `/kaizen build` after approval)
- Backend, DB, auth, persistence
- <screens trimmed from the brief>

## Open questions

None.
```
