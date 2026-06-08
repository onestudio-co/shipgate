# Playbook — release

PREPARE a release: update the changelog, bump the version, create a git tag.
Then STOP.

The agent prints `vercel --prod --yes` for the human. Prod always ships
manually on Mohammed's machine. The agent never runs the deploy command.

---

## Phases

| Phase | What happens |
|---|---|
| LOAD | Read this playbook + `.claude/kaizen/memory/facts.md` |
| PREPARE | Planner collects commits since last tag; drafts changelog entry and version bump |
| EXECUTE | Implementer writes CHANGELOG, bumps version in `package.json`, creates git tag |
| RETRO | Sensei records the release in `.claude/kaizen/CHANGELOG.md` |
| REPORT | Print the tag name, the changelog diff, and the deploy command for the human |

---

## Cached answers

| Question | Answer |
|---|---|
| Who deploys? | The human (Mohammed), manually, on his Mac. |
| Deploy command? | `vercel --prod --yes` (from repo root). |
| Does the agent run the deploy? | NO. Print the command; do not run it. |
| QA? | Skipped — release preparation is changelog + version + tag only. |
| Lint? | Not configured. |
| Gates before tag? | `./node_modules/.bin/tsc --noEmit` + `pnpm build` must pass before tagging. |
| Package manager? | pnpm only. |
| Where is the changelog? | `CHANGELOG.md` at repo root. |
| Version field? | `package.json` → `"version"` field. |
| Tag format? | `v<semver>` (e.g. `v1.2.0`). Follow existing tags: `git tag --list 'v*'`. |
| Vercel Git integration? | Must remain DISCONNECTED. Never wire it back. |

---

## The hard stop rule

After the implementer commits CHANGELOG + version bump + tag, the kaizen
run ends with this exact message:

```
Release prepared: <tag>

To deploy to production, run on Mohammed's Mac:

  vercel --prod --yes

Do NOT run this command from a worktree — run from the repo root.
The Vercel Git integration must remain disconnected.
```

No further automation. No deploy. No preview. Stop.

---

## Known wave shapes

Release is always a single wave:

```
wave 0: [update CHANGELOG.md, bump version in package.json]
```

Then the committer commits both files in one commit:
`release: v<version> — <one-line summary>`

Then the committer creates the tag:
`git -C <worktree> tag v<version>`

Gates run immediately after the commit, before printing the deploy command:
`./node_modules/.bin/tsc --noEmit && pnpm build`

If gates fail, the release commit is NOT tagged and the human is notified.
Fix the build before releasing.

---

## Risks

- **Auto-deploy** — the agent MUST NOT run `vercel --prod --yes`. Printing
  the command is correct; running it is a hard rule violation.
- **Red build at release time** — if `pnpm build` fails, do not tag. Notify
  the human and stop.
- **Wrong version bump** — check existing tags with `git tag --list 'v*'`
  before deciding on major/minor/patch. When in doubt, ask the user.
- **Changelog gaps** — missing commits between last tag and HEAD. Use
  `git log <last-tag>..HEAD --oneline` to enumerate commits.
- **Tagging in worktree** — the tag is created with `git -C <worktree> tag`
  so it applies to the worktree's commit; after merge, the tag resolves on
  main.

---

## Questions the planner must NOT re-ask

- "What package manager?" — pnpm (facts.md).
- "Who deploys?" — Mohammed, manually (facts.md).
- "What is the deploy command?" — `vercel --prod --yes` (facts.md).
- "Should I run the deploy?" — NO. Print it; stop (this playbook, hard stop rule).
- "What are the gates?" — tsc --noEmit + pnpm build (facts.md).
- "Where is the changelog?" — `CHANGELOG.md` at repo root.
- "What tag format?" — `v<semver>` matching existing tags.

---

## Skeleton spec template

```markdown
# Release spec — v<version>

Date: <YYYY-MM-DD>
Status: draft | approved

## Version

Previous tag: <git tag --list 'v*' | tail -1>
New version: v<semver>
Bump type: major | minor | patch — reason: <why>

## Commits since last tag

<git log <last-tag>..HEAD --oneline output>

## Changelog entry

### v<version> — <YYYY-MM-DD>

#### Added
- <item>

#### Fixed
- <item>

#### Changed
- <item>

## Files to change

- `CHANGELOG.md` — prepend changelog entry above.
- `package.json` — bump `"version"` field to `<version>`.

## Gates (must pass before tagging)

- [ ] `./node_modules/.bin/tsc --noEmit` passes
- [ ] `pnpm build` passes

## Tag

`v<version>` — created after commit, after gates pass.

## Deploy instruction (for the human)

```
vercel --prod --yes
```

Run from repo root on Mohammed's Mac. Do not run from a worktree.

## Out of scope

- Automated deploy.
- GitHub Actions or Vercel Git integration.
- Any code changes (if code changes are needed, open a build or fix ticket first).
```
