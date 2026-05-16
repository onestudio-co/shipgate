---
name: turbo
description: Use when the user invokes /turbo, says "turbo mode", "yolo this", "ship this fast", or asks for an autonomous, parallel, no-Q&A version of the superpowers cycle. Spawns an implementer/QA/linter team via TeamCreate, runs pipelined waves, uses advisor() instead of user-approval, skips TDD, lints at end-of-wave. Always runs in a git worktree. Auto-decomposes oversized scope into a multi-iteration manifest and chains the remaining iterations via ScheduleWakeup so the user gets a single autonomous run from one /loop /turbo invocation.
---

# Turbo Mode

`/turbo <natural-language task>` runs an autonomous, parallel version of the superpowers cycle. Use it when you want speed and you trust the worktree-isolation safety net. The standard superpowers cycle is still the default for everything else.

For scope that won't fit a single turbo cycle (multi-subsystem briefs, "build all of these features", platform-scale work), turbo **auto-decomposes** into a multi-iteration manifest and runs each iter as its own turbo cycle. When invoked under `/loop` dynamic mode (recommended for multi-iter briefs), each iter ends by scheduling the next via `ScheduleWakeup`, and the chain self-terminates when the manifest is exhausted — no user intervention between iters.

## What turbo overrides

See `references/overrides.md` for the canonical list. Summary:

- Brainstorm Q&A with user → interviewer subagent + assumption log
- Spec approval by user → `advisor()` approval
- TDD red-green per task → no tests by default. Tests are written only if the project has existing test infrastructure in use OR the user explicitly requested tests in the `/turbo` invocation. **Browser/E2E tests are never authored by turbo — request post-DONE.**
- Lint per task → one pass per wave (batched)
- Plan execution-mode prompt → hardcoded subagent-driven
- One implementer at a time → N implementers in parallel via `TeamCreate`
- "Push branch, leave for human merge" → **merge to base branch by default** at end of run. PR is opt-in via explicit `--pr` flag (mirrors the TDD opt-in pattern).

What turbo does NOT override: `verification-before-completion`, `using-git-worktrees`, `requesting-code-review`, `systematic-debugging`, `finishing-a-development-branch`.
Turbo's end-of-run review is delegated to the bundled `shipgate` skill (the
non-technical human gate) — see references/overrides.md.

## Hard stops

**Zero hard stops in V1.** Force-push, prod deploys, secret writes, schema drops — all execute without confirmation. Safe by construction because turbo always runs in an isolated worktree on a non-main branch, and the user reviews the final diff before promoting it.

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
2. Derive a **stable task slug** from the brief. Method: lowercase the first ~80 chars of the brief, replace non-alphanumerics with `-`, collapse repeats, trim to 50 chars. This slug identifies the brief across iterations and must match across re-invocations (so manifests resume cleanly). Persist it.
3. **Manifest resume check.** Look for `docs/superpowers/turbo-manifests/<task-slug>-manifest.yml` (relative to repo root).
   - **Found, has pending iter:** load the manifest. This run = the next iter whose `status == pending` (or `in_progress` from an abandoned prior run). Skip scope detection + decomposition; skip to step 6 with that iter's scope as the brief.
   - **Found, all iters completed:** report "manifest already complete" to the user with the path. Do NOT recreate. Exit without running.
   - **Not found:** proceed to scope detection (step 4).
4. **Scope detection** (skip if `--no-decompose` flag set OR if `--continue` flag set on a missing manifest — in the latter case, error and ask the user to re-invoke without `--continue`). Coordinator (Opus) classifies the brief as **single-iter** or **oversized** using these heuristics; oversize if ANY trigger fires:
   - **Feature-count trigger:** the brief enumerates ≥5 distinct feature initiatives (e.g. "do all 7 of …", "build X, Y, Z, A, B").
   - **Subsystem trigger:** any one feature is subsystem-scale — rewrites auth, tenant model, persistence layer, build system, framework version, or anything pervasive (multi-tenancy, RBAC rewrite, framework upgrade, monorepo migration).
   - **Collision trigger:** ≥3 features in the brief would write the same hot shared file. Identify hot shared files by a quick `git ls-files | xargs wc -l 2>/dev/null | sort -rn | head -20` style scan or by project knowledge (e.g. mega `page.tsx` files >800 lines).
   - **Task-count trigger:** rough projection >10 implementer tasks across the brief.
   Persist the decision and trigger(s). Example: `[Scope: oversized — feature-count=7, subsystem=multi-tenancy, collision=app/operator/page.tsx]`. `[Scope: single-iter — feature-count=3, no triggers]`.
5. **Decomposition** (only if oversized in step 4).
   - Build a `feature_inventory` (parse the brief, list candidate features with one-liners).
   - Build a `project_context` summary: hot shared files, recent iteration cadence, any feedback memories that constrain scope (e.g. postponed integrations).
   - Dispatch the **decomposer** subagent using `prompts/decomposer.md` (Opus). Pass `task_brief`, `slug`, `feature_inventory`, `project_context`.
   - Decomposer writes the manifest to `docs/superpowers/turbo-manifests/<task-slug>-manifest.yml` and returns the first pending iter.
   - **This run = iter 1 of the manifest.** Iter 2..N will be picked up by future re-entries via the manifest resume check (step 3).
   - Report to the user before continuing: "Scope oversized. Decomposed into N iterations. Manifest at <path>. Starting iter 1: <iter-1 name>." If the user is NOT inside `/loop` dynamic mode (see step 29 for detection), append: "Run `/loop /turbo <verbatim brief>` to chain the remaining iterations automatically; otherwise re-invoke `/turbo --continue <verbatim brief>` after this iter completes."
6. **Create the worktree** for THIS iter via `superpowers:using-git-worktrees`. Branch name: `turbo/<iter-slug>-<YYYY-MM-DD>` where `<iter-slug>` is:
   - the manifest's `iterations[k].id` if this run came from a manifest, otherwise
   - the task slug from step 2.
   **Worktree creation is non-negotiable. If it fails, abort and surface the error.**
7. Switch all subsequent work into the worktree. Update the manifest iter's `status: in_progress` and `branch: <branch-name>` (if running from a manifest); save manifest.

### Brainstorm (compressed, parallel)
8. As coordinator (you, Opus), draft the design from the task description + project memory + a quick codebase scan.
9. Dispatch an interviewer subagent in parallel using `prompts/interviewer.md` (Opus model). Pass it the task description and a hint at which questions you want answered.
10. Merge: integrate the interviewer's answers. Every `[ASSUMPTION]` tag becomes a line in the spec's "Assumptions" section.
11. Call `advisor()` for design review. If material concern → rewrite once, re-pass. If still material concern → ship with concern noted in spec's "Open questions". Light suggestions → incorporate inline.

### Plan
12. Dispatch a planner subagent using `prompts/planner.md` (Opus model). Pass it the merged design + assumption log. It writes both the spec file and the DAG-annotated plan file (see `references/plan-format.md`).
13. Call `advisor()` for plan review. Same fallback as step 11.
14. Note the plan's wave count and max wave width. The max wave width sets your implementer team size (cap 4).

### Team setup
15. **Test-infra detection.** Decide whether to spawn the QA agent. Spawn QA iff at least one is true:
    - **Existing test infra in use.** The project's test runner is configured AND ≥1 existing test file:
      - JS/TS: `package.json` has a `test` script AND `find . \( -name "*.test.*" -o -name "*.spec.*" \) -not -path "*/node_modules/*"` returns ≥1 file.
      - Python: `pyproject.toml` has pytest configured (or `pytest.ini` exists) AND `find . \( -name "test_*.py" -o -name "*_test.py" \)` returns ≥1 file.
      - Rust: `Cargo.toml` exists AND (`tests/` directory exists OR `grep -r "#\[test\]" src/`).
      - Ruby: `Gemfile` mentions rspec AND `spec/` exists with ≥1 `*_spec.rb`.
    - **Explicit request in the `/turbo` argument string** (case-insensitive match): `--with-tests`, `--tests`, `--coverage`, `write tests`, `add tests`, `include tests`, `with coverage`, `TDD this`.

    Persist the QA decision and reason. Examples: `[QA: active — vitest configured + 47 test files]`, `[QA: active — user passed --with-tests]`, `[QA: skipped — no test infra and no explicit request]`.

16. **Lint-config detection.** Decide whether per-wave lint runs as a persistent stream. Lint stream is **configured** iff a real linter config exists in the project (not just a TypeScript compile gate):
    - JS/TS: `package.json` has an `eslintConfig` key OR `.eslintrc.*` exists OR `eslint.config.*` exists OR `biome.json` exists.
    - Python: `pyproject.toml` has `[tool.ruff]` OR `[tool.flake8]` OR `.ruff.toml`/`.flake8` exists.
    - Rust: always `configured` — `cargo clippy` is always available.
    - Ruby: `.rubocop.yml` exists.

    Persist the decision. Examples: `[Lint: configured — eslint.config.mjs detected]`, `[Lint: not-configured — TS strict is the de-facto gate]`.

17. **Team-mode decision** — choose between persistent team and direct-dispatch:
    - `team_mode = "team_create"` iff `qa_active == true OR lint_configured == true` (a persistent stream exists that needs a team member watching every wave-end).
    - `team_mode = "direct_dispatch"` otherwise (DAG is clean + no stream needs persistent watching; one-shot Agent calls per task are simpler, easier to recover from individual failures, and produce identical results).

    Persist the decision. Example: `[Team mode: direct_dispatch — QA skipped + no lint config; using one-shot Agent calls per task]`.

18. **Execute team setup per mode:**

    **If `team_mode == "team_create"`:**
    - `TeamCreate(team_name="turbo-<iter-slug>")`.
    - Spawn the team:
      - `min(wave_width, 4)` implementers using `prompts/implementer.md` (Sonnet)
      - QA agent using `prompts/qa.md` (Sonnet) — **only if step 15 returned active**; otherwise skip
      - 1 linter using `prompts/linter.md` (Haiku) — **only if step 16 returned configured**; otherwise skip
    - Seed the TaskList: one task per plan task, with `files_write` and `wave` in metadata. Implementers claim via `TaskUpdate(owner=self)`.

    **If `team_mode == "direct_dispatch"`:**
    - No `TeamCreate`. No persistent team members.
    - For each wave in order (handled in §wave loop): dispatch up to `wave_width` parallel `Agent` calls (subagent_type `general-purpose`, model `sonnet`, `run_in_background: true`), each with the task's full spec inlined into the prompt and instructions to read spec/plan from the worktree.
    - Coordinator awaits all `<task-notification>` events for the wave before advancing to the next wave.
    - Lint at end-of-wave is skipped (no lint config). The final-pass code review (step 27) is THE quality gate.
    - Per-task failures are recovered by re-dispatching a fresh Agent for just that task with the failure context. The other tasks in the wave (already complete) are not redone.

### Wave loop (pipelined)
For each wave in order:

19. Implementers claim tasks in the wave via `TaskUpdate(owner=self)`. Each runs their flow (read spec → implement → `verification-before-completion` → commit → mark completed).
20. **If QA is active:** as each implementer task completes, queue a paired QA task. QA agent picks it up and writes smoke + integration tests (never browser tests). QA stream is continuous across waves — not gated. **If QA is skipped, this step is a no-op.**
21. As soon as **all implementer tasks in wave N** are `completed`:
    - Wave N+1 implementer work begins (in parallel).
    - Dispatch linter subagent against wave N's diff (one-shot dispatch using `prompts/linter.md`). Runs concurrently with wave N+1.
    - Linter failures become new tasks attached to the earliest open wave, owned by the responsible implementer, with `lint-fix:` prefix. Lint-fix tasks claim priority.
22. Proceed to next wave. Pipeline continues until all waves complete *and* the QA stream (if active) + final linter pass drain.

### Final pass
23. Run `superpowers:requesting-code-review` against the full diff of the worktree's branch vs `main`. This is the primary quality gate; when QA is off, it is THE quality gate.
24. Convert review findings into one final batch of fix tasks. Dispatch one fresh implementer subagent to apply them all.
25. Re-run the linter one more time. If green, proceed. If not, see Failure handling below.
26. `TeamDelete` (graceful shutdown).

27. **Integration-mode detection.** Decide how to land the branch. The default is **merge** — the run produced a complete, reviewed, lint-clean branch and the autonomous-loop pattern (and most workflows) needs it to land for follow-up work to build on top. Other modes are opt-in via explicit flag, mirroring the TDD opt-in pattern.

    Detect mode from the original `/turbo` argument string (case-insensitive substring match), in priority order:

    | Pattern in `/turbo` args | Mode |
    |---|---|
    | `--pr`, `as PR`, `open PR`, `with PR`, `as a pull request` | **pr** |
    | `--no-merge`, `no merge`, `don't merge`, `leave branch`, `for review` | **no-merge** |
    | (nothing above matches) | **merge** (default) |

    Persist the integration decision and reason. Examples: `[Integration: merge — default]`, `[Integration: pr — user passed --pr]`, `[Integration: no-merge — user said "leave branch for review"]`.

28. **Execute the integration.** Resolve the base branch via `git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@'`; fall back to `main` if no remote-HEAD is set, then `master`. Then act per mode:

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

29. **Manifest progression** (only if this run came from a manifest — i.e. step 3 or step 5 loaded a manifest).
    - Update the current iter's record: `status: completed`, `merge_commit: <SHA from step 28>`, `completed_at: <ISO timestamp>`, `spec_path` / `plan_path` populated. Save the manifest.
    - Scan the manifest for the next iter whose `status == pending`.
    - First detect the invocation mode by looking at the most recent user-turn message that triggered this run. If it starts with `/loop ` (or was clearly re-fired by /loop), you are under **loop dynamic mode**. Otherwise the user invoked `/turbo` **standalone**.

    - **Under `/loop` dynamic mode** (recommended for multi-iter manifests): **do NOT call `ScheduleWakeup` yourself.** `/loop` is the driver and is responsible for scheduling the next wakeup at end-of-turn. Your job is just to leave the manifest in a clean state so the next `/loop` firing — which re-invokes `/turbo` with the same brief — finds the right next iter via step 3. Make sure the manifest's current-iter status is `completed` (or `failed` per step 30) before exiting, and surface the iter result in the final report so `/loop` can decide whether to keep scheduling. `/loop`'s own logic should inspect the manifest at end-of-turn and: (a) ScheduleWakeup with a short delay (~60s, not the default 1200-1800s heartbeat) if any iter is still `pending`; (b) omit ScheduleWakeup if the manifest is exhausted; (c) send a `PushNotification` summary when the chain terminates.

    - **Standalone `/turbo`** (not under `/loop`): chaining is the user's responsibility. Do NOT call `ScheduleWakeup` — it's gated to `/loop` dynamic mode and won't fire here. Append the chain instruction to the final report instead: "Iter <id> complete. To run iter <next-id>, invoke `/turbo --continue <verbatim brief>` (or wrap the original invocation: `/loop /turbo <verbatim brief>` to chain all remaining iters automatically)."

    - **If no next pending iter exists** (all iters completed): mark the manifest's top-level `status` (if present) as `completed`. Final report announces "Manifest <slug> fully shipped: N/N iters completed." Under `/loop` this signals the driver to terminate the loop.

30. **Iter failure handling.** If the current iter cannot complete cleanly (worktree creation failed, merge conflict, advisor still material-blocking after 2 rewrites, irreducible lint or implementer blockage):
    - Mark the iter `status: failed` in the manifest with a `notes` field describing the blocker.
    - Do NOT auto-chain. Omit `ScheduleWakeup`.
    - Surface the failure as the final report's primary message. The user decides whether to retry, edit the manifest, or abandon.

31. **Report to the user:**
    - Branch name
    - **Integration status**: merged to `<base>` (with merge commit SHA) OR PR opened (with URL) OR left on branch (with reason)
    - **Manifest status** (only if running from a manifest): "Iter <id> (<position>/<total>) complete. Next: <next-id>, scheduled in 60s via ScheduleWakeup." OR "Manifest fully shipped." OR "Iter failed: <reason> — chain paused."
    - Summary of changes (diff-stat)
    - List of `[ASSUMPTION]` items from the spec
    - **QA status**: active (with file count) OR skipped (with reason)
    - List of any `LINT-DEBT` annotations
    - **Post-DONE test invitation** (only if QA was skipped OR if browser-test coverage might be wanted): "Tests were not written. Re-invoke `/turbo --with-tests "<scope>"` to add unit/integration tests, or `/turbo --with-browser-tests "<scope>"` to add E2E coverage." Browser tests are only ever generated via this post-DONE path.

## Failure handling

| Failure | Response |
|---|---|
| Implementer `BLOCKED` | Re-dispatch with more context. Still blocked → escalate Sonnet→Opus. Still blocked → split the task. |
| Implementer `DONE_WITH_CONCERNS` | Read concerns. If correctness/scope → fix before QA. If observation → proceed; log in final report. |
| QA `DONE_WITH_CONCERNS` ("QA gap") | Log in final report. Proceed. |
| Advisor disagrees with spec/plan | Rewrite once. Still disagrees → ship with disagreement noted. Cap: 2 rewrite iterations per artifact. |
| Linter fails 3× on same file | Ship with `// LINT-DEBT: <reason>` annotation. File the issue as a task in the final report. |
| Two teammates trying to edit same file | Should be impossible if DAG invariants hold. If it happens, halt wave, surface planner bug to user, do not auto-recover. |
| Worktree creation fails | Hard abort. Surface exact error to user. Turbo never runs without isolation. |
| Merge conflict at integration step | `git merge --abort`, leave branch untouched, report conflict as Critical in final report. Do not auto-resolve — surface to user. |
| `--pr` mode but no GitHub remote / no `gh` auth | Fall back to **merge** mode. Log the fallback in the final report. |
| Decomposer returns a single-iter manifest | The brief was wrongly classified as oversized. Discard the manifest, re-run as single-iter. Log the misclassification in the final report so the heuristics can be tuned. |
| Decomposer returns a manifest with an iter that fails its own DAG self-check | Treat as decomposer bug. Call `advisor()` once; if still unresolvable, abort and surface to user. Do NOT execute a manifest whose iters can't be planned. |
| Manifest iter completes but `ScheduleWakeup` errors / not available | Skip the chain, finish iter cleanly, tell the user in the final report how to manually resume (`/turbo --continue <brief>`). |

## When NOT to use turbo

- Multi-repo orchestration (V1 is single-repo).
- Work that requires real-time human judgment (e.g., reviewing legal language, picking domain copy).
- Work pointing at production (turbo is safe in a worktree; if your task requires touching prod directly mid-flow, use the standard superpowers cycle).

## References

- `references/overrides.md` — authoritative override list
- `references/plan-format.md` — DAG schema and invariants

## Prompts

- `prompts/decomposer.md` — Opus (only dispatched when scope detection flags oversized)
- `prompts/interviewer.md` — Opus
- `prompts/planner.md` — Opus
- `prompts/implementer.md` — Sonnet (one per implementer slot)
- `prompts/qa.md` — Sonnet
- `prompts/linter.md` — Haiku
