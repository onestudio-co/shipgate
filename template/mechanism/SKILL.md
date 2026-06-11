---
name: kaizen
description: >
  Self-improving build/fix/release skill for this repo. Invoked as `/kaizen <workflow> <brief>`.
  <workflow> is one of: idea | prototype | build | fix | refactor | release | harvest.
  If <workflow> is omitted, the CHEAP CLASSIFICATION router (defined in this file)
  picks one from the brief and logs its choice for retro correction.
  Runs 5 phases: LOAD → PREPARE → EXECUTE → RETRO → REPORT, each right-sized to the task.
  A retro runs after every cycle: it ALWAYS assesses, and does the full self-editing pass
  only when the cycle earned a real enhancement (failures and recurrences always do).
---

# Kaizen — Entry Skill

**Invocation:** `/kaizen <workflow> <brief>`

Kaizen is a self-contained, self-improving group of skills and named agents for this
repo. It clones the turbo execution engine and adds three pillars: **playbooks**,
**per-agent memory + domain maps**, and a **mandatory self-editing retro**. It runs
entirely on project-local files (scaffolded into `.claude/` by the plugin on first
run) and never touches `turbo` or the plugin's own files.

---

## Smart, not rigid — the governing principle

Kaizen optimizes for **value per cycle**, not process compliance. Every stage earns its
cost. **Right-size the process to the task:** a one-line fix needs no planner dispatch, no
plan review, and no heavy retro; a routine, already-known change needs no self-edit at all.
Do a step because it adds value on THIS cycle — not because the pipeline lists it.

Two non-negotiables remain (the rigidity that earns its keep):

1. **Never ship unverified work** — gates + verification before any commit/claim.
2. **Always record the run, and always learn from failures** — one telemetry line per
   cycle, and a full retro whenever a cycle fails, surprises, or repeats a known mistake.

Everything else scales to the task. This principle governs all phases below: PREPARE may
skip the planner on a confirmed-trivial change, EXECUTE scales from inline to a full
Workflow, and RETRO is **value-triggered** (Phase 4), not a mechanical after-every-cycle
ritual. Be smart, not rigid.

---

## CHEAP CLASSIFICATION router

**This logic runs inside this SKILL.md — NOT an agent.** When `<workflow>` is
omitted from the invocation, the coordinator applies the following heuristic to the
`<brief>` to pick a workflow. The choice is logged immediately so `kaizen-sensei`
can correct misroutes in the retro.

### Classification rules (evaluated in order — first match wins)

| Condition in brief | Pick |
|---|---|
| Brief IS or NAMES another skill/command (e.g. `/<skill> for #24`) | CLARIFY → classify the real underlying work (NEVER run that other skill) |
| Contains words: "harvest", "learn from", "what's new in", "pull learnings", "sync from" (or "upstream" only when paired with "harvest", "learn", or "sync") | `harvest` |
| Contains words: "release", "tag", "changelog", "version", "ship it", "cut a release" | `release` |
| Contains words: "bug", "broken", "error", "fail", "crash", "500", "not working", "fix", "regression" | `fix` |
| Contains words: "refactor", "cleanup", "extract", "rename", "move", "restructure", "simplify" without new features | `refactor` |
| References an already-APPROVED design doc / written spec for a real component (e.g. "implement the approved X", a path under `docs/superpowers/specs/`) | `build` (an approved design is real work — beats the `prototype`/`idea` keywords below) |
| Contains words: "prototype", "mockup", "mock-up", "wireframe", "POC", "proof of concept", "fake data", "demo UI" | `prototype` |
| Contains words: "idea", "brainstorm", "explore", "spec only", "design", "what if", "proposal" | `idea` |
| Default (none of the above match, or "add", "build", "implement", "feature", "new") | `build` |

When the brief NAMES another skill, kaizen never runs that skill — it asks what the
underlying work is, then classifies that. When a design/spec is already approved, route to
`build` even if the brief says "design" or "mockup": the throwaway-HTML `prototype` and the
spec-only `idea` are for work that ISN'T decided yet.

### Logging the classification choice

After picking a workflow, the coordinator MUST log one line to the session before
proceeding:

```
[kaizen router] brief → workflow: <chosen> (reason: <matched keyword or "default">)
```

This line is passed to `kaizen-sensei` as part of the run report so the retro can
detect misroutes and refine these heuristics.

---

## Composable stages (split + combo)

A workflow is just a **named preset of stages**. Stages are the atoms; the `+x`/`-x`
modifiers let the user compose a run without inventing a new workflow. This keeps the
lean default cheap while making heavier capabilities **opt-in**.

### Stage atoms

| Stage | Maps to phase | Default | What it does |
|---|---|---|---|
| `LOAD` | LOAD | always | read playbook + facts + needed domain maps |
| `STRATEGY` | start of PREPARE | opt-in | the "should we build this" brain — office-hours forcing questions before planning |
| `PLAN` | PREPARE | core | planner writes spec + DAG plan |
| `PLAN-REVIEW` | end of PREPARE | opt-in | gate the spec before EXECUTE (6 decision principles + premise challenge) |
| `EXECUTE` | EXECUTE | core | waves of implementers → committer → adversarial code review |
| `SECURITY` | inside EXECUTE review | opt-in | CSO lens (OWASP/STRIDE/secrets/SKILL.md) on the diff |
| `DEPLOY` | end of EXECUTE | opt-in | run the project's production deploy command after gates are green |
| `RETRO` | RETRO | **always assess** | sensei — always assesses; full self-edit only on signal (failures always); never removable |
| `REPORT` | REPORT | always | print outcome + telemetry |

`LOAD`, `RETRO`, `REPORT` are non-removable. The RETRO **assessment** is an INVARIANT — it
runs after every cycle, even failure, because it is cheap and keeps run history honest. The
**full self-editing retro** is value-triggered: it fires only when the cycle earned an
enhancement (see Phase 4). Failures and recurrences ALWAYS trigger a full retro.

### Workflow presets (the split)

| Workflow | Composition |
|---|---|
| `idea` | LOAD → STRATEGY → PLAN(spec-only) → RETRO → REPORT |
| `prototype` | LOAD → PLAN → EXECUTE(prototype) → RETRO → REPORT |
| `build` | LOAD → PLAN → EXECUTE → RETRO → REPORT |
| `fix` | LOAD → PLAN(light) → EXECUTE → RETRO → REPORT |
| `refactor` | LOAD → PLAN(light) → EXECUTE → RETRO → REPORT |
| `release` | LOAD → PLAN(light) → DEPLOY → RETRO → REPORT |
| `harvest` | LOAD → PREPARE(collect-diffs + kaizen-harvester fan-out) → EXECUTE(apply-safe / propose-structural / upstream-brief) → RETRO → REPORT |

### Modifiers (the combo)

Append `+stage` to add, `-stage` to drop, after the workflow:

- `+strategy` · `+review` · `+security` · `+ship` (=DEPLOY) · `-review` · `-strategy`
- `/kaizen build +strategy +review` → LOAD → STRATEGY → PLAN → PLAN-REVIEW → EXECUTE → RETRO → REPORT
- `/kaizen build +ship` → … EXECUTE → DEPLOY → RETRO …
- `/kaizen fix +security +ship` → … EXECUTE → SECURITY → DEPLOY → RETRO …

### Resolution + logging

The router first strips `+x`/`-x` tokens (they never affect keyword classification),
picks the workflow, applies the preset, then adds/removes the modified stages. It logs:

```
[kaizen stages] <workflow> <modifiers> → STAGE→STAGE→…
```

An opt-in stage with no implementation yet (see `.claude/kaizen/gstack-merge-roadmap.md`
when present) is a **no-op that logs "stage X not yet implemented"** — never a hard error.
This lets the grammar ship before every stage is built.

### Stage implementations

| Stage | Status | How it runs |
|---|---|---|
| `STRATEGY` | ✅ implemented | dispatch `kaizen-strategist` (opus) before PLAN; on a `dont-build` verdict, STOP + report (still run RETRO); else feed `sharpened_problem` + `wedge` to the planner |
| `PLAN-REVIEW` | ✅ implemented | dispatch `kaizen-plan-reviewer` (opus) after PLAN; 6 principles + premise challenge; appends review + decision audit to the spec; `pass`→EXECUTE, `hold`→ask user, `revise`→back to planner |
| `SECURITY` | ✅ implemented | dispatch `kaizen-cso` (sonnet) in EXECUTE review; OWASP/STRIDE + secrets/supply-chain/LLM/SKILL.md on the diff; verified findings → fix wave, unverified → user |
| `DEPLOY` | opt-in | after merge to main + gates green on the MAIN checkout, run the project's production deploy command, wait for ready, smoke the changed routes. If schema changed, apply the migration BEFORE deploy. Without `+ship`, kaizen only PRINTS the command — never auto-deploys |

---

## 5 Phases (right-sized to the task)

Every kaizen run follows these five phases in order, but each phase's **depth scales to the
task** (see "Smart, not rigid"). The phases are always present; how much they do is not:
a confirmed-trivial change skips the planner dispatch, a clean routine cycle gets a light
retro. The RETRO **assessment** and the final REPORT always run.

### Phase 1 — LOAD

Read only what this run actually needs. This is the token-efficiency win over turbo.

1. Load the chosen playbook: `.claude/kaizen/playbooks/<workflow>.md`
2. Load `.claude/kaizen/memory/facts.md`
3. Load **only** the domain map files the task touches. Discover what exists by
   listing `.claude/kaizen/memory/domains/*.md` (the set grows over time as sensei
   adds maps), then load just the ones whose subject matches this task. A fresh repo
   may have none yet — that is fine; proceed without them.
4. Load the per-agent memory files for the roles that will actually run this cycle
   (from `.claude/kaizen/memory/agents/`).

Do NOT load all domain maps. Do NOT load memory for agents not used this cycle.

### Phase 2 — PREPARE

PREPARE behavior depends on the workflow. The description below is the **default** for
`build`, `fix`, `refactor`, `prototype`, and `release`. The `harvest` workflow runs a
completely different PREPARE — see `.claude/kaizen/playbooks/harvest.md` for details
(no spec file, no DAG; instead: source fetches + kaizen-harvester fan-out + dedup
against ledger).

**Default PREPARE** (`build` / `fix` / `refactor` / `prototype` / `release`):

`kaizen-planner` (opus) fills the playbook skeleton into two artifacts in ONE pass:

- A spec at `docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md`
- A plan (file-ownership DAG) at `docs/superpowers/plans/YYYY-MM-DD-<slug>-plan.md`

Gaps are answered from memory first. `kaizen-interviewer` is the fallback only when
memory cannot answer. Anything still unknown becomes an `[ASSUMPTION]` line in the
spec. The planner must NOT re-ask questions already answered in `facts.md` or
`playbooks/<workflow>.md`. The plan must conform to
`.claude/kaizen/engine/plan-format.md`.

### Phase 3 — EXECUTE

The cloned turbo engine runs the plan:

1. Create/enter a worktree for the iteration.
2. For each wave in the DAG: dispatch write-only implementers in parallel (disjoint
   `files_write`, no git commands), then ONE serialized committer for the wave.
3. Multi-lens review (correctness, security, perf, scope) → adversarial verify each
   finding → keep only confirmed findings → fix → commit.

See `.claude/kaizen/engine/workflow-script.md` for the canonical script and
all safety invariants.

### Phase 4 — RETRO (value-triggered, smart)

Retro exists to **raise a real enhancement**, not to comply with a process. It runs in two
speeds. The cheap ASSESS pass is always done; the expensive CODIFY pass fires only on signal.

**Step A — ASSESS (always, cheap).** After every cycle, `kaizen-sensei` (opus) reads the run
report (every agent's `learnings`, the assumption log, timing, token counts, status) and
answers ONE question: *did this cycle earn an enhancement?* It ALWAYS appends one telemetry
line (run history + the trend/fix-ratio alarms depend on it) and records the verdict
(`retro_mode: full | light`).

**Step B — CODIFY (full retro) — only when ASSESS finds signal.** Dispatch the full
self-editing retro when ANY of these hold:

- the run **failed or was blocked**;
- a **new** pattern, hazard, or convention emerged (not already in memory);
- a **known issue recurred** (escalate it — repeats are the strongest signal);
- the router **misrouted**, or an `[ASSUMPTION]` was **refuted**;
- there was **friction** worth a mechanism tweak, or **the user gave feedback** mid-run;
- a memory file is **over its line cap** (compaction is required).

When the full retro fires, sensei updates memory and may edit playbooks, agent prompts, or
engine heuristics within the A6 rules (see below), appends one CHANGELOG entry, and makes
**one** commit `kaizen(retro): <summary>`.

**Light retro — when NONE of the signals fire** (routine cycle, clean repeat of a known
shape): record the telemetry line + `retro_mode: light`, note "no new learning (routine)",
and **stop — no forced memory edit, no commit.** An honest "nothing to add" beats a
manufactured learning to satisfy a quota. REPORT states whether the retro was full or light
and why, so the user can override ("do a full retro on this one").

**Floor (non-negotiable):** failures, blocks, and recurrences ALWAYS get a full retro — a
failed run is the richest learning there is. If the run failed before EXECUTE, sensei still
runs a full retro from the partial run report.

### Phase 5 — REPORT

Print to the session:

- What was built / fixed / released (or what spec was produced for `idea`).
- What the retro changed (memory updates, self-edits, CHANGELOG entry).
- Telemetry: tokens and duration per phase, compared to previous runs if available.
- Any broken learnings channels flagged by sensei.
- Classification choice if the router ran (so the user can confirm or correct it).

---

## Role-to-model roster

| Role | Agent file | Model | Dispatched in |
|---|---|---|---|
| planner | `.claude/agents/kaizen-planner.md` | opus | PREPARE |
| strategist | `.claude/agents/kaizen-strategist.md` | opus | STRATEGY stage (opt-in, before PREPARE) |
| interviewer | `.claude/agents/kaizen-interviewer.md` | opus | PREPARE (fallback) |
| plan-reviewer | `.claude/agents/kaizen-plan-reviewer.md` | opus | PLAN-REVIEW stage (opt-in, end of PREPARE) |
| sensei | `.claude/agents/kaizen-sensei.md` | opus | RETRO |
| implementer | `.claude/agents/kaizen-implementer.md` | sonnet | EXECUTE waves |
| reviewer | `.claude/agents/kaizen-reviewer.md` | sonnet | EXECUTE review |
| cso | `.claude/agents/kaizen-cso.md` | sonnet | SECURITY stage (opt-in, EXECUTE review) |
| harvester | `.claude/agents/kaizen-harvester.md` | sonnet | PREPARE (harvest workflow, per source) |
| qa | `.claude/agents/kaizen-qa.md` | sonnet | EXECUTE (if active) |
| committer | `.claude/agents/kaizen-committer.md` | haiku | EXECUTE (serialized, per wave) |

Model and result schema live at the dispatch site in
`.claude/kaizen/engine/workflow-script.md`. The `model:` frontmatter key in
each agent file is documentation only — not a runtime knob.

---

## Playbooks

Thin playbooks under `.claude/kaizen/playbooks/` (one per workflow listed
below). They start thin and fatten over time via retro. Load only the playbook
for the chosen workflow.

| Workflow | Playbook | Output |
|---|---|---|
| `idea` | `.claude/kaizen/playbooks/idea.md` | Spec only — no code |
| `prototype` | `.claude/kaizen/playbooks/prototype.md` | Data model + fake data + static frontend prototype; HARD STOP for user approval, then suggests `/kaizen build` |
| `build` | `.claude/kaizen/playbooks/build.md` | Committed, gate-passing code |
| `fix` | `.claude/kaizen/playbooks/fix.md` | Verified bug fix |
| `refactor` | `.claude/kaizen/playbooks/refactor.md` | Behavior-preserving cleanup |
| `release` | `.claude/kaizen/playbooks/release.md` | Release prepared; human ships |
| `harvest` | `.claude/kaizen/playbooks/harvest.md` | Kaizen self-improvement: applied safe learnings + STRUCTURAL proposals + upstream brief |

---

## Agents

All agents live under `.claude/agents/kaizen-*.md`. Each file is a prompt
body. The engine inlines each body as the prompt string into
`agent(prompt, { model, schema })`. The result schemas (with `learnings: string[]`
fields) are defined in
`.claude/kaizen/engine/workflow-script.md`.

Core agents (always available):
- `.claude/agents/kaizen-planner.md`
- `.claude/agents/kaizen-implementer.md`
- `.claude/agents/kaizen-committer.md`
- `.claude/agents/kaizen-reviewer.md`
- `.claude/agents/kaizen-qa.md`
- `.claude/agents/kaizen-interviewer.md`
- `.claude/agents/kaizen-sensei.md`

Opt-in stage agents (dispatched only when their stage is active — see "Composable stages"):
- `.claude/agents/kaizen-strategist.md` (STRATEGY stage — opt-in)
- `.claude/agents/kaizen-plan-reviewer.md` (PLAN-REVIEW stage — opt-in)
- `.claude/agents/kaizen-cso.md` (SECURITY stage — opt-in)

Workflow agents (dispatched only when their workflow is active):
- `.claude/agents/kaizen-harvester.md` (harvest workflow — per-source scout)

Each agent:
- (a) loads its `.claude/kaizen/memory/agents/<role>.md` plus the domain files named
  in its task before working;
- (b) ends by emitting a `learnings: string[]` in its structured result (the retro
  consumes these);
- (c) references Kaizen paths only — never turbo's.

---

## Engine files

Two engine files cloned and adapted from turbo 0.4.0:

- `.claude/kaizen/engine/workflow-script.md` — the per-iteration Workflow
  execution script. Contains the canonical Workflow script, all result schemas
  (IMPLEMENTER_RESULT, COMMITTER_RESULT, REVIEW_FINDINGS, QA_RESULT,
  PLANNER_RESULT — each with `learnings?: string[]`), and the INVARIANT section.
- `.claude/kaizen/engine/plan-format.md` — the file-ownership DAG plan
  format and the four plan invariants.

Both files contain a section explicitly marked **"INVARIANT — sensei must never
edit"**. Sensei is forbidden from modifying those sections.

---

## Memory layout

All kaizen memory lives under `.claude/kaizen/memory/`. Sensei maintains and
compacts these files.

```
.claude/kaizen/memory/
  facts.md                   # cached project facts (≤100 lines)
  agents/
    planner.md               # (≤150 lines)
    implementer.md           # (≤150 lines)
    committer.md             # (≤150 lines)
    reviewer.md              # (≤150 lines)
    qa.md                    # (≤150 lines)
    interviewer.md           # (≤150 lines)
    sensei.md                # (≤150 lines)
    strategist.md            # (≤150 lines, opt-in STRATEGY stage)
    plan-reviewer.md         # (≤150 lines, opt-in PLAN-REVIEW stage)
    cso.md                   # (≤150 lines, opt-in SECURITY stage)
    harvester.md             # (≤150 lines, harvest workflow)
  domains/
    db.md                    # (≤200 lines)
    feed.md                  # (≤200 lines)
    infra.md                 # (≤200 lines)
    issues.md                # (≤200 lines)
    mcp.md                   # (≤200 lines)
    playbook.md              # (≤200 lines)
    ui.md                    # (≤200 lines)
```

Compaction is sensei's job during retro. Caps: facts ≤100 lines, agent memory
≤150 lines, domain map ≤200 lines.

---

## Harvest state

The `harvest/` directory under `.claude/kaizen/` holds all state for the `harvest`
workflow. It is separate from `memory/` because it is source-driven, not run-driven.

```
.claude/kaizen/harvest/
  sources.md        # editable registry — one source per line (url + label + cadence)
  ledger.jsonl      # append-only dedup ledger — one entry per harvested item
  .cache/           # gitignored source clones / snapshots (never committed)
  proposals/        # STRUCTURAL proposals awaiting operator review
  upstream/         # upstream-brief outputs (one file per source per run)
```

The harvest workflow **only READS** source repos — it never pushes, commits to, or
modifies them. Safe learnings are applied directly; structural proposals land in
`proposals/` for human review. See `.claude/kaizen/playbooks/harvest.md` for the full protocol.

---

Additional telemetry and changelog files:

- `.claude/kaizen/telemetry.jsonl` — one JSONL line per run (A7 schema); seeded
  with a `#`-prefixed schema header. Appended by sensei only.
- `.claude/kaizen/CHANGELOG.md` — one entry per retro; prepended by sensei only.

---

## Retro rules (A6 — encoded here for fast reference)

These bind the FULL retro (Phase 4, Step B). A **light** retro makes no self-edits and no
commit — it only appends the telemetry line.

1. Max 5 file edits per retro (telemetry + CHANGELOG appends do NOT count).
2. Every edit must cite run evidence (`run_id`, specific finding, token count).
3. **Never invent a learning to comply.** Update memory or mechanism ONLY when the cycle
   earned it. A retro that changes nothing is a valid outcome — record why and stop.
4. Prompts must shrink or stay equal unless evidence justifies growth.
5. NEVER edit any section headed "INVARIANT — sensei must never edit".
6. **At most ONE commit per retro** (`kaizen(retro): <summary>`); a light retro makes none.
7. The telemetry line is ALWAYS appended (full or light) — run history must stay complete.

---

## Scaffolding note

Kaizen runs from two project-local roots, both editable and self-improving:

```
.claude/kaizen          # this skill (SKILL.md), engine files, playbooks,
                        # memory, telemetry, CHANGELOG
.claude/agents/kaizen-*.md   # all 7 agent prompt bodies (registered per-project)
```

These roots are scaffolded into the project by the `shipgate` plugin on the first
`/kaizen` run (copied from the plugin's `template/`), then owned and evolved by the
project. The plugin only seeds them when absent; it never overwrites evolved files.
Everything kaizen needs lives under these two roots — fully self-contained.

---

## Quick-reference path index

| What | Path |
|---|---|
| This entry skill | `.claude/kaizen/SKILL.md` |
| Engine — Workflow script | `.claude/kaizen/engine/workflow-script.md` |
| Engine — Plan format | `.claude/kaizen/engine/plan-format.md` |
| Playbook: idea | `.claude/kaizen/playbooks/idea.md` |
| Playbook: prototype | `.claude/kaizen/playbooks/prototype.md` |
| Playbook: build | `.claude/kaizen/playbooks/build.md` |
| Playbook: fix | `.claude/kaizen/playbooks/fix.md` |
| Playbook: refactor | `.claude/kaizen/playbooks/refactor.md` |
| Playbook: release | `.claude/kaizen/playbooks/release.md` |
| Agent: planner | `.claude/agents/kaizen-planner.md` |
| Agent: strategist (opt-in) | `.claude/agents/kaizen-strategist.md` |
| Agent: implementer | `.claude/agents/kaizen-implementer.md` |
| Agent: committer | `.claude/agents/kaizen-committer.md` |
| Agent: reviewer | `.claude/agents/kaizen-reviewer.md` |
| Agent: cso (opt-in) | `.claude/agents/kaizen-cso.md` |
| Agent: qa | `.claude/agents/kaizen-qa.md` |
| Agent: interviewer | `.claude/agents/kaizen-interviewer.md` |
| Agent: plan-reviewer (opt-in) | `.claude/agents/kaizen-plan-reviewer.md` |
| Agent: sensei | `.claude/agents/kaizen-sensei.md` |
| Memory: facts | `.claude/kaizen/memory/facts.md` |
| Memory: agents | `.claude/kaizen/memory/agents/<role>.md` |
| Memory: domains | `.claude/kaizen/memory/domains/<domain>.md` |
| Telemetry | `.claude/kaizen/telemetry.jsonl` |
| CHANGELOG | `.claude/kaizen/CHANGELOG.md` |
| Agent: harvester | `.claude/agents/kaizen-harvester.md` |
| Playbook: harvest | `.claude/kaizen/playbooks/harvest.md` |
| Harvest registry | `.claude/kaizen/harvest/sources.md` |
| Harvest ledger | `.claude/kaizen/harvest/ledger.jsonl` |
