# Playbook — fix

Evidence-first bug investigation and repair. Adapted from
`.claude/skills/venture-issue-fixer/SKILL.md`. Hub MCP is OPTIONAL — the
playbook works from a plain bug brief with no MCP access.

Protocol: **claim → reproduce → confidence gate → fix → verify → advance honestly**

---

## Phases

| Phase | What happens |
|---|---|
| LOAD | Read this playbook + `.claude/kaizen/memory/facts.md` + domain maps for the affected area |
| PREPARE | Planner writes a fix-spec: claim the bug in one sentence, list reproduction steps, set confidence gate criterion |
| EXECUTE | Implementer reproduces, fixes, verifies; committer stages only touched files |
| RETRO | Sensei records what class of bug this was and updates memory |
| REPORT | Evidence summary: what was reproduced, what was changed, gate result |

---

## Cached answers

| Question | Answer |
|---|---|
| QA? | Skipped unless the bug is a regression in a tested path. |
| Lint? | Not configured — no eslint gate. |
| Gates? | `./node_modules/.bin/tsc --noEmit` + `pnpm build` after fix, before commit. |
| Hub MCP required? | No. Works from a plain bug brief. Use MCP only if hub data is needed for reproduction. |
| Package manager? | pnpm only. |
| tsc in worktree? | `./node_modules/.bin/tsc --noEmit` — never `pnpm exec tsc`. |
| Where is prod data? | `.env.local` = prod Neon. Read-only queries are safe; writes go to prod. |
| Deploy after fix? | Single-bug mode: not automatic — print `vercel --prod --yes` for the human once gates pass. QUEUE mode: deploy IS automatic at end-of-run when gates are green (mirrors `venture-issue-fixer` Ship). |

---

## Queue mode (brief = a queue, not one bug)

When the brief is "work the issue queue / clear the board / triage <venture>"
(or the brief is literally the `venture-issue-fixer` skill name), the fix runs
in QUEUE MODE. Kaizen may NOT edit that skill — only mirror its protocol here.
Evidence: run c3-fixer-queue (coordinator had to recall this from memory).

1. **Load learnings first.** `list_learnings` before touching any issue.
2. **Pick order:** Sentry → ready_for_review → in_progress → todo; within a
   bucket, severity first, then bug-before-change-request.
3. **Claim before evidence.** Move the issue `in_progress` BEFORE gathering
   evidence — the status field IS the lock against double-work.
4. **Hand back to the reporter** (set `assignee_id` to reporter) on
   ready_for_review or blocked — never leave it on yourself.
   **Hand-back is part of the SAME atomic cycle as merge/deploy — never
   deferred.** A claimed issue's cycle is NOT done at merge or deploy: the
   hand-back (comment summarizing what shipped + move to `ready_for_review` +
   `assignee_id` → reporter) must happen in the same pass that finishes the
   work. Work-complete ≠ queue-complete: code live in prod with the issue still
   `in_progress` and zero comments looks like a stalled claim to the reporter
   and is invisible to them. Evidence: run c8-fixer-queue-handback — a parallel
   session merged + deployed #23 to prod but never handed it back; at 15:15 the
   code was live, the issue had 0 comments and was still `in_progress`. This run
   verified the diff and posted the missing hand-back.
5. **Never self-approve to `done`.** Only the reporter closes.
6. One issue per cycle is fine; surface the rest as next-cycle candidates.
7. **Low-priority starvation guard.** A low item that the pick order keeps
   skipping can starve. If the SAME item is deferred TWICE, schedule it
   explicitly the NEXT cycle (force it ahead of the normal pick order once).
   Evidence: run c4-ops-issues deferred #23 (low) a second time.
8. **Speak as Nala, not as the human.** ALL queue actions — claims,
   status moves, triage comments, hand-back comments — go through the
   `onestudio-nala` MCP server (Nala's user token, configured in the
   gitignored `.mcp.json`). The human's own `onestudio` server is reserved
   for their PERSONAL comments. Never mix the two: a fixer comment from the
   human's account pollutes the thread's identity. **Check `onestudio-nala`
   availability FIRST — before the queue pass, claim nothing until confirmed.**
   If the server is missing from the session, STOP queue actions and do NOT
   fall back to the personal token. The unblock instruction must be CONCRETE,
   not "reload": MCP servers in `.mcp.json` load only at session START, so the
   reliable fix is to **EXIT this session and start a new one** (or use the
   `/mcp` built-in to reconnect if the build supports it). Reassure the user
   this is safe — kaizen keeps ALL state on disk (`memory/`, `telemetry.jsonl`,
   the playbooks, and the queue itself lives in the hub), so a restart loses
   NOTHING kaizen needs. Repeat this concrete instruction in the REPORT on
   EVERY stop. A stopped run still runs a micro-retro + telemetry line so the
   stop is visible in run history.
   **Stop-escalation (2nd consecutive stop, same cause):** do NOT just repeat
   yourself. Diagnose WHY the unblock failed (e.g. the user re-invoked in the
   SAME session, so "reload" never took effect) and offer the next-best choice
   explicitly: "Restart the session now? Or lift rule 8 for THIS run only and
   post as yourself?" The USER stays the decision-maker — the gate must never
   silently fall back, but it MAY offer the choice.
   Evidence: user directive 2026-06-07; 13 historical fixer comments had to
   be re-attributed from the human's account to Nala (user_tokens prefix
   os_pat_9c86dc, comments flipped in prod). Run c5-nala-gate-stop: the gate
   fired on first enforcement — check-before-claim stopped cleanly, zero
   issues claimed, no identity pollution. Run c6-nala-gate-stop-2: SECOND
   consecutive stop — the user re-invoked /kaizen in the SAME session, proving
   the vague "reload" unblock did not land; this is why the unblock must be
   concrete + repeated and the 2nd-stop escalation must offer a choice.
   **RESOLVED on 3rd attempt (run c8-fixer-queue-handback):** the user fully
   EXITED and started a NEW session, `onestudio-nala` loaded, `who_am_i`
   confirmed identity nala with issues:read+write, and the gate PASSED. The
   concrete "exit and restart the session" unblock WORKED; the 2nd-stop
   escalation was never needed beyond c6. The c5/c6 stop history is now closed —
   keep this rule, but a future low learnings_seen on a queue line is NOT this
   gate failing again unless a fresh stop is reported.
9. **Reply-recheck (status-agnostic).** Comments never auto-change status, so
   any issue where Nala asked a question waits forever until the next pass
   re-reads it. At every queue pass, re-read EVERY open issue (regardless of
   status — `blocked`, `todo`, `in_progress`, `ready_for_review`) whose NEWEST
   comment is (a) newer than Nala's last question AND (b) not authored by the
   fixer (Nala). Then:
   - Answer received on a `blocked` issue → move back to `todo` (as Nala) and
     run normal pick order.
   - Partial answer that asks the fixer a question → REPLY (as Nala) in the
     same pass; keep/raise `blocked` only if a human decision is still missing.
   - Nothing new → leave it.
   Do NOT key this on `blocked` alone: a reporter often answers while the issue
   sits in `todo`, and a `blocked`-only filter misses it. Evidence: run
   c8-fixer-queue-handback — #24 was in `todo` (not blocked) when reporter
   Mahmoud answered the scoping questions at 12:07 (one explicit "I don't
   understand" on Q3); the blocked-only rule 9 technically did not cover it,
   so it was caught only by reading all open issues. Earlier evidence (#21,
   user directive 2026-06-07): an answered `blocked` issue sat invisible.
10. **Deploy IS automatic in queue mode (when green).** Queue mode mirrors
    `venture-issue-fixer`, whose Ship section deploys at end-of-run if gates
    pass — so the coordinator runs `vercel --prod --yes` itself after a green
    merge, it does NOT just print the command for the human. (The "Deploy? Not
    automatic — print for human" cached answer applies ONLY to single-bug mode.)
    This was the SECOND playbook/skill deploy divergence — keep the playbook
    aligned to the skill it mirrors. Evidence: c7-fixer-queue shipped #23,
    merged --no-ff c2160f1 to main, gates green, deployed prod Ready, alias 200.

## Inline vs worktree (when to skip the worktree)

- **Single-file fix + confirmed cause + gates run before commit → inline on the
  MAIN checkout is allowed** (no worktree). This is wave 0 of "Simple bug".
  Evidence: c3-fixer-queue #22 fixed `lib/goals/schedule.ts` inline, gates green,
  commit 93940d1.
- **Multi-file fix OR unclear cause → use a worktree** and the normal wave flow.
- **Coordinator may author the fix-spec itself** when triage already collapsed
  the cause to ONE confirmed root cause in a single file — the planner dispatch
  is reserved for multi-file or still-ambiguous causes. Evidence: c3 #22 cause
  was evidence-confirmed during triage, so the planner was skipped.

## Evidence-first protocol (the five steps)

**Step 1 — Claim.**
State the bug in one falsifiable sentence:
> "When [trigger], [component] does [bad thing] instead of [expected thing]."

Do not write code yet.

**Step 2 — Reproduce.**
Gather evidence BEFORE forming a fix hypothesis:

- Read the relevant source files (use domain maps to locate them).
- If hub MCP is available: `get_issue`, `run_prod_query` (read-only), `list_sentry_issues`.
- Reproduce via the app where possible (`https://agents.test`).
- **For a data-layer 500, run the suspect loader directly instead of booting the
  app:** `tsx --env-file=.env.local -e "import('./path').then(m => m.theLoader(arg))"`
  — reproduces the exact prod digest in one command (no dev server).
- **Drizzle wraps the real error.** Unwrap the `.cause` chain
  (`let c=e; while(c.cause) c=c.cause;`) to get the true root — the surface
  "Failed query" message misleads toward SQL syntax. Evidence: c7-ops-500-digest.
- Map the stack to a specific code line.
- Write a reproduction note: "Confirmed: [evidence]."
- **Scope a multi-ask report against EXISTING code FIRST.** A bug/feature report
  with N asks is often already partly shipped — grep for each ask before planning
  any build, and POINT the reporter to what exists instead of rebuilding it.
  Evidence: a report looked like 4 asks; 2 were already live — only 2 were real
  bugs. Reading the code before planning saved building duplicates (reinforces
  "read before assuming").

Do not write code yet.

**Step 3 — Confidence gate.**
Only proceed to fix when evidence collapses the hypothesis to ONE cause.

- If evidence points to a product decision (not a code bug): post the
  question, mark blocked, stop.
- If cause is still ambiguous: gather more evidence or mark `[ASSUMPTION]`
  in the spec and proceed with the most likely cause.

**Step 4 — Fix.**
Keep changes **minimal** — within the blast radius of the confirmed cause.

**Scope lock (the kaizen `freeze`).** Before editing, declare the confirmed-cause file(s) as
the allowed write set. The planner sets `files_write` to ONLY those files; any write outside
the set is scope-drift and is rejected by the reviewer's scope dimension + delivery audit.
This is kaizen's lean equivalent of gstack `/freeze` — a fix touches the bug, not "while I
was in there" refactors. Widen the set only with explicit evidence the cause spans more files.

- Touch only the files needed.
- In `'use server'` files: every export must be async (caught by `pnpm build`, not tsc).
- After fix: run gates `./node_modules/.bin/tsc --noEmit && pnpm build`.

**Step 5 — Verify.**
Confirm the fix against the same evidence that proved the bug:

- Re-run the reproduction steps.
- Read-only prod query if the bug was data-driven.
- Never advance to done without evidence the fix works.

**Advance honestly:**
- Fixed + verified → commit with `fix(<area>): <summary>`. Print `vercel --prod --yes` for the human.
- Blocked on product decision → leave fix-spec with the open question noted.
- Could not reproduce → say so explicitly; do not guess.

---

## Known wave shapes

**Simple bug (single file):**
```
wave 0: [reproduce + fix single file]
```

**Cross-layer bug (e.g. server action + UI):**
```
wave 0: [server action fix]
wave 1: [UI fix that depends on corrected contract]
```

Fixing a `FeedItem` field affects ~6 builders — plan all ripple fixes in
explicit waves; never fix one builder and leave the others broken.

---

## Risks

- **Fixing a symptom, not the cause** — skipping reproduction leads to shallow
  patches. The confidence gate exists to prevent this.
- **`'use server'` sync export** — tsc passes silently; `pnpm build` catches it.
  Always run both gates after a fix.
- **Runtime-only 500s that NO gate catches** — some bugs pass both `tsc` AND
  `pnpm build` and only fail at request time (e.g. a `Date` object in a drizzle
  raw `sql` template → `ERR_INVALID_ARG_TYPE`; see domains/db.md). Green gates do
  NOT prove a data-layer fix works — Step 5 verify by running the loader (see
  Step 2 `tsx --env-file=.env.local`) is mandatory for these. Evidence:
  c7-ops-500-digest (gates green, page still 500'd until loader re-run confirmed).
- **Prod data writes** — `.env.local` = prod. Read-only queries are safe;
  avoid writes unless the fix requires them.
- **FeedItem ripple** — adding/removing a field on `FeedItem` in `lib/data/feed.ts`
  propagates to ~6 builders. Identify all builders before committing.
- **Missing migration** — if the fix involves a schema change, `pnpm db:push`
  must run on prod after deploy; missing tables cause 500 errors.
- **Skipping verification** — "should be fixed" without reproduction evidence
  is not verification. Do not commit unverified fixes.

---

## Questions the planner must NOT re-ask

- "What package manager?" — pnpm (facts.md).
- "What are the gates?" — tsc --noEmit + pnpm build (facts.md).
- "Is MCP required?" — no; hub MCP is optional (spec A9).
- "How to query prod data?" — `run_prod_query` if MCP available; otherwise
  read code + local reproduction.
- "Where is the DB schema?" — `lib/db/schema.ts`.
- "Where are server actions?" — `lib/actions/`.
- "Where is the feed data layer?" — `lib/data/feed.ts` (domain map: feed.md).

---

## Skeleton spec template

```markdown
# Fix spec — <bug title>

Date: <YYYY-MM-DD>
Status: draft | approved

## Claim

When [trigger], [component] does [bad thing] instead of [expected thing].

## Reproduction steps

1. <step>
2. <step>
Evidence: <what confirms the bug exists>

## Confidence gate criterion

Fix proceeds when: <one-sentence falsifiable criterion>

## Root cause (after reproduction)

<confirmed cause — cite code file + line>

## Fix plan

Files to change:
- `<file>` — <what changes and why>

`'use server'` exports affected (all must be async): <list or "none">

DB schema change? <yes/no — if yes: pnpm db:push required after deploy>

## Gates

- [ ] `./node_modules/.bin/tsc --noEmit` passes
- [ ] `pnpm build` passes

## Verification

<how to confirm the fix works — re-run reproduction steps or prod query>

## Assumptions

- **A1**: <assumption> [ASSUMPTION]

## Out of scope

- Prod deploy (manual: `vercel --prod --yes`).
```
