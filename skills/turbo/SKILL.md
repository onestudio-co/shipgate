---
name: turbo
description: Use when the user invokes /turbo, says "turbo mode", "yolo this", "ship this fast", or asks for an autonomous, parallel, no-Q&A version of the superpowers cycle. Executes each iteration as one dynamic Workflow — parallel write-only implementers + a serialized committer per wave, then adversarial review. Uses advisor() instead of user-approval, skips TDD by default. Always runs in a git worktree. Requires superpowers installed. Auto-decomposes oversized scope into a multi-iteration manifest and chains the remaining iterations via ScheduleWakeup so the user gets a single autonomous run from one /loop /turbo invocation.
---

# Turbo Mode

`/turbo <natural-language task>` runs an autonomous, parallel version of the superpowers cycle. Use it when you want speed and you trust the worktree-isolation safety net. The standard superpowers cycle is still the default for everything else.

Each iteration **executes as one dynamic `Workflow` script** (see `references/workflow-script.md`): parallel write-only implementers grouped by the file-ownership DAG, a single serialized committer per wave, and an adversarial review pass. There is no `TeamCreate` and no `TaskList` claiming — the Workflow is the execution engine.

For scope that won't fit a single turbo cycle (multi-subsystem briefs, "build all of these features", platform-scale work), turbo **auto-decomposes** into a multi-iteration manifest and runs each iter as its own turbo cycle. When invoked under `/loop` dynamic mode (recommended for multi-iter briefs), each iter ends by leaving the manifest clean for the next `/loop` firing, and the chain self-terminates when the manifest is exhausted — no user intervention between iters.

## Requirements

**Superpowers must be installed.** Turbo overrides and preserves superpowers skills (`verification-before-completion`, `using-git-worktrees`, `requesting-code-review`, `systematic-debugging`, `finishing-a-development-branch`). Without them turbo is not autonomous-safe. The Setup phase gates on this (step 2) and stops with an install instruction if superpowers is absent.

## What turbo overrides

See `references/overrides.md` for the canonical list. Summary:

- Brainstorm Q&A with user → **domain expert agent** (if the project has one) or interviewer subagent + assumption log
- Spec approval by user → `advisor()` approval
- TDD red-green per task → no tests by default. Tests are written only if the project has existing test infrastructure in use OR the user explicitly requested tests in the `/turbo` invocation. **Browser/E2E tests are never authored by turbo — request post-DONE.**
- Lint per task → one read-only pass per wave, pipelined against the next wave
- Plan execution-mode prompt → hardcoded Workflow execution
- One implementer at a time → N write-only implementers in parallel via `Workflow` `parallel()`, committed by a serialized per-wave committer
- "Push branch, leave for human merge" → **merge to base branch by default** at end of run. PR is opt-in via explicit `--pr` flag (mirrors the TDD opt-in pattern).

What turbo does NOT override: `verification-before-completion`, `using-git-worktrees`, `requesting-code-review`, `systematic-debugging`, `finishing-a-development-branch`.

Turbo and `shipgate` are **fully separate skills**. Turbo does NOT invoke shipgate at end-of-run. Turbo's human gate is the user reviewing the final merged diff / final report. The user runs `shipgate` separately, on demand, when they want the non-technical Change Card review.

## Hard stops

**Zero mid-flow hard stops in V1.** Force-push, prod deploys, secret writes, schema drops — all execute without confirmation. The intended safety net is that turbo always runs in an isolated worktree on a non-main branch, and the user reviews the final diff before promoting it. (The superpowers precondition in step 2 is a *precondition* check, not a mid-flow hard stop.)

> **Isolation depends on an unverified runtime fact.** The worktree net only holds if the iteration Workflow's agents write to the worktree, not the main checkout. This is not yet confirmed — see the "Runtime invariant to verify" section in `references/workflow-script.md`. Until it is, the coordinator MUST make every implementer/committer path worktree-absolute (`git -C ${worktree} …`) and run the one-agent cwd probe before the first real run. Do not lean on "safe by construction" until the probe passes.

To re-enable a hard stop, edit this section and add a list:

```
## Hard stops

- destructive-git
- prod-deploy
- secrets
- db-migration
```

## Critical-path flow

### Setup
1. Parse the task description from the `/turbo` arguments. Strip any flags (`--pr`, `--no-merge`, `--with-tests`, `--no-decompose`, `--continue`) into a flags map; keep the natural-language brief separately.
2. **Superpowers precondition gate.** Confirm superpowers is installed (the `superpowers:*` skills are available, e.g. `superpowers:using-git-worktrees`). If absent, **stop** and tell the user: "Turbo needs superpowers installed to run safely (worktree isolation, verification, code-review). Install it, then re-invoke /turbo." Do NOT proceed without it.
3. Derive a **stable task slug** from the brief. Method: lowercase the first ~80 chars of the brief, replace non-alphanumerics with `-`, collapse repeats, trim to 50 chars. This slug identifies the brief across iterations and must match across re-invocations (so manifests resume cleanly). Persist it.
4. **Manifest resume check.** Look for `docs/superpowers/turbo-manifests/<task-slug>-manifest.yml` (relative to repo root).
   - **Found, has pending iter:** load the manifest. This run = the next iter whose `status == pending` (or `in_progress` from an abandoned prior run). Skip scope detection + decomposition; skip to step 7 with that iter's scope as the brief.
   - **Found, all iters completed:** report "manifest already complete" to the user with the path. Do NOT recreate. Exit without running.
   - **Not found:** proceed to scope detection (step 5).
5. **Scope detection** (skip if `--no-decompose` flag set OR if `--continue` flag set on a missing manifest — in the latter case, error and ask the user to re-invoke without `--continue`). Coordinator (Opus) classifies the brief as **single-iter** or **oversized** using these heuristics; oversize if ANY trigger fires:
   - **Feature-count trigger:** the brief enumerates ≥5 distinct feature initiatives (e.g. "do all 7 of …", "build X, Y, Z, A, B").
   - **Subsystem trigger:** any one feature is subsystem-scale — rewrites auth, tenant model, persistence layer, build system, framework version, or anything pervasive (multi-tenancy, RBAC rewrite, framework upgrade, monorepo migration).
   - **Collision trigger:** ≥3 features in the brief would write the same hot shared file. Identify hot shared files by a quick `git ls-files | xargs wc -l 2>/dev/null | sort -rn | head -20` style scan or by project knowledge (e.g. mega `page.tsx` files >800 lines).
   - **Task-count trigger:** rough projection >10 implementer tasks across the brief.
   Persist the decision and trigger(s). Example: `[Scope: oversized — feature-count=7, subsystem=multi-tenancy, collision=app/operator/page.tsx]`. `[Scope: single-iter — feature-count=3, no triggers]`.
6. **Decomposition** (only if oversized in step 5).
   - Build a `feature_inventory` (parse the brief, list candidate features with one-liners).
   - Build a `project_context` summary: hot shared files, recent iteration cadence, any feedback memories that constrain scope (e.g. postponed integrations).
   - Dispatch the **decomposer** subagent using `prompts/decomposer.md` (Opus), with a `DECOMPOSER_RESULT` schema. Pass `task_brief`, `slug`, `feature_inventory`, `project_context`.
   - Decomposer writes the manifest to `docs/superpowers/turbo-manifests/<task-slug>-manifest.yml` and returns the first pending iter.
   - **This run = iter 1 of the manifest.** Iter 2..N will be picked up by future re-entries via the manifest resume check (step 4).
   - Report to the user before continuing: "Scope oversized. Decomposed into N iterations. Manifest at <path>. Starting iter 1: <iter-1 name>." If the user is NOT inside `/loop` dynamic mode (see step 25 for detection), append: "Run `/loop /turbo <verbatim brief>` to chain the remaining iterations automatically; otherwise re-invoke `/turbo --continue <verbatim brief>` after this iter completes."
7. **Create the worktree** for THIS iter via `superpowers:using-git-worktrees`. Branch name: `turbo/<iter-slug>-<YYYY-MM-DD>` where `<iter-slug>` is:
   - the manifest's `iterations[k].id` if this run came from a manifest, otherwise
   - the task slug from step 3.
   **Worktree creation is non-negotiable. If it fails, abort and surface the error.**
8. Switch all subsequent work into the worktree. Update the manifest iter's `status: in_progress` and `branch: <branch-name>` (if running from a manifest); save manifest.

### Brainstorm (compressed, parallel)
9. As coordinator (you, Opus), draft the design from the task description + project memory + a quick codebase scan.
10. **Answer the brainstorm gaps — domain expert first.**
    - **Detection:** does the project have a domain expert agent that fits this work? Scan `.claude/agents/*.md` and installed `domain-experts:*` plugin agents (e.g. `domain-experts:nala`).
    - **If a fitting domain expert exists:** dispatch THAT agent (via `agentType`) to answer the open brainstorm questions. It carries an evidence-backed knowledge base, so its answers beat generic context-guessing. Its answers feed the assumption log.
    - **If none exists:** dispatch the interviewer subagent (`prompts/interviewer.md`, Opus) as the fallback, AND surface a one-line **soft recommendation** in the final report: "No domain expert for this project. Create one with `domain-experts:domain-creator` (from github.com/onestudio-exp/domain-experts) to sharpen future turbo runs." Do NOT block the run on this.
11. Merge: integrate the answers. Every `[ASSUMPTION]` tag becomes a line in the spec's "Assumptions" section.
12. Call `advisor()` for design review. If material concern → rewrite once, re-pass. If still material concern → ship with concern noted in spec's "Open questions". Light suggestions → incorporate inline.

### Plan
13. Dispatch a planner subagent using `prompts/planner.md` (Opus), with a `PLANNER_RESULT` schema. Pass it the merged design + assumption log. It writes both the spec file and the DAG-annotated plan file (see `references/plan-format.md`) and returns the wave structure as structured data.
14. Call `advisor()` for plan review. Same fallback as step 12.
15. Note the plan's wave count and max wave width. The max wave width sets your per-wave implementer fan-out (cap 4).

### Execution config
16. **Test-infra detection.** Decide whether the Workflow's QA stream runs. QA is active iff at least one is true:
    - **Existing test infra in use.** The project's test runner is configured AND ≥1 existing test file:
      - JS/TS: `package.json` has a `test` script AND `find . \( -name "*.test.*" -o -name "*.spec.*" \) -not -path "*/node_modules/*"` returns ≥1 file.
      - Python: `pyproject.toml` has pytest configured (or `pytest.ini` exists) AND `find . \( -name "test_*.py" -o -name "*_test.py" \)` returns ≥1 file.
      - Rust: `Cargo.toml` exists AND (`tests/` directory exists OR `grep -r "#\[test\]" src/`).
      - Ruby: `Gemfile` mentions rspec AND `spec/` exists with ≥1 `*_spec.rb`.
    - **Explicit request in the `/turbo` argument string** (case-insensitive match): `--with-tests`, `--tests`, `--coverage`, `write tests`, `add tests`, `include tests`, `with coverage`, `TDD this`.

    Persist the QA decision and reason. Examples: `[QA: active — vitest configured + 47 test files]`, `[QA: active — user passed --with-tests]`, `[QA: skipped — no test infra and no explicit request]`.

17. **Lint-config detection.** Decide whether the Workflow's per-wave read-only lint stream runs. Lint is **configured** iff a real linter config exists (not just a TypeScript compile gate):
    - JS/TS: `package.json` has an `eslintConfig` key OR `.eslintrc.*` exists OR `eslint.config.*` exists OR `biome.json` exists.
    - Python: `pyproject.toml` has `[tool.ruff]` OR `[tool.flake8]` OR `.ruff.toml`/`.flake8` exists.
    - Rust: always `configured` — `cargo clippy` is always available.
    - Ruby: `.rubocop.yml` exists.

    Persist the decision. Examples: `[Lint: configured — eslint.config.mjs detected]`, `[Lint: not-configured — TS strict is the de-facto gate]`.

### Execute the iteration (single Workflow)
18. **Author and run the iteration Workflow** following `references/workflow-script.md`. First **resolve the base branch** (the command in step 24) so the Review phase can diff against it. Pass `args`: `{ worktree, specPath, planPath, waves, qaActive, lintConfigured, baseBranch }` where `waves` is the DAG grouped by wave (each task carries `id`, `description`, `files_write`, `files_read`).

    The script enforces the **write/commit split**: within each wave, implementers run in `parallel()` and are **write-only** (they create/modify their `files_write`, run `verification-before-completion`, and return — **no git**). At the **wave barrier**, a **single serialized committer** commits the wave (one git process → no `.git/index.lock` race). Read-only lint + QA stream against the next wave's writes.

    **Commit granularity** (passed to the committer per wave): commit **per task** by default; collapse to a single **wave-level** commit only when every task in the wave is small (writes ≤1 file AND ≤~40 changed lines). Persist the per-wave choice, e.g. `[Commit: per-task — wave 2 has 2 large tasks]`.

    **Why a Workflow, not a team:** the pipelined wave loop is exactly `pipeline()`/`parallel()`; agent returns are `schema`-validated (no prose parsing); the completion `<usage>` block yields per-iter `subagent_tokens` + `duration_ms` telemetry for free.

19. **Implementer failures inside the Workflow** are handled per the Failure-handling table: a `blocked`/`needs_context` task is re-dispatched with more context (escalate Sonnet→Opus, then split) BEFORE its wave is committed. The other tasks in the wave are not redone.

### Final pass (Review phase of the Workflow)
20. The Workflow's **Review phase** runs `superpowers:requesting-code-review` semantics as a fan-out: multiple review lenses (correctness, security, perf, scope) over the full worktree diff vs the base branch, in `parallel()`. This is the primary quality gate; when QA is off, it is THE quality gate.
21. **Adversarially verify each finding.** Every review finding is checked by a skeptic agent (`VERIFY_VERDICT` schema) that tries to refute it. Only findings confirmed real survive. This keeps plausible-but-wrong findings from generating churn.
22. Confirmed findings → one fix agent applies them, then the serialized committer commits the review fixes. Re-run lint once if configured; if green, proceed. If not, see Failure handling.

### Integration
23. **Integration-mode detection.** Decide how to land the branch. The default is **merge** — the run produced a complete, reviewed, lint-clean branch and the autonomous-loop pattern (and most workflows) needs it to land for follow-up work to build on top. Other modes are opt-in via explicit flag, mirroring the TDD opt-in pattern.

    Detect mode from the original `/turbo` argument string (case-insensitive substring match), in priority order:

    | Pattern in `/turbo` args | Mode |
    |---|---|
    | `--pr`, `as PR`, `open PR`, `with PR`, `as a pull request` | **pr** |
    | `--no-merge`, `no merge`, `don't merge`, `leave branch`, `for review` | **no-merge** |
    | (nothing above matches) | **merge** (default) |

    Persist the integration decision and reason. Examples: `[Integration: merge — default]`, `[Integration: pr — user passed --pr]`, `[Integration: no-merge — user said "leave branch for review"]`.

24. **Execute the integration.** Resolve the base branch via `git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@'`; fall back to `main` if no remote-HEAD is set, then `master`. Then act per mode:

    - **merge** (default):
      1. `git checkout <base>`
      2. `git merge --no-ff turbo/<slug>-<date> -m "merge: <iteration scope>"`
      3. If a remote exists: `git push` (non-fatal if it fails — log and continue).
      4. Worktree cleanup is optional — leave the directory in place so the user can inspect or delete with `git worktree remove`. Do NOT delete the branch (the merge commit references it; the user can prune later).

    - **pr**: requires a GitHub remote AND `gh` CLI authenticated.
      1. `git push -u origin turbo/<slug>-<date>`
      2. `gh pr create --base <base> --head turbo/<slug>-<date> --title "<title>" --body "<body>"` — use the structured Report (below) as the PR body.
      3. Return the PR URL to the user.
      4. If `gh` is missing or auth fails → fall back to **merge** mode with a warning logged in the final report.
      5. If no GitHub remote → fall back to **merge** mode with a warning logged in the final report.

    - **no-merge**: do nothing. Branch stays on the worktree for the user to inspect.

    **Merge conflict:** if `git merge` exits non-zero, run `git merge --abort`, leave the branch alone, and report the conflict as a Critical issue in the final report. Do not attempt auto-resolution — surface to the user. (Conflicts should be rare because the worktree branched from `<base>` and `<base>` was not modified during the turbo run; conflicts indicate concurrent work on `<base>`.)

25. **Manifest progression** (only if this run came from a manifest — i.e. step 4 or step 6 loaded a manifest).
    - Update the current iter's record: `status: completed`, `merge_commit: <SHA from step 24>`, `completed_at: <ISO timestamp>`, `spec_path` / `plan_path` populated. Save the manifest.
    - Scan the manifest for the next iter whose `status == pending`.
    - First detect the invocation mode by looking at the most recent user-turn message that triggered this run. If it starts with `/loop ` (or was clearly re-fired by /loop), you are under **loop dynamic mode**. Otherwise the user invoked `/turbo` **standalone**.

    - **Under `/loop` dynamic mode** (recommended for multi-iter manifests): **do NOT call `ScheduleWakeup` yourself.** `/loop` is the driver and is responsible for scheduling the next wakeup at end-of-turn. Your job is just to leave the manifest in a clean state so the next `/loop` firing — which re-invokes `/turbo` with the same brief — finds the right next iter via step 4. Make sure the manifest's current-iter status is `completed` (or `failed` per step 26) before exiting, and surface the iter result in the final report so `/loop` can decide whether to keep scheduling.

    - **Standalone `/turbo`** (not under `/loop`): chaining is the user's responsibility. Do NOT call `ScheduleWakeup` — it's gated to `/loop` dynamic mode and won't fire here. Append the chain instruction to the final report instead: "Iter <id> complete. To run iter <next-id>, invoke `/turbo --continue <verbatim brief>` (or wrap the original invocation: `/loop /turbo <verbatim brief>` to chain all remaining iters automatically)."

    - **If no next pending iter exists** (all iters completed): mark the manifest's top-level `status` (if present) as `completed`. Final report announces "Manifest <slug> fully shipped: N/N iters completed." Under `/loop` this signals the driver to terminate the loop.

26. **Iter failure handling.** If the current iter cannot complete cleanly (worktree creation failed, merge conflict, advisor still material-blocking after 2 rewrites, irreducible lint or implementer blockage):
    - Mark the iter `status: failed` in the manifest with a `notes` field describing the blocker.
    - Do NOT auto-chain. Omit `ScheduleWakeup`.
    - Surface the failure as the final report's primary message. The user decides whether to retry, edit the manifest, or abandon.

27. **Report to the user:**
    - Branch name
    - **Integration status**: merged to `<base>` (with merge commit SHA) OR PR opened (with URL) OR left on branch (with reason)
    - **Manifest status** (only if running from a manifest): "Iter <id> (<position>/<total>) complete. Next: <next-id>." OR "Manifest fully shipped." OR "Iter failed: <reason> — chain paused."
    - Summary of changes (diff-stat)
    - **Telemetry**: `subagent_tokens` + `duration_ms` from the Workflow completion `<usage>` block (use to tune the oversize heuristics and wave-width cap over time)
    - List of `[ASSUMPTION]` items from the spec
    - **QA status**: active (with file count) OR skipped (with reason)
    - **Domain expert status**: used `<agent>` OR "none — recommend creating one via domain-experts:domain-creator"
    - List of any `LINT-DEBT` annotations
    - **Post-DONE test invitation** (only if QA was skipped OR if browser-test coverage might be wanted): "Tests were not written. Re-invoke `/turbo --with-tests "<scope>"` to add unit/integration tests, or `/turbo --with-browser-tests "<scope>"` to add E2E coverage." Browser tests are only ever generated via this post-DONE path.

## Failure handling

| Failure | Response |
|---|---|
| Implementer returns `blocked` | Re-dispatch with more context BEFORE committing the wave. Still blocked → escalate Sonnet→Opus. Still blocked → split the task. |
| Implementer returns `done_with_concerns` | Read concerns. If correctness/scope → fix before committing the wave. If observation → proceed; log in final report. |
| QA returns `done_with_concerns` ("QA gap") | Log in final report. Proceed. |
| Advisor disagrees with spec/plan | Rewrite once. Still disagrees → ship with disagreement noted. Cap: 2 rewrite iterations per artifact. |
| Lint fails 3× on same file | Ship with `// LINT-DEBT: <reason>` annotation. File the issue as a task in the final report. |
| Two tasks in a wave write the same file | Should be impossible if DAG invariants hold. If the planner emitted it, halt the wave, surface the planner bug to the user, do not auto-recover. |
| Committer hits `.git/index.lock` | Should be impossible — the committer is the only git writer and runs serialized at the wave barrier. If it happens, a stray git process exists; surface to the user. |
| Worktree creation fails | Hard abort. Surface exact error to user. Turbo never runs without isolation. |
| Superpowers not installed | Hard precondition fail at step 2. Stop and tell the user to install it. |
| Merge conflict at integration step | `git merge --abort`, leave branch untouched, report conflict as Critical in final report. Do not auto-resolve — surface to user. |
| `--pr` mode but no GitHub remote / no `gh` auth | Fall back to **merge** mode. Log the fallback in the final report. |
| Decomposer returns a single-iter manifest | The brief was wrongly classified as oversized. Discard the manifest, re-run as single-iter. Log the misclassification in the final report so the heuristics can be tuned. |
| Decomposer returns a manifest with an iter that fails its own DAG self-check | Treat as decomposer bug. Call `advisor()` once; if still unresolvable, abort and surface to user. Do NOT execute a manifest whose iters can't be planned. |

## When NOT to use turbo

- Multi-repo orchestration (V1 is single-repo).
- Work that requires real-time human judgment (e.g., reviewing legal language, picking domain copy).
- Work pointing at production (turbo is safe in a worktree; if your task requires touching prod directly mid-flow, use the standard superpowers cycle).

## References

- `references/workflow-script.md` — the per-iteration Workflow script (execution engine, write/commit split, schemas)
- `references/overrides.md` — authoritative override list
- `references/plan-format.md` — DAG schema and invariants

## Prompts

- `prompts/decomposer.md` — Opus (only dispatched when scope detection flags oversized)
- `prompts/interviewer.md` — Opus (brainstorm fallback when no domain expert exists)
- `prompts/planner.md` — Opus
- `prompts/implementer.md` — Sonnet (write-only, one per implementer slot in a wave)
- `prompts/committer.md` — Haiku (the single serialized git writer; one dispatch per wave + review)
- `prompts/qa.md` — Sonnet
- `prompts/linter.md` — Haiku
