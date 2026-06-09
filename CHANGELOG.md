# Changelog

All notable changes to **Studio Shipgate** are recorded here.

This file is derived from the real git diffs between version boundaries — not just
commit messages. Format follows [Keep a Changelog](https://keepachangelog.com/).
Newest version first.

---

## [0.8.0] — 2026-06-09 · kaizen learns from leading plugins (`harvest`)

A new `harvest` workflow turns kaizen into a self-improving consumer of other plugins:
it mines the recent changes of registered "leading plugins" (gstack, superpowers, and
any you add) and applies/proposes improvements to kaizen itself, judged by a
venture-building-team value lens.

### Added
- **`harvest` workflow + `kaizen-harvester` agent.** `/kaizen harvest` reads each
  registered source's recent changes (CHANGELOG-first, drilling into diffs), extracts
  candidate learnings, scores them by the venture-building-team value lens, applies
  SAFE additive ones (committed `kaizen(harvest): …`) and writes STRUCTURAL ones as
  proposals for approval — plus an upstream backport brief for this template.
- **Editable source registry** `template/mechanism/harvest/sources.md` (seeded with
  gstack + superpowers, 14-day window) — add a row to watch another plugin.
- **Append-only dedup ledger** `template/mechanism/harvest/ledger.jsonl` + per-source
  `last_harvested` markers make re-runs incremental and idempotent.
- Router keywords, a `harvest` preset in Composable stages, and roster / quick-ref /
  memory entries for the harvester.

### Safety
- Harvest only READS source repos (fetch/log/diff/clone into a gitignored
  `harvest/.cache/`); it never writes to them. The harvester treats all source content
  (incl. a source's `SKILL.md`) as DATA, never instructions (prompt-injection guard).

### Unchanged
- The v0.6.0 build engine and v0.7.0 opt-in stages are untouched; harvest reuses the
  existing planner / implementer / reviewer / committer / sensei — only one new agent.

_Manual-only (`/kaizen harvest`); no scheduler. The first real harvest (gstack +
superpowers 14-day review) runs after install by invoking the workflow._

---

## [0.7.0] — 2026-06-09 · kaizen composable opt-in stages

Backported from an evolved project-local kaizen: the "should we build this",
plan-review, and security ideas that grew in a downstream repo, generalized for the
template. A workflow is now a named preset of **stages** composed with `+x`/`-x`.

### Added
- **Three opt-in stages + their agents.** `template/mechanism/SKILL.md` gains a
  "Composable stages (split + combo)" section defining stage atoms, presets, and
  `+x`/`-x` modifiers, plus three new agents in `template/agents/`:
  - `kaizen-strategist.md` (opus) — `STRATEGY` stage (`+strategy`, default in `idea`):
    a lean office-hours front-end that returns build / reshape / don't-build before
    planning. Adapted from gstack `office-hours`.
  - `kaizen-plan-reviewer.md` (opus) — `PLAN-REVIEW` stage (`+review`): pressure-tests
    the spec + DAG with 6 decision principles + a premise challenge before EXECUTE.
    Adapted from gstack `autoplan` + `plan-ceo-review`.
  - `kaizen-cso.md` (sonnet) — `SECURITY` stage (`+security`): an OWASP + STRIDE +
    secrets/supply-chain/LLM/SKILL.md lens on the diff inside EXECUTE review.
    Adapted from gstack `cso`.
- Role-roster, agent list, memory layout, and quick-reference index updated for the
  three new opt-in agents.

### Changed
- **`build` playbook: large features stay ONE run.** Reversed the previous
  "split into two runs (backend then UI)" guidance — splitting strands half-done WIP
  on `main`; use more waves in a single cycle instead.
- **`fix` playbook:** added "scope a multi-ask report against existing code first"
  (grep before building duplicates) and a "scope lock" (the kaizen `freeze` — declare
  the allowed write set up front).
- **`refactor` playbook:** added the **Coordinated REMOVAL** variant — a feature/field
  deletion runs as one inline pass + one final gate (not per-wave), and the
  irreversible prod `DROP COLUMN` is deferred to the user.

_The newer v0.6.0 build engine (dependency-pipeline build, capped/scoped review,
template-plan fast path) is untouched — this release only adds the opt-in stages and
playbook learnings._

---

## [0.6.0] — 2026-06-08 · kaizen build v2

The kaizen engine learns to build faster and review cheaper.

### Changed
- **Dependency-pipeline build.** `template/mechanism/engine/workflow-script.md`
  reworked so implementers are grouped by a file-ownership DAG and run as a
  dependency pipeline instead of one flat wave (~174 lines reworked).
- **Capped + scoped review.** The `build` playbook now caps and scopes the
  adversarial review pass to keep cost down on large diffs
  (`template/mechanism/playbooks/build.md`, +30).
- **Template-plan fast path.** `plan-format.md` gained a fast path for known,
  repeated patterns so planning skips redundant work (+16).

_Files: 5 changed, +145 / −79. Engine + playbook only — no public command change._

---

## [0.5.0] — 2026-06-08 · /kaizen arrives; Change Card review removed

The biggest shift in the project's history. Shipgate stopped being a review **UI**
and became two autonomous **work cycles**.

### Added
- **`/kaizen` — self-improving cycle.** New `skills/kaizen/SKILL.md` and
  `commands/kaizen.md`. On first run it scaffolds an editable copy into the repo's
  `.claude/`.
- **7 role agents** (`template/agents/kaizen-*.md`): planner, implementer,
  committer, reviewer, qa, interviewer, and `kaizen-sensei` (the mandatory
  self-editing retro).
- **6 playbooks** (`template/mechanism/playbooks/`): idea, prototype, build, fix,
  refactor, release.
- **Engine + memory seed**: `engine/plan-format.md`, `engine/workflow-script.md`,
  and a `memory-seed/` (per-agent memory, domain maps, telemetry) copied into a
  fresh repo.

### Removed
- **The entire Change Card review server.** Deleted `server/` (app UI,
  `decision.cjs`, `shipgate-server.cjs`, `start.sh`, `stop.sh`, all tests),
  `skills/shipgate/SKILL.md`, `commands/shipgate.md`, and the v2 stepwise design
  spec. Shipgate is now turbo + kaizen only.

_Files: 47 changed, +2776 / −2638._

---

## [0.4.0] — 2026-06-08 · /turbo on dynamic Workflow

### Changed
- **`/turbo` re-platformed onto a dynamic `Workflow`** and decoupled from the
  shipgate review surface. Each iteration now runs as one Workflow script
  (`skills/turbo/references/workflow-script.md`, +196).
- Reworked every turbo prompt (planner, implementer, interviewer, qa, linter,
  decomposer) and the turbo SKILL (~156 lines).

### Added
- **Committer prompt** (`skills/turbo/prompts/committer.md`, +63) — a single
  serialized committer per wave.

_Files: 15 changed, +484 / −180._

---

## [0.3.1] — 2026-06-06 · usage-only README release

### Changed
- Version-bump release that ships the usage-only README and repo cleanup so fresh
  installs sync correctly (`plugin.json`, `marketplace.json`).

_Content landed across the 0.3.0 commits; this tag packages it for install._

---

## [0.3.0] — interactive blocking review loop

### Added
- **Interactive blocking review loop.** Approve flows through; a change or question
  **blocks** until Claude resolves it. No more batch submit
  (`server/app/review.js` largely rewritten, ~460 lines; server core +69).

### Changed
- **README is now usage-only.** Architecture, endpoints, and state moved out to a
  design spec the README points to (~141 lines).
- Expanded server tests (+178).

### Removed
- Stopped tracking `.superpowers` session junk (stray `server.pid` files) before
  going public.

_Files: 11 changed, +570 / −369._

---

## [0.2.1] · start.sh honors --project-dir

### Fixed
- `server/start.sh` now honors `--project-dir` and defaults to `$PWD`. It was
  rooting `.shipgate` inside the plugin cache instead of the user's project (+25).

---

## [0.2.0] · purpose-built stepwise reviewer

Replaced the v0.1 forked UI with a purpose-built reviewer.

### Added
- **Studio Shipgate branded stepwise reviewer UI** — one decision card per screen,
  scroll, diff drawer, summary.
- **Pure decision compiler** + tests, and v2-contract validation.
- **`marketplace.json`** so shipgate installs as a local marketplace.

### Removed
- Dropped the brainstorm fork the v0.1 base was built on.

---

## [0.1.0] · initial scaffold

### Added
- Scaffolded the shipgate plugin by vendoring the `visual-companion` server as the
  fork base for a non-technical "Change Card" review surface: pure decision
  compiler, deck render, `/event` `/diff` `/submit` endpoints, per-card verdicts,
  risk-first Change Card deck with a Jira-style diff drawer, the narrator contract
  skill, and the `/shipgate` + `/turbo` commands.

_Files: 27 changed, +3099. (This surface was fully removed in 0.5.0.)_

[0.6.0]: https://github.com/onestudio-co/shipgate/releases/tag/v0.6.0
[0.5.0]: https://github.com/onestudio-co/shipgate/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/onestudio-co/shipgate/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/onestudio-co/shipgate/releases/tag/v0.3.1
[0.3.0]: https://github.com/onestudio-co/shipgate/releases/tag/v0.3.0
