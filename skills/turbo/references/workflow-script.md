# Turbo Execution — the per-iteration Workflow script

Turbo executes **one iteration as one `Workflow` script**. The coordinator (Opus, you)
authors the script from the iter's DAG plan and calls the `Workflow` tool. This is the
single execution path — there is no `TeamCreate`, no `TaskList` claiming, no
`direct_dispatch` fallback. The DAG from `plan-format.md` feeds `parallel()` wave grouping
directly.

Calling `Workflow` from turbo is sanctioned: turbo is a skill whose instructions tell the
coordinator to orchestrate with `Workflow`, which is an explicit opt-in.

## ⚠️ Runtime invariant to verify before trusting isolation

Turbo's whole safety story is "all writes land in the iter worktree, never the main checkout."
That holds **only if the Workflow's agents operate against the worktree**, not the repo root.
This is **not yet verified** and the POC carries contrary evidence: it observed that
"agents run in the repo cwd" (they explored the session's real codebase). The Workflow tool
documents only `isolation:'worktree'` (a *fresh per-agent* worktree, which turbo rejects) —
there is **no documented knob to pin all agents into one pre-existing worktree**.

So the coordinator MUST do two things until this is confirmed:

1. **Make every path worktree-absolute.** Pass `worktree` (the absolute worktree path) in
   `args`, and have implementer/committer/QA/lint prompts root every file path and every git
   command at `worktree` — implementers write `${worktree}/<files_write>`, the committer runs
   `git -C ${worktree} add/commit`, lint/QA run their tools with `cwd = ${worktree}`. Do NOT
   rely on the agent's ambient cwd.
2. **Run the one-agent cwd probe first** (a throwaway Workflow: one agent returns `pwd` +
   `git rev-parse --abbrev-ref HEAD`). If it reports the worktree path + turbo branch, the
   ambient cwd is already correct and (1) is belt-and-suspenders. If it reports the repo root +
   base branch, (1) is **load-bearing** — and a committer that forgets `-C ${worktree}` would
   commit to the base branch. Treat (1) as mandatory either way.

If a future check proves agents cannot be steered to the worktree at all, the fallback is
per-agent `isolation:'worktree'` + merge-back (more expensive, reintroduces a merge step) —
a real design change, not a prompt tweak.

## Why a Workflow script (not prose coordination)

- The pipelined wave loop that turbo used to describe in prose **is** `pipeline()` —
  deterministic, no hand-managed `<task-notification>` bookkeeping.
- Agent returns are validated against a `schema` (retry on mismatch) instead of being
  parsed out of free-text `DONE`/`BLOCKED` prose.
- The completion `<usage>` block gives `subagent_tokens` + `duration_ms` per iter for
  free — the telemetry that lets the oversize heuristics and the wave-width cap be tuned
  with real numbers.

## The write/commit split (load-bearing safety invariant)

Parallel writers to **disjoint files** in one shared worktree are safe — the DAG
guarantees no two same-wave tasks write the same file. Parallel **`git commit`s** in one
worktree are **not** safe: every commit grabs the same `.git/index.lock`, regardless of
which files it stages. The DAG does not solve this; it is a process-level lock.

So turbo decouples writing from committing:

1. Implementers run in `parallel()` within a wave and are **write-only** — they create and
   modify their `files_write`, run `verification-before-completion`, and return. They run
   **no git commands**.
2. At the **wave barrier**, a **single serialized committer agent** commits that wave's
   work. One git process at a time → no lock contention.

This is why per-agent worktree isolation is **not** used for turbo implementers: the
shared worktree + serialized committer is cheaper than worktree-per-agent + merge, and the
DAG already prevents the file collisions that worktree isolation would otherwise guard
against. (Worktree isolation is the right tool only when parallel writers can hit the same
file with no other collision control — not turbo's case.)

### Commit granularity

The committer commits **per task by default**. It collapses to a single **wave-level**
commit only when every task in the wave is *small* — heuristic: each task writes ≤1 file
and its diff is ≤~40 changed lines. A wave with any substantial task → per-task commits for
the whole wave. Persist the choice per wave, e.g. `[Commit: per-task — wave 2 has 2 large
tasks]` or `[Commit: wave-level — wave 1 tasks all small]`.

## Phase shape

```
phase Waves   → for each wave: parallel() write-only implementers
                → wave barrier → 1 serialized committer
                → lint + QA pipeline against the next wave (read-only, overlapped)
phase Review  → multi-lens review → adversarial verify each finding → fix → commit
```

Only the **read-only** stages (lint, QA-read, review) pipeline against the next wave's
writes. Writes + commits are barriered at the wave boundary by the safety invariant above.

## Schemas (structured agent returns)

Define these as JSON Schemas in the script and pass via the `schema` option. The agent is
forced to return validated structured data — no prose parsing.

- **IMPLEMENTER_RESULT**: `{ task_id, status: "done"|"done_with_concerns"|"needs_context"|"blocked", files_written: string[], verification_evidence: string, concern?: string }`
- **COMMITTER_RESULT**: `{ commits: [{ sha, message, task_ids: string[] }], granularity: "per-task"|"wave-level" }`
- **LINT_RESULT**: `{ clean: boolean, failures: [{ file, rule, message }] }`
- **QA_RESULT**: `{ status: "done"|"done_with_concerns"|"blocked_browser_only"|"qa_gap", tests_written: string[], runner_output: string }`
- **REVIEW_FINDING**: `{ id, dimension: "correctness"|"security"|"perf"|"scope", file, line, severity: "critical"|"major"|"minor", title, detail }`
- **VERIFY_VERDICT**: `{ finding_id, is_real: boolean, reasoning: string }`
- **PLANNER_RESULT** / **DECOMPOSER_RESULT** / **INTERVIEWER_RESULT**: see the matching
  `prompts/*.md`.

## Canonical script

```js
export const meta = {
  name: 'turbo-iter',
  description: 'Execute one turbo iteration: pipelined waves (write-only implementers + serialized committer) then adversarial review.',
  phases: [{ title: 'Waves' }, { title: 'Review' }],
}

// GOTCHA (from the POC): `args` can arrive as a JSON *string*, not an object.
// Parse defensively or `.waves.map` throws on undefined.
const a = typeof args === 'string' ? JSON.parse(args) : args
const { worktree, specPath, planPath, waves, qaActive, lintConfigured, baseBranch } = a

phase('Waves')
// Read-only lint/QA of wave N pipeline against wave N+1 writes; writes+commits barrier per wave.
const qaStream = []   // QA writes test files but never commits; the committer commits them.
for (const wave of waves) {
  // 1. Parallel write-only implementers — disjoint files_write, no git.
  const results = await parallel(wave.tasks.map((t) => () =>
    agent(implementerPrompt(t, specPath, planPath, worktree), {
      label: `impl:${t.id}`, phase: 'Waves', model: 'sonnet', schema: IMPLEMENTER_RESULT,
    })
  ))
  const done = results.filter(Boolean)
  const blocked = done.filter((r) => r.status === 'blocked' || r.status === 'needs_context')
  // (Failure handling: re-dispatch blocked tasks per SKILL.md before committing the wave.)

  // 2. Wave barrier → ONE serialized committer for the wave's implementer files
  //    (no index-lock race — the committer is the only git writer).
  await agent(committerPrompt(wave, done, worktree), {
    label: `commit:wave-${wave.n}`, phase: 'Waves', model: 'haiku', schema: COMMITTER_RESULT,
  })

  // 3. Read-only / write-only streams pipeline against the next wave (do not barrier the loop).
  if (lintConfigured) {
    // Capture the LINT_RESULT and wire the fix loop — do NOT fire-and-forget, or
    // "failures become fix tasks" never happens. Run the fix as a write-only implementer,
    // then commit it through the serialized committer (still the only git writer).
    agent(lintPrompt(wave, worktree), { label: `lint:wave-${wave.n}`, phase: 'Waves', model: 'haiku', schema: LINT_RESULT })
      .then(async (lint) => {
        if (lint && !lint.clean && lint.failures.length) {
          await agent(lintFixPrompt(lint.failures, worktree), { label: `lint-fix:wave-${wave.n}`, phase: 'Waves', model: 'sonnet', schema: IMPLEMENTER_RESULT })
          await agent(committerPrompt({ n: `lint-${wave.n}` }, [], worktree), { label: `commit:lint-${wave.n}`, phase: 'Waves', model: 'haiku', schema: COMMITTER_RESULT })
        }
      })
  }
  if (qaActive) {
    // QA writes test files (write-only, no git). Collect the promise; commit at the end
    // so the wave loop is never barriered on QA.
    qaStream.push(agent(qaPrompt(wave, worktree), { label: `qa:wave-${wave.n}`, phase: 'Waves', model: 'sonnet', schema: QA_RESULT }))
  }
}
// Drain the QA stream once, after all waves, then a single committer pass for the test files.
if (qaStream.length) {
  const qaResults = (await Promise.all(qaStream)).filter(Boolean)
  const testFiles = qaResults.flatMap((r) => r.tests_written || [])
  if (testFiles.length) {
    await agent(qaCommitPrompt(testFiles, worktree), {
      label: 'commit:qa', phase: 'Waves', model: 'haiku', schema: COMMITTER_RESULT,
    })
  }
}

phase('Review')
// Multi-lens review → adversarially verify each finding → keep only confirmed → fix.
const DIMENSIONS = ['correctness', 'security', 'perf', 'scope']
const found = (await parallel(DIMENSIONS.map((d) => () =>
  agent(reviewPrompt(d, worktree, baseBranch), { label: `review:${d}`, phase: 'Review', model: 'sonnet', schema: REVIEW_FINDINGS })
))).filter(Boolean).flatMap((r) => r.findings)

const verified = await parallel(found.map((f) => () =>
  agent(verifyPrompt(f, worktree), { label: `verify:${f.id}`, phase: 'Review', model: 'sonnet', schema: VERIFY_VERDICT })
    .then((v) => ({ ...f, real: v?.is_real }))
))
const confirmed = verified.filter(Boolean).filter((f) => f.real)

if (confirmed.length) {
  await agent(fixPrompt(confirmed, worktree), { label: 'review-fix', phase: 'Review', model: 'sonnet', schema: IMPLEMENTER_RESULT })
  await agent(committerPrompt({ n: 'review' }, [], worktree), { label: 'commit:review', phase: 'Review', model: 'haiku', schema: COMMITTER_RESULT })
}

return { waves: waves.length, confirmedFindings: confirmed.length }
```

The prompt-builder helpers (`implementerPrompt`, `committerPrompt`, etc.) inline the
matching `prompts/*.md` content plus the task's spec and the worktree path. The committer
prompt carries the per-wave granularity decision.

## Concurrency note

Within-workflow concurrency is capped at `min(16, cores-2)`; the wave-width cap of 4 from
the planner keeps each `parallel()` well under that. The committer is intentionally a single
serialized call — never fan it out.
