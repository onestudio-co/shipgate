# Shipgate — repo instructions for Claude

Studio Shipgate is a Claude Code **plugin**. It ships two autonomous work cycles:
`/turbo` (generic, stateless) and `/kaizen` (self-improving; scaffolds into the repo).

## Release documentation process (run on EVERY version bump — do not wait to be asked)

Whenever a release is cut — i.e. the `version` field changes in
`.claude-plugin/plugin.json` and/or `.claude-plugin/marketplace.json` — you MUST
update the docs **in the same change**, before committing the release. This is
mandatory and automatic. Never ship a version bump with stale `CHANGELOG.md` or
`README.md`.

Steps:

1. **Find the boundary.** Get the previous released version's commit (last release
   tag, or the previous version-bump commit if untagged) and `HEAD`.

2. **Read the real diffs, not just commit messages.** Run
   `git diff --stat <prev>..HEAD` and inspect the actual file changes. Group them
   into Added / Changed / Fixed / Removed by what the code does — not by what the
   commit subject claims.

3. **Prepend a new entry to `CHANGELOG.md`.** Newest version first. Use the existing
   format: a one-line theme, then `### Added / Changed / Fixed / Removed` sections,
   then a `_Files: N changed, +X / −Y._` footer from the diff stat. Add the
   compare/release link at the bottom.

4. **Refresh `README.md`.** Update the **Latest — vX.Y.Z** callout near the top to
   describe the new release's value in plain language, and confirm the command table
   and any feature claims still match the code. Keep the
   [CHANGELOG.md](CHANGELOG.md) links intact.

5. **Verify before claiming done.** Confirm the version in both manifest files,
   `CHANGELOG.md`, and the README callout all agree on the same version number.

The `/kaizen release` playbook (`template/mechanism/playbooks/release.md`) and the
`release` flow should treat this process as part of "a release," so the docs update
happens without the user requesting it each time.

## Writing style

The maintainer is not a native English speaker. Use simple, short sentences and
plain words in docs and changelog entries. One idea per line. Prefer active voice.
