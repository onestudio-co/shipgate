# Plan (file-ownership DAG) — `/kaizen harvest` workflow

Worktree: `/Users/devmsh/projects/shipgate-wt-kaizen-harvest`
Base: `main` (v0.7.0). Target: v0.8.0.

QA: skipped (no test infra). Lint: not-configured (markdown). Commit: per-task.

## Wave 1 — new files (parallel, disjoint)

- **T1 — kaizen-harvester agent**
  - files_write: `template/agents/kaizen-harvester.md`
  - depends_on: []
- **T2 — harvest playbook**
  - files_write: `template/mechanism/playbooks/harvest.md`
  - depends_on: []
- **T3 — harvest state dir (registry + ledger + readme)**
  - files_write: `template/mechanism/harvest/sources.md`, `template/mechanism/harvest/ledger.jsonl`, `template/mechanism/harvest/README.md`
  - depends_on: []
- **T4 — gitignore cache**
  - files_write: `.gitignore`
  - depends_on: []

## Wave 2 — integration (single task)

- **T5 — SKILL.md wiring**
  - files_write: `template/mechanism/SKILL.md`
  - depends_on: [T1, T2, T3]
  - Surgical edits only: router row + keywords; `harvest` workflow preset in Composable
    stages; harvester in role roster / agent list / quick-ref / memory layout; document
    the `harvest/` state dir. Do NOT regress v0.6.0 engine or v0.7.0 stages.

## Wave 3 — release (single task)

- **T6 — version bump + CHANGELOG + README**
  - files_write: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `CHANGELOG.md`, `README.md`
  - depends_on: [T1, T2, T3, T4, T5]
  - 0.7.0 → 0.8.0; prepend a diff-grounded `## [0.8.0]` CHANGELOG entry; refresh README
    "Latest — v0.8.0" callout.

## Invariants

- Every task writes a disjoint file set (no two same-wave tasks share a file).
- All paths absolute under the worktree; committer runs `git -C <worktree>`.
- Append-only: ledger.jsonl seeded with a `#` header line only.
