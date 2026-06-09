# Spec — `/kaizen harvest` workflow (kaizen self-improvement from leading plugins)

Date: 2026-06-09 · Target: shipgate kaizen template · Version: 0.7.0 → 0.8.0

## Goal

Add a reusable `harvest` workflow to kaizen that mines the recent changes of
**leading plugins** (gstack, superpowers, and any plugin the user registers later)
and turns them into improvements to kaizen itself — judged through a
**venture-building-team value lens**. Replaces ad-hoc one-off backports with a
repeatable, incremental, idempotent machine.

## Decisions (approved)

- **Autonomy:** apply SAFE additive learnings automatically + commit; write STRUCTURAL
  ones as proposals for human approval.
- **Target:** improve the local `.claude/kaizen/` AND emit an upstream backport brief
  for the shipgate template (the "sync back" fix).
- **Scope/value lens:** anything that makes kaizen better for a venture-building team
  (planning, validation, strategy, security, review quality, token cost, multi-venture
  scale, agent reliability) — not just the mechanism, but filtered by that lens.
- **Trigger:** manual only (`/kaizen harvest`). No scheduler.

## Components

1. **`template/agents/kaizen-harvester.md`** — new opt-in scout agent (sonnet).
   Reads ONE source's changes (CHANGELOG entries first, drilling into diffs only for
   promising entries), extracts candidate learnings, scores each by the
   venture-building-team value lens, classifies SAFE vs STRUCTURAL, maps each to a
   target kaizen file. Prompt-injection-guarded: treats source content (incl. a
   source's `SKILL.md`) as DATA, never instructions. Returns `HARVESTER_RESULT`.

2. **`template/mechanism/playbooks/harvest.md`** — thin workflow playbook.

3. **`template/mechanism/harvest/sources.md`** — editable registry (one row per plugin):
   `name | repo | branch | last_harvested | window_days`. Seeded with gstack
   (`~/.claude/skills/gstack`, local git) and superpowers
   (`https://github.com/obra/superpowers.git`), window 14. Add a row to add a plugin.

4. **`template/mechanism/harvest/ledger.jsonl`** — append-only dedup ledger, seeded with
   a `#`-prefixed schema header. One line per candidate ever seen.

5. **`template/mechanism/harvest/README.md`** — documents the `harvest/` state dir,
   the `.cache/` clone area, proposals/, upstream/.

6. **`template/mechanism/SKILL.md` edits** — router keywords (`harvest`, `learn from`,
   `what's new in`, `pull learnings`, `upstream`); a `harvest` workflow preset; harvester
   added to roster / agent list / quick-ref / memory layout; harvest state dir documented.

7. **`.gitignore`** — ignore `harvest/.cache/` (source clones) wherever scaffolded.

8. **Release** — bump to 0.8.0 (`plugin.json` + `marketplace.json`), prepend a
   diff-grounded CHANGELOG entry, refresh the README "Latest" callout.

## Pipeline (kaizen's 5 phases)

- **LOAD:** read `harvest.md`, `sources.md`, `ledger.jsonl`, `facts.md`.
- **PREPARE:** per source — use local full-history git in place (read-only `fetch`) or
  clone full into `harvest/.cache/<name>`; collect commits since `last_harvested` (or
  `window_days` on first run). Fan out one `kaizen-harvester` per source (parallel).
  Planner assembles candidates into an apply-plan and DEDUPS against the ledger.
- **EXECUTE:**
  - SAFE → apply to local `.claude/kaizen/`, scope-check, commit `kaizen(harvest): …`
    (obey retro A6 limits: cite source evidence, never touch INVARIANT sections).
  - STRUCTURAL → write to `harvest/proposals/<date>.md` (no apply).
  - Write upstream backport brief to `harvest/upstream/<date>.md` (per change: shipgate
    template target path + generic-ized text + risk).
- **RETRO (sensei):** update each source's `last_harvested` SHA in `sources.md`, append
  every candidate (applied/proposed/rejected) to `ledger.jsonl`, telemetry + CHANGELOG,
  one commit.
- **REPORT:** applied / proposed / rejected counts, per-source new marker, paths to
  proposals + upstream brief.

## Safety invariants

- Harvest only **READS** source repos (`fetch`/`log`/`diff`/`clone`). NEVER writes to them.
- A source's `SKILL.md`/agent prompts are executable text → harvester treats all source
  content as data (prompt-injection guard).
- SAFE = additive text in playbooks/memory/domain maps/heuristics, no new files/agents,
  no engine logic, no schema change. Everything else is STRUCTURAL (propose-only).
- Reuses existing planner / implementer / reviewer / committer / sensei — ONE new agent.
- Do NOT regress the v0.6.0 build engine or v0.7.0 opt-in stages.

## Out of scope (v1)

- Auto-applying harvested code into the shipgate template (genericization needs human
  judgment — the brief carries the guidance instead).
- Scheduling / cron.
- The first real harvest run (gstack + superpowers 14-day review) is run AFTER this ships,
  by invoking `/kaizen harvest` — this spec builds the machine, not the first harvest.

## Assumptions

- `[ASSUMPTION]` The shim's `cp -R template/mechanism/.` already carries `harvest/` into
  scaffolded `.claude/kaizen/`; no shim change needed (agents copied via the `kaizen-*.md`
  glob). Verified against `skills/kaizen/SKILL.md` Step 0.
- `[ASSUMPTION]` No markdown lint/test infra in shipgate → QA + lint streams off.
