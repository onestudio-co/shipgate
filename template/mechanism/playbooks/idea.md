# Playbook — idea

Output: a **SPEC ONLY**. No code is written, no commits are made.
The idea workflow is a compressed brainstorm that produces a single
approved spec document. Stop when the spec is written.

---

## Phases

| Phase | What happens |
|---|---|
| LOAD | Read this playbook + `.claude/kaizen/memory/facts.md` |
| PREPARE | Planner reads the brief, interviews only on hard unknowns, fills the spec skeleton below |
| EXECUTE | Planner writes `docs/superpowers/specs/<date>-<slug>-design.md` — NO implementation tasks |
| RETRO | Sensei logs the session, updates memory |
| REPORT | Print the spec path and a one-paragraph summary |

---

## Cached answers

| Question | Answer |
|---|---|
| Does idea produce code? | No. Output = spec file only. |
| QA? | Skipped. |
| Lint? | Skipped. |
| Integration mode? | None — no worktree or engine needed. |
| Gates? | None. The spec itself is the deliverable. |
| Number of agents needed? | planner (+ interviewer if gaps). No implementer, committer, reviewer. |
| Where does the spec live? | `docs/superpowers/specs/<YYYY-MM-DD>-<slug>-design.md` |

---

## Known wave shapes

Idea has **no DAG**. It is a single planner pass:

```
brief → [planner] → [interviewer? — gaps only] → spec file
```

No waves, no parallelism, no implementation tasks. If scope is large enough
to need sub-specs, the planner emits a parent spec + a list of follow-on
build/fix briefs; it does NOT spawn nested kaizen runs.

---

## Risks

- **Scope creep** — the spec tries to design the implementation in detail.
  Stop at "what and why"; leave "how" to the build playbook.
- **Premature answers** — planner guesses at unknowns instead of marking
  `[ASSUMPTION]`. Unmarked assumptions become invisible debt.
- **Missing approval step** — the spec goes straight to a build run without
  user sign-off. Always surface the spec for review before invoking
  `/kaizen build`.

---

## Questions the planner must NOT re-ask

- "What package manager?" — pnpm only (facts.md).
- "What test runner?" — vitest via `pnpm test` (facts.md).
- "What are the build gates?" — `./node_modules/.bin/tsc --noEmit` + `pnpm build` (facts.md).
- "Where does code live?" — this repo; see domain maps.
- "Do we need to migrate the DB?" — schema changes need manual `pnpm db:push` (facts.md).

---

## Skeleton spec template

The planner fills this template. Sections marked `[ASSUMPTION]` are inferred;
the retro promotes or corrects them.

```markdown
# Spec — <title>

Date: <YYYY-MM-DD>
Status: draft | approved
Worktree: (set by build run later)

## Problem

<1-3 sentences: what is broken or missing, and why it matters>

## Hard rules (non-negotiable)

- <user constraint 1>
- <user constraint 2>

## Approved design

<narrative description of the solution — what, not how>

### Key decisions

- <decision 1> [ASSUMPTION]
- <decision 2>

## Assumptions

- **A1**: <assumption> — [ASSUMPTION] or (user confirmed)
- **A2**: <assumption>

## Out of scope (v1)

- <thing deliberately excluded>

## Open questions

- <question still unresolved> — or "None."
```
