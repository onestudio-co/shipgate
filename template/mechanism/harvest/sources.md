# Kaizen harvest — source registry

One row per leading plugin to harvest learnings from. Add a row to add a source.
`last_harvested` is the commit SHA of the last harvested HEAD (RETRO updates it);
empty = first run, which uses `window_days`. `repo` may be a local path (with full
git history) or a clone URL (cloned read-only into `harvest/.cache/<name>`).

| name        | repo                                    | branch | last_harvested | window_days |
|-------------|-----------------------------------------|--------|----------------|-------------|
| gstack      | ~/.claude/skills/gstack                 | main   |                | 14          |
| superpowers | https://github.com/obra/superpowers.git | main   |                | 14          |

<!-- To add a source, append a row, e.g.:
| my-plugin | https://github.com/me/my-plugin.git | main | | 14 |
-->
