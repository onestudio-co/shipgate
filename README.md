# Studio Shipgate

**Two autonomous work cycles for Claude Code: `/turbo` and `/kaizen`.**

This plugin bundles two parallel, worktree-isolated work cycles. They share the
same execution engine (write-only implementers grouped by a file-ownership DAG, a
single serialized committer per wave, then an adversarial review pass) but differ
in how much they remember and tune themselves.

| Command | What it does |
|---|---|
| `/turbo <task>` | Generic autonomous cycle. Stateless and stable — nothing to set up, nothing it changes about itself. Best for one-off "just build/fix this fast" work. |
| `/kaizen <workflow> <brief>` | **Self-improving** cycle. Adds playbooks, per-agent memory + domain maps, and a **value-triggered** self-editing retro that sharpens its own files when a cycle earns it — smart, not rigid. `<workflow>` = idea · prototype · build · fix · refactor · release · harvest (omit it and a cheap router picks one). |

Each iteration of either runs as one dynamic `Workflow` and ends with a report on a
merged branch. Both always run in a git worktree; you review the final diff.

> **Note:** earlier versions of this plugin were a non-technical "Change Card" review
> surface. That feature has been removed — this plugin is now turbo + kaizen only.

**Latest — v0.9.0:** **Smart Retro** + learnings harvested from ~50 real `/kaizen` runs
across three downstream projects. The retro is now **value-triggered**: it always assesses
(one telemetry line per run) but only does the full self-editing pass when a cycle earns it
— a failure, a new pattern, a recurring mistake, a misroute, or your feedback. A routine
cycle gets a *light* retro (no forced edit, no commit); "nothing new" is a valid outcome.
This release also adds reviewer semantic-dedup + a delivery audit, planner evidence-first
scope-lock + an executability `spec_score`, sensei metrics + a fix-ratio alarm, two router
rules, a stack-decoupled `build` playbook (for non-Next/non-web projects), and worktree
execution-safety guards (main-hygiene + stale-base + inline/​hybrid execution). No breaking
changes. See [CHANGELOG.md](CHANGELOG.md) for the full version history.

---

## Install

```
claude plugin marketplace add onestudio-co/shipgate     # or a local path
claude plugin install shipgate@shipgate
```

Then restart Claude Code (or `/reload-plugins`). `/turbo` and `/kaizen` become
available. **Superpowers must be installed** — both cycles override and preserve
superpowers skills (verification, worktrees, code review, debugging).

---

## `/turbo` — generic autonomous cycle

`/turbo <natural-language task>`. Use it when you want speed and you trust the
worktree-isolation safety net. It auto-decomposes oversized scope into a
multi-iteration manifest, skips TDD by default, and merges to the base branch at the
end (PR is opt-in via `--pr`). See `skills/turbo/SKILL.md`.

## `/kaizen` — self-improving cycle (scaffolds into your repo)

Kaizen is turbo's engine plus three pillars: **playbooks**, **per-agent memory +
domain maps**, and a **value-triggered self-editing retro** (`kaizen-sensei`) that runs
after every cycle — even on failure — but only does the full self-edit when the cycle
earns it (a routine cycle gets a light, telemetry-only retro). Smart, not rigid.

Because kaizen rewrites its own playbooks, prompts, and memory, it can't run from the
read-only plugin. So on the **first** `/kaizen` in a repo it **scaffolds an editable
copy into the project**:

```
.claude/kaizen/          # the kaizen skill, engine, playbooks, memory, telemetry, CHANGELOG
.claude/agents/kaizen-*.md   # 7 role agents (planner, implementer, committer, …)
```

From then on kaizen runs from those project-local files and evolves them in place —
each repo grows its own tuned kaizen. The plugin only seeds files when they are
**absent**; it never overwrites what your repo has already learned. (Syncing improved
files back into the plugin is not automated yet.)

Layout inside the plugin:

```
skills/kaizen/SKILL.md   # thin entry: scaffolds the template, then runs the project copy
template/mechanism/      # the kaizen skill + engine + playbooks (copied to .claude/kaizen/)
template/agents/         # the 7 role agents (copied to .claude/agents/)
template/memory-seed/    # empty memory store for a fresh repo
```

---

## Version history

Every release is recorded in [CHANGELOG.md](CHANGELOG.md), grounded in the real git
diffs between versions.

---

*Built by OneStudio · `onestudio-co/shipgate`*
