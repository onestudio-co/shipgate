---
description: Self-improving build/fix/release cycle. On first run it scaffolds an editable kaizen into the project's .claude/, then runs project-local and keeps evolving.
---

Invoke the `kaizen` skill with the user's arguments (`$ARGUMENTS` = `<workflow> <brief>`,
where `<workflow>` is one of idea | prototype | build | fix | refactor | release, or
omitted to let the router pick). The skill scaffolds the editable mechanism into
`.claude/` on first use, then runs the project-local kaizen.
