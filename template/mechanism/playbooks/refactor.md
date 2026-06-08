# Playbook — refactor

Behavior-preserving code improvement. Gates must be green BEFORE and AFTER.
No new features, no bug fixes, no schema changes — pure structural improvement.

---

## Phases

| Phase | What happens |
|---|---|
| LOAD | Read this playbook + `.claude/kaizen/memory/facts.md` + domain maps for touched area |
| PREPARE | Planner captures the pre-refactor gate baseline; writes spec with exact scope boundary |
| EXECUTE | Implementers restructure code; committer stages only listed files; gates rerun after each wave |
| RETRO | Sensei records what structural pattern was improved |
| REPORT | Before/after gate results, list of files changed, behavior-preservation evidence |

---

## Cached answers

| Question | Answer |
|---|---|
| QA? | Skipped unless the area has existing vitest tests (run them to confirm no regression). |
| Lint? | Not configured — no eslint gate. |
| Gates (before)? | `./node_modules/.bin/tsc --noEmit` + `pnpm build` must pass BEFORE any code change. |
| Gates (after)? | Same gates must pass AFTER every wave. If they fail after, revert the wave. |
| Feature changes allowed? | No. Any feature change stops the refactor and starts a build ticket instead. |
| DB schema changes allowed? | No. Schema changes belong in a build ticket. |
| New `'use server'` exports allowed? | No new exports. Existing ones may be reorganized; all must remain async. |
| Package manager? | pnpm only. |
| tsc in worktree? | `./node_modules/.bin/tsc --noEmit` — never `pnpm exec tsc`. |

---

## The pre-refactor baseline rule

Before writing any code, run and record the baseline gate output:

```
./node_modules/.bin/tsc --noEmit   # must be zero errors
pnpm build                         # must succeed
```

Paste the last line of each output in the spec under "Baseline". If baseline
fails, the refactor STOPS — fix the existing failures as a separate fix ticket
first. Do not refactor on a red baseline.

---

## Known wave shapes

**Extract shared utility:**
```
wave 0: [new shared module]
wave 1: [update callers to import from shared module]
```

**Rename / reorganize across files:**
```
wave 0: [create new location, write new version]
wave 1: [update all import sites]
wave 2: [delete old location]
```

**Inline + simplify (reduce complexity):**
```
wave 0: [simplify the target file(s)]
```
(single wave if no cascading import changes)

Gates run after every wave before the next wave starts.

---

## Risks

- **Behavior change disguised as refactor** — the spec must state the exact
  invariant being preserved (e.g. "the public API of `lib/data/feed.ts` is
  unchanged"). Any change to exported types is a behavior change.
- **Red baseline** — refactoring on a red baseline makes it impossible to tell
  if the refactor broke something. Always confirm green before touching code.
- **FeedItem ripple** — `lib/data/feed.ts` exports are consumed by ~6 builders.
  A rename or signature change here requires a full ripple plan across waves.
- **`'use server'` sync export** — reorganizing server actions can accidentally
  introduce a sync export. `pnpm build` catches it; tsc does not.
- **Scope creep** — refactor PR that also sneaks in features or bug fixes.
  If a bug is found during refactor, open a separate fix ticket; do not fix it
  here.

---

## Questions the planner must NOT re-ask

- "What package manager?" — pnpm (facts.md).
- "What are the gates?" — tsc --noEmit + pnpm build, BEFORE and AFTER (this playbook).
- "Can we change the DB schema?" — no; belongs in build ticket.
- "Can we add new features?" — no; belongs in build ticket.
- "Where is the schema file?" — `lib/db/schema.ts`.
- "Where are server actions?" — `lib/actions/`.
- "Where is the feed data layer?" — `lib/data/feed.ts`.

---

## Skeleton spec template

```markdown
# Refactor spec — <what is being restructured>

Date: <YYYY-MM-DD>
Status: draft | approved

## Motivation

<Why this refactor — what structural problem does it solve?>

## Invariant being preserved

<Exact statement of what must not change — public API, behavior, data contracts>

## Baseline (run before touching code)

```
./node_modules/.bin/tsc --noEmit  →  <output, zero errors>
pnpm build                        →  <exit 0>
```

## Scope

Files in scope:
- `<file>` — <what changes>

Files explicitly OUT of scope:
- `<file>` — <why excluded>

## What will NOT change

- No new exports or behavioral changes.
- No DB schema changes.
- No new `'use server'` files or sync exports introduced.

## Wave plan

| Wave | Tasks |
|---|---|
| 0 | <task> |
| 1 | <task> |

## Post-refactor gate

- [ ] `./node_modules/.bin/tsc --noEmit` passes (zero errors, same as baseline)
- [ ] `pnpm build` passes
- [ ] (if vitest tests exist) `pnpm test` passes on the affected paths

## Assumptions

- **A1**: <assumption> [ASSUMPTION]

## Out of scope

- Feature changes (separate build ticket).
- Bug fixes (separate fix ticket).
- Prod deploy (manual: `vercel --prod --yes`).
```
