# Kaizen Execution — the per-iteration Workflow script

Kaizen executes **one iteration as one `Workflow` script**. The coordinator (Opus, you)
authors the script from the iter's DAG plan and calls the `Workflow` tool. This is the
single execution path — there is no `TeamCreate`, no `TaskList` claiming, no
`direct_dispatch` fallback. The DAG from `plan-format.md` feeds `parallel()` wave grouping
directly.

Calling `Workflow` from kaizen is sanctioned: kaizen is a skill whose instructions tell the
coordinator to orchestrate with `Workflow`, which is an explicit opt-in.

## Dispatch mechanism

The engine dispatches kaizen agents by **inlining** each `.claude/agents/kaizen-*.md` body
as the prompt string into `agent(prompt, { model, schema })` calls. The agent files are
prompt bodies only — the `model:` frontmatter key in each file is **documentation** of the
intended dispatch model, not a runtime knob. Model and result schema live **at the dispatch
site** in this workflow-script.md; the engine is the source of truth.

Agent bodies loaded by the engine:
- `.claude/agents/kaizen-implementer.md` — dispatched with `model: 'sonnet'`
- `.claude/agents/kaizen-committer.md` — dispatched with `model: 'haiku'`
- `.claude/agents/kaizen-reviewer.md` — dispatched with `model: 'sonnet'`
- `.claude/agents/kaizen-qa.md` — dispatched with `model: 'sonnet'`
- `.claude/agents/kaizen-planner.md` — dispatched with `model: 'opus'`
- `.claude/agents/kaizen-interviewer.md` — dispatched with `model: 'opus'`
- `.claude/agents/kaizen-sensei.md` — dispatched with `model: 'opus'`

---

## INVARIANT — sensei must never edit

The following safety invariants are copied verbatim from turbo 0.4.0. They are load-bearing
constraints on kaizen's correctness. Sensei is explicitly forbidden from editing this section.

**1. Always-worktree — make every path worktree-absolute.**

Kaizen's whole safety story is "all writes land in the iter worktree, never the main
checkout." That holds **only if the Workflow's agents operate against the worktree**, not the
repo root. This is **not yet verified** and the POC carries contrary evidence: it observed
that "agents run in the repo cwd" (they explored the session's real codebase). The Workflow
tool documents only `isolation:'worktree'` (a *fresh per-agent* worktree, which kaizen
rejects) — there is **no documented knob to pin all agents into one pre-existing worktree**.

So the coordinator MUST do two things until this is confirmed:

1. **Make every path worktree-absolute.** Pass `worktree` (the absolute worktree path) in
   `args`, and have implementer/committer/QA/lint prompts root every file path and every git
   command at `worktree` — implementers write `${worktree}/<files_write>`, the committer runs
   `git -C ${worktree} add/commit`, lint/QA run their tools with `cwd = ${worktree}`. Do NOT
   rely on the agent's ambient cwd.
2. **Run the one-agent cwd probe first** (a throwaway Workflow: one agent returns `pwd` +
   `git rev-parse --abbrev-ref HEAD`). If it reports the worktree path + kaizen branch, the
   ambient cwd is already correct and (1) is belt-and-suspenders. If it reports the repo root +
   base branch, (1) is **load-bearing** — and a committer that forgets `-C ${worktree}` would
   commit to the base branch. Treat (1) as mandatory either way.

If a future check proves agents cannot be steered to the worktree at all, the fallback is
per-agent `isolation:'worktree'` + merge-back (more expensive, reintroduces a merge step) —
a real design change, not a prompt tweak.

**2. Write/commit split (load-bearing safety invariant).**

Parallel writers to **disjoint files** in one shared worktree are safe — the DAG
guarantees no two same-wave tasks write the same file. Parallel **`git commit`s** in one
worktree are **not** safe: every commit grabs the same `.git/index.lock`, regardless of
which files it stages. The DAG does not solve this; it is a process-level lock.

So kaizen decouples writing from committing:

1. Implementers run in `parallel()` within a wave and are **write-only** — they create and
   modify their `files_write`, run `verification-before-completion`, and return. They run
   **no git commands**.
2. At the **wave barrier**, a **single serialized committer agent** commits that wave's
   work. One git process at a time → no lock contention.

This is why per-agent worktree isolation is **not** used for kaizen implementers: the
shared worktree + serialized committer is cheaper than worktree-per-agent + merge, and the
DAG already prevents the file collisions that worktree isolation would otherwise guard
against.

**3. Single serialized committer per wave.**

The committer is the only agent that runs git commands. It is always a single serialized
call — never fan it out. Parallel committers would race on `.git/index.lock`.

**4. Worktree-absolute paths + git -C.**

Every path in every agent prompt must be rooted at the worktree absolute path. Every git
command must use `git -C ${worktree}`. Never use relative paths or rely on ambient cwd.

**5. One-agent cwd probe.**

Before the first wave, run a throwaway single-agent Workflow that returns `pwd` and
`git rev-parse --abbrev-ref HEAD`. Use the result to confirm or correct the path strategy
before any writes land.

---

## Why a Workflow script (not prose coordination)

- The pipelined wave loop that kaizen describes in prose **is** `pipeline()` —
  deterministic, no hand-managed `<task-notification>` bookkeeping.
- Agent returns are validated against a `schema` (retry on mismatch) instead of being
  parsed out of free-text `DONE`/`BLOCKED` prose.
- The completion `<usage>` block gives `subagent_tokens` + `duration_ms` per iter for
  free — the telemetry that lets the oversize heuristics and the wave-width cap be tuned
  with real numbers.

## The write/commit split (expanded)

The single serialized committer commits **per task by default**. It collapses to a single
**wave-level** commit only when every task in the wave is *small* — heuristic: each task
writes ≤1 file and its diff is ≤~40 changed lines. A wave with any substantial task →
per-task commits for the whole wave. Persist the choice per wave, e.g.
`[Commit: per-task — wave 2 has 2 large tasks]` or `[Commit: wave-level — wave 1 tasks all small]`.

## Phase shape

```
phase Build   → dependency-scheduled write-only implementers (each starts when ITS deps
                finish, not at a wave barrier) → single async serialized commit-queue
                (the only git writer) → lint once + QA per-task, both committed via the queue
phase Review  → 3-lens review → dedup → IN-SCOPE filter → verify ONLY critical/major
                (adversarial, rejects out-of-scope) → batched triage of minor → SCOPED fix
                → commit only the named files
```

The commit-queue is the single git writer, so INVARIANT §2/§3 (write/commit split, one
serialized committer) still hold — the per-wave *barrier* is gone, but the *serialization*
of git is not. The DAG gives every same-file task pair a dependency edge, so no two
concurrently-running implementers write the same file (INVARIANT §1). Review is a separate
phase (NOT overlapped) because overlapping it steals build concurrency (exp 2026-06-08).

## Schemas (structured agent returns)

Define these as JSON Schemas in the script and pass via the `schema` option. The agent is
forced to return validated structured data — no prose parsing.

The `learnings` field is **required in every schema** (optional value, string array). The
engine collects each wave's and phase's `learnings` arrays into the run report that is
passed to `kaizen-sensei`. This is a schema requirement: an agent instruction to "emit
learnings" only works because the matching dispatch schema carries the field — a prompt-only
declaration would be dropped at schema validation and the array would never reach the retro.

- **IMPLEMENTER_RESULT**:
  `{ task_id, status: "done"|"done_with_concerns"|"needs_context"|"blocked", files_written: string[], verification_evidence: string, concern?: string, learnings?: string[] }`

- **COMMITTER_RESULT**:
  `{ commits: [{ sha, message, task_ids: string[] }], granularity: "per-task"|"wave-level", learnings?: string[] }`

- **LINT_RESULT**:
  `{ clean: boolean, failures: [{ file, rule, message }] }`

- **QA_RESULT**:
  `{ status: "done"|"done_with_concerns"|"blocked_browser_only"|"qa_gap", tests_written: string[], runner_output: string, learnings?: string[] }`

- **REVIEW_FINDINGS**:
  `{ findings: [{ id, dimension: "correctness"|"security"|"perf"|"scope", file, line, severity: "critical"|"major"|"minor", title, detail }], learnings?: string[] }`

- **VERIFY_VERDICT**:
  `{ finding_id, is_real: boolean, reasoning: string }`

- **PLANNER_RESULT**:
  `{ spec_path: string, plan_path: string, waves: number, tasks: number, assumptions: string[], learnings?: string[] }`

- **RETRO_RESULT** (dispatched by the coordinator in the RETRO phase, outside the Workflow):
  `{ run_id: string, status: "done", memory_files_updated: string[], self_edits: number, broken_channels: string[], learnings_seen: number, assumptions_corrected: number, compaction_performed: string[], changelog_entry: string, commit_message: string, learnings?: string[] }`

## Learnings collection

After all waves and phases complete, the engine aggregates every agent's `learnings` array
into the run report:

```js
const runLearnings = [
  ...implementerResults.flatMap(r => r.learnings || []),
  ...committerResults.flatMap(r => r.learnings || []),
  ...qaResults.flatMap(r => r.learnings || []),
  ...reviewResults.flatMap(r => r.learnings || []),
  plannerResult.learnings || [],
].flat()
```

A missing or empty `learnings` array from any agent is itself a signal of a broken channel —
this is surfaced in the retro report (field `learnings_seen` in telemetry) rather than
failing silently.

## Canonical script

```js
export const meta = {
  name: 'kaizen-iter',
  description: 'Execute one kaizen iteration: dependency-scheduled write-only implementers + a single async commit-queue, then a capped, scoped review.',
  phases: [{ title: 'Build' }, { title: 'Review' }],
}

// GOTCHA (from the POC): `args` can arrive as a JSON *string*, not an object.
// Parse defensively or `.waves.map` throws on undefined.
const a = typeof args === 'string' ? JSON.parse(args) : args
const { worktree, specPath, planPath, waves, qaActive, lintConfigured, baseBranch } = a

// Load kaizen agent bodies (inlined as prompt strings at dispatch site).
// Agent files: .claude/agents/kaizen-implementer.md, kaizen-committer.md, etc.
// Model and schema live here — the agent file's model: frontmatter is documentation only.

phase('Build')
// Dependency-scheduled write-only implementers + ONE async serialized commit-queue.
// (exp 2026-06-08: the per-wave BARRIER and the shared .git/index.lock were the two
// build bottlenecks. A task starts when ITS deps finish, not when its whole wave does;
// commits drain through a single async queue, so the committer is still the ONLY git
// writer — INVARIANT §2/§3 hold. The DAG gives every same-file pair a dependency edge,
// so no two CONCURRENTLY-running tasks ever write the same file — INVARIANT §1 holds.)
const allTasks = waves.flatMap((w) => w.tasks)
const implementerResults = []
const committerResults = []
const qaStream = []
const done = {}                       // task.id -> Promise of IMPLEMENTER_RESULT
let commitChain = Promise.resolve()   // the ONLY git writer; every commit chains here
const enqueueCommit = (label, files) => {
  if (!files || !files.length) return
  commitChain = commitChain.then(() =>
    agent(committerPrompt({ n: label }, files, worktree), { label: `commit:${label}`, phase: 'Build', model: 'haiku', schema: COMMITTER_RESULT })
      .then((c) => { if (c) committerResults.push(c) }))
}
for (const t of allTasks) {
  done[t.id] = (async () => {
    await Promise.all((t.depends_on || []).map((d) => done[d]))
    const r = await agent(implementerPrompt(t, specPath, planPath, worktree), { label: `impl:${t.id}`, phase: 'Build', model: 'sonnet', schema: IMPLEMENTER_RESULT })
    if (r) implementerResults.push(r)
    // (Failure handling: re-dispatch blocked/needs_context tasks per SKILL.md before enqueuing the commit.)
    if (r) enqueueCommit(t.id, Array.from(new Set(r.files_written || [])))
    if (qaActive) qaStream.push(agent(qaPrompt(t, worktree), { label: `qa:${t.id}`, phase: 'Build', model: 'sonnet', schema: QA_RESULT }))
    return r
  })()
}
await Promise.all(Object.values(done))
// Lint once over the tree (read-only); route any fix-commit through the same queue.
if (lintConfigured) {
  const lint = await agent(lintPrompt({ n: 'all' }, worktree), { label: 'lint', phase: 'Build', model: 'haiku', schema: LINT_RESULT })
  if (lint && !lint.clean && lint.failures.length) {
    const fix = await agent(lintFixPrompt(lint.failures, worktree), { label: 'lint-fix', phase: 'Build', model: 'sonnet', schema: IMPLEMENTER_RESULT })
    enqueueCommit('lint', (fix && fix.files_written) || [])
  }
}
// Drain QA, then commit test files through the queue.
let qaResults = []
if (qaStream.length) {
  qaResults = (await Promise.all(qaStream)).filter(Boolean)
  enqueueCommit('qa', qaResults.flatMap((r) => r.tests_written || []))
}
await commitChain                     // all build commits drained before review

phase('Review')
// Separate phase — NOT overlapped with the build (exp 2026-06-08: overlapping review
// stole concurrency slots and SLOWED the build). Cheap + precise instead of a fan-out:
// dedup → IN-SCOPE filter → verify ONLY critical/major adversarially → batched triage of
// minor → SCOPED fix. This cut review work from ~70% of the run to ~half at 1 verify agent.
const DELIVERABLES = new Set(allTasks.flatMap((t) => t.files_write || []))
const inDeliverables = (file) => !!file && [...DELIVERABLES].some((d) => file === d || file.endsWith(d))
const DIMENSIONS = ['correctness', 'security', 'scope']
const reviewResults = (await parallel(DIMENSIONS.map((d) => () =>
  agent(reviewPrompt(d, worktree, baseBranch), { label: `review:${d}`, phase: 'Review', model: 'sonnet', schema: REVIEW_FINDINGS })
))).filter(Boolean)
// DEDUP by file+title, then drop anything not on a file the plan actually produced
// (kills scope-creep findings like "add a missing subsystem" before they reach a fixer).
const seen = new Set()
const inScope = reviewResults.flatMap((r) => r.findings || []).filter((f) => {
  const k = `${f.file}::${(f.title || '').toLowerCase()}`
  if (seen.has(k) || !inDeliverables(f.file)) return false
  seen.add(k); return true
})
const major = inScope.filter((f) => ['critical', 'major'].includes((f.severity || '').toLowerCase()))
const minor = inScope.filter((f) => !['critical', 'major'].includes((f.severity || '').toLowerCase()))
// Verify ONLY critical/major; verifyPrompt instructs the agent to default is_real=false
// AND to reject out-of-scope findings (add-new-file / new-subsystem) — see helper note below.
const verified = await parallel(major.map((f) => () =>
  agent(verifyPrompt(f, worktree), { label: `verify:${f.id}`, phase: 'Review', model: 'sonnet', schema: VERIFY_VERDICT })
    .then((v) => ({ ...f, real: v?.is_real }))
))
let confirmed = verified.filter(Boolean).filter((f) => f.real)
// One batched triage agent for ALL minor findings (not one verifier each).
if (minor.length) {
  const triage = await agent(triagePrompt(minor, worktree, [...DELIVERABLES]), { label: 'triage:minor', phase: 'Review', model: 'sonnet', schema: REVIEW_FINDINGS })
  confirmed = confirmed.concat(((triage && triage.findings) || []).filter((f) => inDeliverables(f.file)))
}
const reviewFixFiles = Array.from(new Set(confirmed.map((f) => f.file).filter(inDeliverables)))
if (confirmed.length && reviewFixFiles.length) {
  // SCOPED fixer: fixPrompt forbids new files / deletes / out-of-list edits. The committer
  // stages ONLY reviewFixFiles (never `-A`), so a stray edit can never be committed
  // (exp 2026-06-08: an unscoped `git add -A` review-fix once deleted a deliverable).
  await agent(fixPrompt(confirmed, reviewFixFiles, worktree), { label: 'review-fix', phase: 'Review', model: 'sonnet', schema: IMPLEMENTER_RESULT })
  await agent(committerPrompt({ n: 'review' }, reviewFixFiles, worktree), { label: 'commit:review', phase: 'Review', model: 'haiku', schema: COMMITTER_RESULT })
}

// Collect all learnings for the run report → passed to kaizen-sensei in the RETRO phase.
const runLearnings = [
  ...implementerResults.flatMap(r => r?.learnings || []),
  ...committerResults.flatMap(r => r?.learnings || []),
  ...qaResults.flatMap(r => r?.learnings || []),
  ...reviewResults.flatMap(r => r?.learnings || []),
].flat()

return { waves: waves.length, confirmedFindings: confirmed.length, learnings: runLearnings }
```

The prompt-builder helpers (`implementerPrompt`, `committerPrompt`, etc.) inline the
matching `.claude/agents/kaizen-*.md` content plus the task's spec and the worktree path.

Three helper contracts changed with the v2 review (exp 2026-06-08):
- `verifyPrompt(f, worktree)` — must instruct the agent to default `is_real=false` AND to
  reject **out-of-scope** findings (anything asking to add a new file / new subsystem / edit
  a file outside the reviewed diff). Out-of-scope is not a review fix.
- `fixPrompt(confirmed, fixFiles, worktree)` — takes an explicit `fixFiles` allow-list and
  instructs the fixer to edit ONLY those files: no new files, no deletes, no `-A`.
- `triagePrompt(minorFindings, worktree, deliverableFiles)` — one batched agent that returns
  only the minor findings worth fixing (and only on `deliverableFiles`), replacing one
  verifier-per-finding.
`committerPrompt({ n }, files, worktree)` stages exactly `files` — never `git add -A`.

## Kaizen memory loading at dispatch

Each agent prompt is assembled with the agent's memory file prepended:

- `implementerPrompt` prepends `.claude/kaizen/memory/agents/implementer.md`
- `committerPrompt` prepends `.claude/kaizen/memory/agents/committer.md`
- `reviewPrompt` prepends `.claude/kaizen/memory/agents/reviewer.md`
- `qaPrompt` prepends `.claude/kaizen/memory/agents/qa.md`

Domain map files named in each task's context are also prepended for the implementer.
The LOAD phase (in `SKILL.md`) loads only the domain maps the task actually touches.

## Concurrency note

Within-workflow concurrency is capped at `min(16, cores-2)`; the wave-width cap of 4 from
the planner keeps each `parallel()` well under that. The committer is intentionally a single
serialized call — never fan it out.
