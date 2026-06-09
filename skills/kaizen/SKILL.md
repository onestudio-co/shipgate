---
name: kaizen
description: >
  Self-improving build/fix/release cycle, invoked as `/kaizen <workflow> <brief>`
  (<workflow> = idea | prototype | build | fix | refactor | release; omit it and a
  cheap router picks one). Runs LOAD → PREPARE → EXECUTE → RETRO → REPORT with a
  mandatory self-editing retro. On first use it SCAFFOLDS its editable mechanism into
  the project's `.claude/` and then runs project-local, so it keeps evolving per repo.
---

# Kaizen — plugin entry (scaffolder shim)

This is the **thin plugin entry** for kaizen. Kaizen itself is not run from the plugin
(the plugin is read-only and shared). Instead the plugin carries kaizen as a **template**
and copies the editable files into the current project, where kaizen runs and improves
itself over time.

Do these two steps in order.

## Step 0 — Materialize the project-local kaizen (idempotent)

Run this Bash block from the repo root. It copies the template into `.claude/` **only when
a piece is missing**, so it never clobbers files the project has already evolved.

```bash
ROOT="${CLAUDE_PLUGIN_ROOT}"

# 1. Mechanism (SKILL.md + engine/ + playbooks/) -> .claude/kaizen/   [only if absent]
if [ ! -f .claude/kaizen/SKILL.md ]; then
  mkdir -p .claude/kaizen
  cp -R "$ROOT"/template/mechanism/. .claude/kaizen/
  echo "[kaizen] scaffolded mechanism -> .claude/kaizen/"
fi

# 2. Agents (the kaizen-*.md set, registered per-project) -> .claude/agents/ [only if absent]
#    (find, not a bare glob — portable across bash/zsh, no "no matches" noise)
if [ -z "$(find .claude/agents -maxdepth 1 -name 'kaizen-*.md' 2>/dev/null)" ]; then
  mkdir -p .claude/agents
  cp "$ROOT"/template/agents/kaizen-*.md .claude/agents/
  echo "[kaizen] scaffolded agents -> .claude/agents/"
fi

# 3. Memory seed -> .claude/kaizen/  [only if the memory store is absent]
#    A repo that already has .claude/kaizen/memory keeps its accumulated learnings.
if [ ! -d .claude/kaizen/memory ]; then
  cp -R "$ROOT"/template/memory-seed/. .claude/kaizen/
  echo "[kaizen] seeded empty memory store -> .claude/kaizen/memory/"
fi

echo "[kaizen] ready."
```

Notes:
- This **seeds when absent, never overwrites**. To pull a newer mechanism from an updated
  plugin, the user deletes `.claude/kaizen/SKILL.md`, `.claude/kaizen/engine`,
  `.claude/kaizen/playbooks` (keeping `.claude/kaizen/memory`) and re-runs `/kaizen`.
  Syncing evolved files back into the plugin is out of scope for now.
- After this step the project owns `.claude/kaizen/` (skill + engine + playbooks + memory)
  and `.claude/agents/kaizen-*.md`. The retro agent (`kaizen-sensei`) edits these
  project-local files, so self-improvement is fully local to the repo.

## Step 1 — Run the project-local kaizen

Read `.claude/kaizen/SKILL.md` and follow it **exactly**, passing along the `/kaizen`
arguments (`$ARGUMENTS`) as the `<workflow> <brief>`. That file is the real kaizen
entry (CHEAP CLASSIFICATION router + the 5 fixed phases). Everything it references lives
under `.claude/kaizen/` and `.claude/agents/kaizen-*.md` — all now present from Step 0.
