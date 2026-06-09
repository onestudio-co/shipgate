---
name: kaizen
description: >
  Self-improving build/fix/release skill for this repo. Invoked as `/kaizen <workflow> <brief>`.
  <workflow> is one of: idea | prototype | build | fix | refactor | release | harvest.
  If <workflow> is omitted, the CHEAP CLASSIFICATION router (defined in this file)
  picks one from the brief and logs its choice for retro correction.
  Runs 5 fixed phases: LOAD → PREPARE → EXECUTE → RETRO → REPORT.
  A mandatory retro (kaizen-sensei) runs after every cycle, even on failure.
---

# Kaizen — Entry Skill

**Invocation:** `/kaizen <workflow> <brief>`

Kaizen is a self-contained, self-improving group of skills and named agents for this
repo. It clones the turbo execution engine and adds three pillars: **playbooks**,
**per-agent memory + domain maps**, and a **mandatory self-editing retro**. It runs
entirely on project-local files (scaffolded into `.claude/` by the plugin on first
run) and never touches `turbo` or the plugin's own files.

---

## CHEAP CLASSIFICATION router

**This logic runs inside this SKILL.md — NOT an agent.** When `<workflow>` is
omitted from the invocation, the coordinator applies the following heuristic to the
`<brief>` to pick a workflow. The choice is logged immediately so `kaizen-sensei`
can correct misroutes in the retro.

### Classification rules (evaluated in order — first match wins)

| Condition in brief | Pick |
|---|---|
| Contains words: "harvest", "learn from", "what's new in", "pull learnings", "sync from" (or "upstream" only when paired with "harvest", "learn", or "sync") | `harvest` |
| Contains words: "release", "tag", "changelog", "version", "ship it", "cut a release" | `release` |
| Contains words: "bug", "broken", "error", "fail", "crash", "500", "not working", "fix", "regression" | `fix` |
| Contains words: "refactor", "cleanup", "extract", "rename", "move", "restructure", "simplify" without new features | `refactor` |
| Contains words: "prototype", "mockup", "mock-up", "wireframe", "POC", "proof of concept", "fake data", "demo UI" | `prototype` |
| Contains words: "idea", "brainstorm", "explore", "spec only", "design", "what if", "proposal" | `idea` |
| Default (none of the above match, or "add", "build", "implement", "feature", "new") | `build` |

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
| `RETRO` | RETRO | **mandatory** | sensei — never removable |
| `REPORT` | REPORT | always | print outcome + telemetry |

`LOAD`, `RETRO`, `REPORT` are non-removable. `RETRO` is an INVARIANT (mandatory after
every run, even failure).

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

## 5 Fixed Phases

Every kaizen run — regardless of workflow — follows these five phases in order.
Skipping a phase (including RETRO) is not allowed.

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

### Phase 4 — RETRO

**MANDATORY — runs even on failure.**

`kaizen-sensei` (opus) receives the run report (including every agent's `learnings`
array, the assumption log, timing, and token counts) and:

- Always updates memory (at least one memory file is updated every retro).
- May edit playbooks, agent prompts, or engine heuristics within the A6 rules
  (max 5 file edits per retro; every edit cites run evidence; prompts shrink or
  stay equal unless evidence justifies growth; NEVER touches INVARIANT sections).
- Appends exactly one line to `.claude/kaizen/telemetry.jsonl`.
- Appends one entry to `.claude/kaizen/CHANGELOG.md`.
- Makes exactly ONE commit: `kaizen(retro): <summary>`.

If the run failed before EXECUTE, sensei still runs using the partial run report.

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

## Mandatory retro rules (A6 — encoded here for fast reference)

1. Max 5 file edits per retro (telemetry + CHANGELOG appends do NOT count).
2. Every edit must cite run evidence (`run_id`, specific finding, token count).
3. Prompts must shrink or stay equal unless evidence justifies growth.
4. NEVER edit any section headed "INVARIANT — sensei must never edit".
5. Exactly ONE commit per retro: `kaizen(retro): <summary>`.

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
