# Playbook — build

Standard feature implementation flow for this repo (Next.js, pnpm, Neon/Drizzle).
Produces committed, gate-passing code on a worktree branch.

---

## Phases

| Phase | What happens |
|---|---|
| LOAD | Read this playbook + `.claude/kaizen/memory/facts.md` + domain maps for touched areas |
| PREPARE | Planner produces spec + DAG plan in one pass; marks `[ASSUMPTION]` lines |
| EXECUTE | Waves of write-only implementers → serialized committer → reviewer → adversarial verify → fix |
| RETRO | Sensei updates memory, may self-edit playbook/agents within A6 rules |
| REPORT | Gate results, commit list, what was learned |

---

## Cached answers

| Question | Answer |
|---|---|
| Package manager? | pnpm only — never npm. |
| How to run tsc in worktree? | `./node_modules/.bin/tsc --noEmit` — NEVER `pnpm exec tsc`. |
| Build gate? | Per wave: `tsc --noEmit` in the worktree. Full `pnpm build` runs ONCE on the MAIN checkout AFTER merge, BEFORE push — `pnpm build` panics inside `.claude/worktrees/*` (turbopack.root resolves outside the symlinked node_modules). Run c1-feed-analytics: a worktree build "passed" but built main, missing the changes. |
| QA? | Skipped unless explicitly requested by user. |
| Lint gate? | Not configured — no eslint gate. |
| Integration mode? | Worktree. Engine creates/enters worktree; committer uses `git -C <worktree>`. |
| Next.js docs? | Read `node_modules/next/dist/docs` BEFORE writing any Next-specific code (breaking-changes fork). |
| DB changes? | Schema changes need manual `pnpm db:push` after merge; add a note in the spec. |
| `'use server'` rule? | Every export must be async. `pnpm build` catches it; tsc does not. |
| Prod deploy? | Manual `vercel --prod --yes` — never automated. Not part of the build playbook. |

---

## Known wave shapes

**Small feature (1-3 files):**
```
wave 0: [schema/types]
wave 1: [handler/action + component]
```

**Medium feature (4-8 files):**
```
wave 0: [db schema, shared types]
wave 1: [server action / API route, data lib]
wave 2: [UI components, page wiring]
```

**Large feature (>8 files):** split into two `/kaizen build` runs. First run
delivers backend + data layer; second run delivers UI. Never exceed 4 tasks
per wave (the width cap from `plan-format.md`).

Gate run after wave N before wave N+1 is dispatched (worktree-safe, fast):
`./node_modules/.bin/tsc --noEmit`

The full `pnpm build` gate runs ONCE — on the MAIN checkout AFTER merge, BEFORE
push (it panics inside a worktree). Run c1-feed-analytics used tsc-per-wave + one
post-merge build and saved ~3 full builds of wall-clock with no missed errors.

After the review pass: DEDUP raw findings BEFORE the adversarial verify step.
Run c1-feed-analytics produced 5 raw findings that deduped to 2 real ones — a 60%
duplicate rate (genesis had 0%) because separate lenses flagged the same line.
Dedup-before-verify avoids verifying the same finding multiple times.

---

## Risks

- **Breaking-changes Next fork** — code that looks correct from training data
  may not compile. Always read `node_modules/next/dist/docs` first.
- **`'use server'` sync export** — tsc passes, `pnpm build` fails. Gate runs
  `pnpm build` to catch it.
- **`pnpm exec` in worktree** — pnpm 11 deps-check tries to purge symlinked
  `node_modules`. Use the binary directly.
- **Prod database** — `.env.local` points at prod Neon. Dev writes go to prod.
  For isolated dev, run `./scripts/dev-setup.sh` first.
- **FeedItem ripple** — adding a field to `FeedItem` touches ~6 builders. Plan
  all ripple tasks in the same wave or the next sequential wave.
- **DB migration gap** — schema changes need manual push. Deploys do not
  auto-migrate; missing tables/columns cause 500 errors. POST-MERGE ORDER
  (run c4-ops-issues executed this cleanly; supersedes the bare "pnpm db:push"
  note): (1) merge worktree → main; (2) **introspect first** — read-only
  `information_schema` check whether the new columns already exist; (3) if absent,
  `./node_modules/.bin/drizzle-kit push --force` (non-TTY safe); (4) **verify** —
  re-introspect that the columns exist + are nullable as expected; (5) `pnpm build`
  on MAIN (green; confirm new routes appear in the route table); (6) `git push`;
  (7) `vercel --prod --yes` → wait READY; (8) smoke the new routes (expect the
  auth redirect, e.g. 307, on internal-gated pages). Introspect-first avoids a
  redundant push and proves the migration landed.

---

## Questions the planner must NOT re-ask

- "What package manager?" — pnpm (facts.md).
- "Do we need eslint?" — not configured; skip (facts.md).
- "What are the gates?" — tsc --noEmit + pnpm build (facts.md).
- "Should we write tests?" — vitest via `pnpm test`; 3 harvester tests fail
  spuriously under symlinked node_modules — they are not blockers (facts.md).
- "How to deploy?" — manual `vercel --prod --yes`; not in scope here (facts.md).
- "Where is the DB schema?" — `lib/db/schema.ts` (domain map: db.md).
- "Where are the server actions?" — `lib/actions/` (domain map: feed.md or relevant).

---

## Skeleton spec template

```markdown
# Spec — <title> (build)

Date: <YYYY-MM-DD>
Status: draft | approved
Worktree: `.claude/worktrees/<slug>-<date>`

## Problem

<what is missing or broken>

## Hard rules

- pnpm only.
- Gates: `./node_modules/.bin/tsc --noEmit` + `pnpm build`.
- Read `node_modules/next/dist/docs` before Next-specific code.
- <user constraint>

## Approved design

<what will be built>

### DB changes (if any)

- Schema file: `lib/db/schema.ts`
- Remember: manual `pnpm db:push` after merge.

### `'use server'` files touched

- <list> — all exports must be async.

## Assumptions

- **A1**: <assumption> [ASSUMPTION]

## Out of scope

- Prod deploy (manual step for the human).

## Open questions

None.
```
