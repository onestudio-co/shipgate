# Turbo Plan Format — File-Ownership DAG

Turbo extends the standard `writing-plans` task format with three required per-task fields. These enable safe parallel execution: the planner can prove no two tasks in the same wave write the same file.

## Required fields per task

```yaml
- id: T07
  description: Implement POST /api/foo handler
  files_write: [app/api/foo.ts]
  files_read:  [app/api/types.ts, app/db/schema.ts]
  wave: 2
  depends_on: [T03]
```

| Field | Meaning |
|---|---|
| `id` | Stable task identifier (e.g. `T01`, `T02`). Used in `depends_on` and team task ownership. |
| `description` | One-sentence task statement (imperative). |
| `files_write` | Concrete paths the task will create or modify. No globs. No TBDs. |
| `files_read` | Concrete paths the task will read but not modify. Used for context-handoff between teammates. |
| `wave` | Non-negative integer. Wave 0 has no `depends_on`. Wave N+1 tasks start after wave N implementers all complete. |
| `depends_on` | List of task IDs this task requires. Wave of this task MUST be strictly greater than the max wave of every dep. |

## Invariants the planner MUST enforce

1. **No write-write collision in a wave.** Within a single wave, no two tasks share any path in `files_write`. If they do, separate them across waves or merge them.
2. **Wave monotonicity.** For every `depends_on` link `A → B`, `B.wave > A.wave`.
3. **No placeholders.** Every entry in `files_write` and `files_read` is a concrete path. No globs (`**/*.ts`). No TBDs.
4. **Wave 0 is independent.** Wave 0 tasks have empty `depends_on`.

If the planner cannot satisfy these invariants in one rewrite, it falls back to single-wave serial execution and writes "DAG validation failed: <reason>" at the top of the plan.

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

Wave 1 has two tasks (T02, T03) writing to different files — safe to parallelize. Wave 2 (T04) waits for both.

## QA + lint coupling

QA and lint are NOT in the DAG. They are Workflow streams, not tasks (see
`references/workflow-script.md`). The QA stream reads each committed wave's `files_write` to
know what to test and writes test files (write-only — committed by the serialized committer,
not the QA agent). It does not gate the next wave; it pipelines alongside implementation.

The lint stream runs once per committed wave, read-only, and returns failures as structured
data. The coordinator turns each failure into a `lint-fix` task injected into the live wave,
dispatched to a fresh write-only implementer (the committer commits the fix). Lint is never a
DAG node up-front.
