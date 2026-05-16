---
name: shipgate
description: Use at the END of a normal work cycle to let a non-technical person (founder/PM/designer) review and approve what changed — without diffs or PRs. Also use when the user runs /shipgate or asks to "review the changes for sign-off", "let the founder approve this", "non-technical review". Produces plain-language Change Cards in a browser and round-trips the decision back. Do NOT use mid-cycle unless the user explicitly asks.
---

# shipgate — non-technical change review

## When
- Default: once, at the end of a work cycle, before declaring done. One
  consolidated review. Never interrupt mid-work. Never auto-prompt for more
  frequent reviews.
- On demand: `/shipgate` runs a review now.
- Turbo: invoked automatically at a turbo run's end (its human gate).

## Steps
1. **Determine the baseline.** Use the cycle/turbo kickoff SHA if recorded;
   else `git merge-base @ @{upstream}` or the last tag. State the assumption.
2. **Collect the change-set.** `git diff <baseline>..HEAD` + uncommitted.
   Group hunks by *intent* (a feature/decision/deletion), not by file.
3. **Narrate.** For each group write a Change Card object:
   `{id,title,risk,what,why,safety,hasDiff}` — plain language, no jargon in
   what/why/safety. `risk` ∈ NEEDS-YOU|DELETION|BEHAVIOR|SAFE.
4. **Write the manifest + diffs.** Start the server:
   `bash <plugin>/server/start-server.sh --project-dir <repo>` (run_in_background
   on platforms that reap; read `<repo>/.shipgate/<id>/state/server-info` for
   the URL). Write `state/cards.json` (schema above) and one
   `state/diffs/<id>.txt` per card with that card's raw diff.
5. **Hand off.** Tell the user the URL and that nothing is live until they
   submit. End the turn.
6. **Next turn — read the decision.** Read `state/decision.json`. If absent,
   the review is incomplete — re-share the URL. If present, act on each
   verdict: apply `change` notes, answer `question` notes, proceed on all
   `approve`. Under /turbo+/loop this auto-resumes; otherwise the user pastes
   `state/prepared-message.txt`.

## Rules
- Never invent product decisions — a deferred decision is risk `NEEDS-YOU`.
- The narrative fields must be readable by a non-engineer. The diff lives only
  in `state/diffs/<id>.txt` (drawer), never in what/why/safety.
- One review per cycle unless the user explicitly asks for more.
