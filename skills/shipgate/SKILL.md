---
name: shipgate
description: Non-technical change review for founders, PMs, and designers (end-of-cycle review; /shipgate on demand; turbo end-of-run gate; do not use mid-cycle unless asked). Turns what changed into plain-language decision-framed cards reviewed in a browser.
---

# shipgate — non-technical change review

## When

- **Default:** once, at the end of a work cycle, before declaring done. One consolidated review, never mid-work, never auto-prompt for more frequent reviews.
- **On demand:** `/shipgate` runs a review now.
- **Turbo:** invoked automatically at the end of a turbo run as the human gate.

---

## Steps

### 1. Determine the baseline

Use in priority order:
1. Cycle or turbo kickoff SHA, if recorded.
2. `git merge-base @ @{upstream}` — divergence from the remote branch.
3. The last tag: `git describe --tags --abbrev=0`.

Always state the assumption: "Baseline: abc1234 (turbo kickoff SHA)" or "Baseline: merge-base with origin/main (no kickoff recorded)".

---

### 2. Collect the change-set

```
git diff <baseline>..HEAD
git diff HEAD   # uncommitted changes
git status      # untracked files
```

Group hunks by **INTENT** — a feature, decision, or deletion — not by file. One group = one Change Card. Ordering: NEEDS-YOU → DELETION → BEHAVIOR → SAFE.

---

### 3. Write v2 Change Cards

For each intent-group write one **Change Card object** with ALL of the following fields non-empty. The server rejects the deck with 503 if any field is empty or whitespace — treat that as "rewrite the card properly", never thin down the content to pass validation.

| field | content |
|---|---|
| `id` | short slug, e.g. `prd-restructure` |
| `headline` | plain-language what changed, no jargon |
| `plain` | 2–4 sentences a non-technical person fully understands |
| `why` | why this was done |
| `impact` | concrete effect on product / user / business |
| `decision` | the explicit question being asked of the reviewer |
| `ifApprove` | what happens if they approve |
| `ifPushBack` | what happens if they request a change |
| `example` | `{ before: "...", after: "..." }` — human-terms description of the experience before and after, NOT a code diff |
| `risk` | `NEEDS-YOU` \| `DELETION` \| `BEHAVIOR` \| `SAFE` |
| `hasDiff` | `true` if a raw diff was written to `state/diffs/<id>.txt`, else `false` |

When `hasDiff` is `true`, write the real raw `git diff` output for that group to `state/diffs/<id>.txt`.

---

### 4. Write `state/cards.json`

```json
{
  "baseline": "<SHA or ref>",
  "title": "<human cycle title, e.g. 'Sprint 12 — ICP Targeting'>",
  "cards": [ /* all Change Card objects */ ]
}
```

---

### 5. Start the server

```bash
bash <plugin>/server/start.sh --project-dir <repo>
```

Use `run_in_background` on platforms that reap child processes. Then read `<repo>/.shipgate/<id>/state/server-info` for the URL.

Tell the user:
- The URL (e.g. `http://localhost:51234`)
- That nothing is live until they submit in the browser.
- End the turn.

---

### 6. Next turn — read the decision

Read `state/decision.json`. If absent, the review is incomplete — re-share the URL. If present, act on each verdict:
- `approve` → proceed.
- `change` → apply the note.
- `question` → answer the note.

Under `/turbo` + `/loop` this auto-resumes. Otherwise the user pastes `state/prepared-message.txt` back into the conversation.

---

## Answerable test (hard rule)

Before finalising any card, ask: **would a non-technical reader still need to ask "what does this mean / what am I deciding / what actually changes for us?"**

If yes, the card is INCOMPLETE. Rewrite before serving. The server validates non-empty fields; the skill enforces depth and clarity.

---

## Rules

- Never invent product decisions — a deferred decision is risk `NEEDS-YOU`.
- `example.before` / `example.after` describe what a person **experiences**, not what the code looks like. "Before: the sign-up page asked for company size. After: it no longer does."
- The raw diff lives only in `state/diffs/<id>.txt` (the drawer). It never appears in card prose fields.
- One review per cycle unless the user explicitly asks for more.

---

## Worked examples

The same change, rendered two ways. The ❌ rendering would fail the answerable test. The ✅ rendering passes.

---

### Example 1 — "PRD reorganised around the customer journey"

**❌ thin v0.1 card (not answerable)**

```
title: PRD reorganised
what: Restructured the spec document.
why: Improve readability.
safety: Low risk, docs only.
```

A non-technical reviewer is left asking: *What was wrong with the old structure? What does "restructured" mean — content deleted? New sections added? Does this affect what the product does?*

**✅ v2 card (answerable)**

```json
{
  "id": "prd-customer-journey",
  "headline": "The product spec is now organised around what the customer does, not what the system does",
  "plain": "The existing 26-section spec described the product from the inside out — starting with the database, then the API, then the UI. We reorganised it around the customer journey: first how a user discovers the product, then how they set up their account, then how they run their first campaign. No features were removed or added.",
  "why": "The old structure made it hard to check whether the product actually serves the user at each step. The new structure lets us trace a customer from first click to first result and spot gaps.",
  "impact": "Reviews and sign-off are faster because anyone can follow the document without needing to know how the backend is built. New hires can onboard without a translation guide.",
  "decision": "Does the new structure reflect how you think about the customer journey? Are there steps you feel are missing or in the wrong order?",
  "ifApprove": "The new structure becomes the canonical reference for all future specs and design work.",
  "ifPushBack": "We revise the section order before publishing — no code changes needed.",
  "example": {
    "before": "Opening the spec, you'd see: Database schema → API routes → UI components → Analytics. To understand the sign-up flow you had to cross-reference five sections.",
    "after": "Opening the spec, you see: Discovery → Sign-up → First campaign → Results. The sign-up flow is one self-contained section you can read top to bottom."
  },
  "risk": "SAFE",
  "hasDiff": false
}
```

---

### Example 2 — "43 stale docs deleted"

**❌ thin v0.1 card (not answerable)**

```
title: 43 docs removed
what: Deleted outdated documentation files.
why: Clean up the repo.
safety: Deletion — verify nothing needed.
```

A reviewer is left asking: *Which 43 docs? Were any of them things we reference externally? How do I know nothing important was lost?*

**✅ v2 card (answerable)**

```json
{
  "id": "stale-docs-deletion",
  "headline": "43 out-of-date internal documents were permanently deleted",
  "plain": "We removed 43 files from the docs/ folder that described features from an earlier version of the product — before the pivot to Arabic-first GCC/MENA. They covered a B2C product model we are no longer building. None of the deleted files are referenced in the live product or on the marketing site.",
  "why": "Having old documents alongside current ones creates confusion: team members and new hires can't tell which is authoritative. Removing the stale ones makes the live docs the single source of truth.",
  "impact": "Team members will no longer find contradicting guidance. Onboarding time should decrease because there's only one set of docs to read.",
  "decision": "Are you confident none of these 43 documents contain commitments to customers, legal language, or content you want to preserve? If unsure, open the technical drawer to see the full file list.",
  "ifApprove": "The files are gone from history at the next squash. This is permanent.",
  "ifPushBack": "We restore the files to a separate archive branch before merging — no content is lost.",
  "example": {
    "before": "Searching docs/ for 'pricing' returned 11 results — 9 from the old B2C model and 2 from the current B2B GCC product. It was unclear which to trust.",
    "after": "Searching docs/ for 'pricing' returns 2 results, both from the current B2B GCC product."
  },
  "risk": "DELETION",
  "hasDiff": true
}
```

---

### Example 3 — "Arabic locale added to checkout"

**❌ thin v0.1 card (not answerable)**

```
title: Arabic checkout
what: Added i18n strings to the checkout flow.
why: Arabic-first requirement.
safety: Behaviour change — needs testing.
```

*What does "Arabic checkout" mean for a Saudi customer right now? Does it change anything for English users?*

**✅ v2 card (answerable)**

```json
{
  "id": "arabic-checkout",
  "headline": "Customers whose browser is set to Arabic now see the checkout flow in Arabic",
  "plain": "The checkout pages — cart summary, payment details, confirmation — now display all labels, buttons, and error messages in Arabic when the browser language is Arabic. The layout flips to right-to-left. English users see no change. Amounts and currency symbols are unchanged.",
  "why": "Our target market is GCC/MENA. A customer in Riyadh hitting a fully English checkout is a conversion blocker. This removes that blocker for the first cohort.",
  "impact": "Arabic-speaking customers can complete a purchase without switching mental context to English. Estimated to reduce checkout drop-off for Arabic users.",
  "decision": "Please confirm the Arabic wording on the payment button ('أكمل الدفع') and the error message for a declined card ('تعذّر إتمام الدفع — يرجى التحقق من تفاصيل بطاقتك') reads naturally. You are the authority on tone here.",
  "ifApprove": "The Arabic checkout ships with the next deploy.",
  "ifPushBack": "We revise the specific strings you flag — no layout or logic changes required.",
  "example": {
    "before": "A customer in Riyadh, browser set to Arabic, reached the checkout and saw 'Complete Purchase' in English, form labels in English, right-to-left text mixed awkwardly with left-to-right layout.",
    "after": "The same customer sees 'أكمل الدفع', all labels in Arabic, the entire page laid out right-to-left."
  },
  "risk": "BEHAVIOR",
  "hasDiff": true
}
```
