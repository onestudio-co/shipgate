# Playbook — build

Standard feature implementation flow. Produces committed, gate-passing code on a worktree
branch. The generic skeleton (LOAD → PREPARE → waves → type-check-per-wave → review) is
**stack-neutral**. The "Cached answers" below describe a REFERENCE stack (Next.js / pnpm /
Neon-Drizzle / Vercel); **your project's `facts.md` is the source of truth and OVERRIDES any
row that does not fit.** A non-Next / non-pnpm / non-web project (Vite, Python, Rust, mobile,
research/content) keeps the skeleton and substitutes its own gates and commands — see
"Non-reference stacks" below. Do not assume the reference stack; read `facts.md` first.

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

## Cached answers (REFERENCE stack — `facts.md` overrides per project)

These are defaults for the reference stack. Any row that contradicts the project's
`facts.md` loses — `facts.md` wins. On a fresh non-reference repo, treat the whole table as
"to be replaced by facts.md".

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

## Non-reference stacks (the skeleton is stack-neutral)

When `facts.md` says the project is NOT the reference stack, keep the build skeleton and swap
the specifics:

- **Gates.** The principle is unchanged: a FAST type/compile check per wave in the worktree,
  and ONE full build/test on the main checkout after merge. The COMMANDS come from `facts.md`
  (e.g. `vite build`, `tsc -b`, `cargo build`, `pytest`, `go build`). Do not assume
  `pnpm build` or `tsc --noEmit`.
- **"Read the framework docs first"** generalizes to *read the project's own conventions and
  the framework version's docs before writing framework-specific code* — not specifically
  `node_modules/next/dist/docs`.
- **The worktree-build hazard generalizes:** any build tool that resolves a project root
  (turbopack.root, nx/turbo, a monorepo bundler) may resolve OUTSIDE a symlinked worktree
  `node_modules` and silently build the wrong tree. Verify the gate ran against the worktree,
  or run the full build on main after merge (the safe default).
- **No DB / no server-action layer?** Skip those rows entirely — they are reference-only.

## Audit-first PREPARE (for audit / "make it strong" briefs)

When the brief is an AUDIT ("find everything wrong with X") or asks for a qualitative leap
("make X strong, not a small bump"), dispatch a READ-ONLY explore pass BEFORE the planner and
feed its findings into the planner brief. It corrects the framing cheaply — it can flip
"build this" into "this already exists; the real gap is Y", saving the planner from speccing
the wrong thing. Cheap and stack-neutral.

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

**Large feature (>8 files):** still ONE `/kaizen build` run — do NOT split into
backend-now / UI-later runs. Use more waves (schema → data/actions → components →
page wiring → admin/gating), each ≤4 tasks (the width cap from `plan-format.md`).
Splitting strands half-done WIP on `main` and spreads one feature's context across
sessions with no shippable value until both halves land — finish the whole feature
in one cycle and submit once. Evidence: user directive after a run split a feature
backend/UI and left the backend stranded.

Gate run after wave N before wave N+1 is dispatched (worktree-safe, fast):
`./node_modules/.bin/tsc --noEmit`

The full `pnpm build` gate runs ONCE — on the MAIN checkout AFTER merge, BEFORE
push (it panics inside a worktree). Run c1-feed-analytics used tsc-per-wave + one
post-merge build and saved ~3 full builds of wall-clock with no missed errors.

After the review pass: DEDUP raw findings BEFORE the adversarial verify step.
Run c1-feed-analytics produced 5 raw findings that deduped to 2 real ones — a 60%
duplicate rate (genesis had 0%) because separate lenses flagged the same line.
Dedup-before-verify avoids verifying the same finding multiple times.

## Review economics (exp 2026-06-08)

Across 5 build-orchestration variants, review/verify was 60-79% of all agent-work and the
verifier rubber-stamped (confirm rates 15/16 .. 26/26, including a *false* "missing
migration"). The review is the build cycle's real cost sink, not the build parallelism.
Rules:

- **Separate review phase, never overlapped with the build.** Overlapping it steals build
  concurrency slots and slows the build. (The build itself is cheap — dependency-pipelined.)
- **Dedup, then drop out-of-scope findings** (anything on a file the plan did not produce).
  A scope-creep finding once made a fixer build an unrequested subsystem and `git add -A`
  deleted a real deliverable.
- **Verify ONLY critical/major** findings adversarially (require quoted refuting evidence,
  default is_real=false). Send minor findings to ONE batched triage agent. Never one
  verifier per finding.
- **Scoped fixer + scoped commit:** the fixer edits only the confirmed-finding files (no new
  files, no deletes); the committer stages only those files (never `git add -A`).

This cut a real build's review from ~70% of the run to ~half, at **1 verify agent** instead
of 16, and dropped total tokens ~28% with zero scope creep.

## Worktree-per-lane (escalation only)

Default to a single shared worktree + the async commit-queue (the standard build path). Use
per-lane worktrees + merge-back ONLY when the DAG has ≥2 fully-independent lanes of ≥3 tasks
each — and FIRST pin shared conventions (component primitives, shared-file shapes) in the
spec, or isolated lanes diverge (exp 2026-06-08: two lanes independently chose different tile
implementations and changed a shared file's shape). Parallel commits are the fastest build,
but the merge + divergence cost is only worth it at real lane scale.

## Right-size EXECUTE: inline ↔ Workflow ↔ inline-parallel hybrid (smart, not rigid)

The Workflow engine's only benefit is PARALLEL writes; it carries a contamination tax (see
the hygiene gate below). Pick the lightest execution shape that fits the plan:

- **Inline on the main checkout** — when the plan is strictly serial (1 task/wave) or tiny.
  Inline SKIPS the reviewer agents, so the coordinator MUST self-review the full diff AND
  manually trace the READ path the write feeds before committing (a read-path bug passes
  type-check + build). Let the PLAN self-declare the inline path for serial-but-wave-shaped
  plans.
- **Workflow (worktree)** — the default for a genuinely parallel, multi-wave plan.
- **Inline-parallel HYBRID** — when ANOTHER process writes into the same checkout (a foreign
  session, a background worker) so the hygiene gate can't tell stray writes from foreign WIP,
  but the plan is genuinely wide: dispatch write-only implementer subagents via the plain
  Agent tool per wave (disjoint `files_write`, repo-absolute paths, NEVER git, never touch
  the foreign session's paths) with the COORDINATOR as the serialized committer (one gate per
  wave, one commit per task). Preserves the write/commit split with zero contamination;
  implementer learnings still flow.

## Post-EXECUTE hygiene gate (worktree contamination + stale base)

The "all writes land in the worktree" guarantee is NOT reliable in practice — Workflow
`agent()` calls can ALSO write into the main checkout, leaving a divergent unreviewed variant
that blocks the merge. BEFORE merging, the coordinator MUST:

1. Confirm stray agent processes have EXITED (a survivor keeps rewriting main between
   commands — re-check after a few seconds).
2. `git status` the main checkout; `git checkout HEAD -- <tracked strays>` and `rm <untracked
   orphans>`, preserving any unrelated in-progress work.
3. Re-run the type-check on main and confirm it is clean AND STABLE over a ~5s window (a green
   check can be overwritten by a straggler).

**Stale-base guard.** If the worktree was suspended while another session moved/rebased the
base branch, `git diff base..HEAD` shows main-side commits as FALSE deletions. Do not "fix"
them: gate every deletion/regression finding on a branch-lineage check (`git log base..HEAD
--name-only` of the branch's OWN commits), hard-scope any fixer to the plan's `files_write`,
and integrate a moved base by COPYING in-scope files + diff-review, never a blind merge.

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
