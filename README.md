# Studio Shipgate

**Two autonomous work cycles for Claude Code: `/turbo` and `/kaizen`.**

This plugin bundles two parallel, worktree-isolated work cycles. They share the
same execution engine (write-only implementers grouped by a file-ownership DAG, a
single serialized committer per wave, then an adversarial review pass) but differ
in how much they remember and tune themselves.

| Command | What it does |
|---|---|
| `/turbo <task>` | Generic autonomous cycle. Stateless and stable — nothing to set up, nothing it changes about itself. Best for one-off "just build/fix this fast" work. |
| `/kaizen <workflow> <brief>` | **Self-improving** cycle. Adds playbooks, per-agent memory + domain maps, and a mandatory retro that edits its own files so it gets sharper every run. `<workflow>` = idea · prototype · build · fix · refactor · release (omit it and a cheap router picks one). |

Each iteration of either runs as one dynamic `Workflow` and ends with a report on a
merged branch. Both always run in a git worktree; you review the final diff.

> **Note:** earlier versions of this plugin were a non-technical "Change Card" review
> surface. That feature has been removed — this plugin is now turbo + kaizen only.

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
domain maps**, and a **mandatory self-editing retro** (`kaizen-sensei`) that runs
after every cycle — even on failure.

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

*Built by OneStudio · `onestudio-co/shipgate`*
