# Turbo's Superpowers Override Declaration

This document is the single source of truth for what turbo overrides and what it preserves. Other prompt files in this skill reference it; if there is a conflict between this file and another, this file wins.

## Overridden (turbo replaces these standard superpowers behaviors)

| Standard superpowers | Turbo replacement |
|---|---|
| `brainstorming` — scope decomposition discussion with user | **Auto-decomposition**: coordinator classifies the brief via concrete heuristics (feature count, subsystem-scale features, projected file collisions, projected task count). If oversized, dispatches the `decomposer` subagent which writes a multi-iter manifest at `docs/superpowers/turbo-manifests/<slug>-manifest.yml`. The coordinator then runs iter 1 of the manifest and chains the rest via `ScheduleWakeup` (when under `/loop` dynamic mode) or tells the user to re-invoke. The user can override decomposition with `--no-decompose`. |
| `brainstorming` — Q&A with user, one question at a time | Compressed brainstorm: coordinator drafts; a **domain expert agent** (if the project has one — scan `.claude/agents/*.md` and installed `domain-experts:*` agents) answers the open questions from its evidence-backed KB. If no domain expert exists, the `interviewer` subagent fills gaps from project context AND turbo logs a soft recommendation to create one via `domain-experts:domain-creator`. Hybrid Q&A: answer from context when possible, else apply default + log assumption. |
| `brainstorming` — spec approval by user | `advisor()` approval. If material concern after one rewrite, ship with concern noted in spec's "Open questions" section. |
| `writing-plans` — execution-mode prompt | Skipped. Execution is always a single dynamic `Workflow` script (see `references/workflow-script.md`). |
| `test-driven-development` — red-green per task | OFF. **Conditional QA**: tests are written only if (a) the project already has test infrastructure in use (configured runner + ≥1 existing test file) OR (b) the user explicitly requested tests in the `/turbo` invocation. Otherwise QA is skipped entirely. **Browser/E2E tests are never authored by turbo** — user can request via a post-DONE `/turbo --with-browser-tests` invocation. |
| `subagent-driven-development` — one implementer at a time | N **write-only** implementers (Sonnet) in parallel via `Workflow` `parallel()`, scaled to DAG wave width (cap 4). Implementers run no git; a **single serialized committer** commits each wave at its barrier (per-task by default, wave-level when tasks are small). This is the only execution path — no `TeamCreate`, no `TaskList` claiming. |
| Lint/typecheck per task | Read-only lint stream per wave inside the Workflow, pipelined against the next wave. Failures become fix tasks attached to the live wave, owned by the implementer who wrote that file. |
| Final user code-review handoff | Coordinator runs `requesting-code-review` against full diff; fixes applied via fresh implementer subagent before user sees the branch. |
| `finishing-a-development-branch` — present merge/PR/cleanup options to user | **Merge to base branch by default.** PR is opt-in via explicit `--pr` flag in the `/turbo` argument string (mirrors the TDD opt-in pattern). `--no-merge` (or "leave branch", "for review") restores the old behavior of leaving the branch on the worktree. Merge conflicts at integration → abort the merge, surface as Critical in final report. |

## Requirement: superpowers installed

Turbo is a precondition-gated skill: it **requires superpowers installed** (it overrides and
preserves superpowers skills). Setup step 2 in `SKILL.md` stops with an install instruction
if the `superpowers:*` skills are absent.

## Preserved (turbo does NOT override these)

- `verification-before-completion` — no completion claims without evidence. Non-negotiable.
- `systematic-debugging` — bugs found mid-flow still use the structured debug loop.
- `using-git-worktrees` — turbo always runs in a worktree. Non-negotiable.
- `requesting-code-review` — kept as the final-wave pass.
- `finishing-a-development-branch` — used to wrap up at the end.

## Hard stops (V1)

**Zero.** No operations pause for user nod inside turbo mode. Safe by construction because turbo always runs in a worktree on a non-main branch, and the user reviews the final diff before promoting it.

To re-enable a hard stop, edit the `## Hard stops` section in `SKILL.md`. Future versions may move this to `~/.claude/turbo.config.json`.
