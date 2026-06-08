# Kaizen Plan Format — File-Ownership DAG

Kaizen extends the standard `writing-plans` task format with three required per-task fields.
These enable safe parallel execution: the planner can prove no two tasks in the same wave
write the same file.

The DAG plan is produced by `kaizen-planner` in the PREPARE phase. It is stored at the path
`planPath` passed into the Workflow script. The engine reads it to group tasks into
`parallel()` wave arrays.

## Required fields per task

```yaml
- id: T07
  description: Implement POST /api/foo handler
  files_write: [app/api/foo.ts]
  files_read:  [app/api/types.ts, lib/db/schema.ts]
  wave: 2
  depends_on: [T03]
```

| Field | Meaning |
|---|---|
| `id` | Stable task identifier (e.g. `T01`, `T02`). Used in `depends_on` and agent task ownership. |
| `description` | One-sentence task statement (imperative). |
| `files_write` | Concrete paths the task will create or modify. No globs. No TBDs. |
| `files_read` | Concrete paths the task will read but not modify. Used for context-handoff between agents. |
| `wave` | Non-negative integer. Wave 0 has no `depends_on`. Wave N+1 tasks start after wave N implementers all complete. |
| `depends_on` | List of task IDs this task requires. Wave of this task MUST be strictly greater than the max wave of every dep. |

---

## INVARIANT — sensei must never edit

The following four invariants are copied verbatim from turbo 0.4.0. They are load-bearing
constraints on kaizen's parallel safety. Sensei is explicitly forbidden from editing this
section.

**1. No write-write collision in a wave.** Within a single wave, no two tasks share any
path in `files_write`. If they do, separate them across waves or merge them.

**2. Wave monotonicity.** For every `depends_on` link `A → B`, `B.wave > A.wave`.

**3. No placeholders.** Every entry in `files_write` and `files_read` is a concrete path.
No globs (`**/*.ts`). No TBDs.

**4. Wave 0 is independent.** Wave 0 tasks have empty `depends_on`.

If the planner cannot satisfy these invariants in one rewrite, it falls back to single-wave
serial execution and writes "DAG validation failed: <reason>" at the top of the plan.

---

## Wave-width cap

The planner MUST keep each wave at ≤4 tasks. This keeps `parallel()` well under the
`min(16, cores-2)` concurrency cap and prevents prompt-length blowup in the committer.

## Template-plan fast path (known patterns)

When the brief matches a registered repeatable pattern (e.g. an alarm-family: audit table
+ view + endpoint + tile + runbook), the planner emits the pattern's known DAG directly and
SKIPS the LLM planning pass. Evidence (exp 2026-06-08): on templated work a 3-strategy
planner panel produced an *identical* DAG for 4× the cost and the slowest build, and even a
single LLM planner crashed once mid-run. A deterministic template plan is faster and
crash-proof. Fallback order:

1. matched template DAG (no LLM), else
2. single planner (opus), else
3. canonical/hand-written DAG (the existing fallback).

Non-templated / open-ended briefs still use the single planner. A planner *panel* is only
worth its cost when the design space is genuinely open — never for pattern-work.

## Worked example

A small frontend feature with backend + frontend + tests:

```yaml
- id: T01
  description: Add User type to shared schema
  files_write: [packages/shared/src/types.ts]
  files_read: []
  wave: 0
  depends_on: []

- id: T02
  description: Implement GET /api/users handler
  files_write: [app/api/users/route.ts]
  files_read: [packages/shared/src/types.ts]
  wave: 1
  depends_on: [T01]

- id: T03
  description: Implement <UserList /> component
  files_write: [app/components/UserList.tsx]
  files_read: [packages/shared/src/types.ts]
  wave: 1
  depends_on: [T01]

- id: T04
  description: Wire <UserList /> into /users page
  files_write: [app/users/page.tsx]
  files_read: [app/components/UserList.tsx, app/api/users/route.ts]
  wave: 2
  depends_on: [T02, T03]
```

Wave 1 has two tasks (T02, T03) writing to different files — safe to parallelize. Wave 2
(T04) waits for both.

## QA + lint coupling

QA and lint are NOT in the DAG. They are Workflow streams, not tasks (see
`.claude/kaizen/engine/workflow-script.md`). The QA stream reads each committed
wave's `files_write` to know what to test and writes test files (write-only — committed by
the serialized committer, not the QA agent). It does not gate the next wave; it pipelines
alongside implementation.

The lint stream runs once per committed wave, read-only, and returns failures as structured
data. The coordinator turns each failure into a `lint-fix` task injected into the live wave,
dispatched to a fresh write-only implementer (the committer commits the fix). Lint is never a
DAG node up-front.

## DAG self-validation checklist

The planner runs this checklist before emitting the plan:

- **Write-write collisions per wave:** for each wave, assert every `files_write` path is
  unique across all tasks in that wave.
- **Wave monotonicity:** for every `depends_on` link, assert `dep.wave < task.wave`.
- **No placeholders:** assert every path is concrete (no `**`, no `TODO`, no `<TBD>`).
- **Wave 0 independence:** assert all wave-0 tasks have empty `depends_on`.
- **Wave-width cap:** assert no wave has more than 4 tasks.

If validation fails on any point, the planner must restructure the DAG or fall back to
single-wave serial and annotate the reason.

## Integration with kaizen memory

The `kaizen-planner` agent:
- Reads `.claude/kaizen/memory/facts.md` for project constraints (pnpm only, gates, etc.)
- Reads `.claude/kaizen/memory/agents/planner.md` for role-specific memory
- Reads the relevant domain maps from `.claude/kaizen/memory/domains/` for the touched areas
- Writes the spec and plan in ONE pass (no separate brainstorm phase)
- Returns a `PLANNER_RESULT` with `{ spec_path, plan_path, waves, tasks, assumptions, learnings? }`

The `[ASSUMPTION]` annotation in the spec marks anything the planner inferred without a
memory answer or interviewer confirmation. The retro reviews these and either promotes them
to facts or marks them as wrong.
