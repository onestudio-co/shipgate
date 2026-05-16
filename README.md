# Studio Shipgate

**Plain-language change review for the people who decide — founders, PMs, designers — not engineers.**

When Claude finishes a cycle of work, Shipgate turns *"what changed"* into a
guided, one-thing-at-a-time review in your browser. Each change is a
**Change Card**: what changed, why, what it means for the product or business,
the exact decision being put to you, and a plain-English before/after — **no
diffs, no pull requests, no red and green lines**. The technical detail is one
optional click away for anyone who wants it.

Shipgate also bundles **`/turbo`** and is its end-of-run human gate, so even an
autonomous run lands in front of a person who can actually approve it.

---

## Using it

| Command | What it does |
|---|---|
| `/shipgate` | Review the current cycle of changes now. |
| `/turbo` | Run an autonomous work cycle; Shipgate opens automatically at the end as the review gate. |

Shipgate also runs on its own at the end of a normal work cycle — you don't
have to ask. You'll be handed a local URL to open.

### Install

```
claude plugin marketplace add onestudio-co/shipgate     # or a local path
claude plugin install shipgate@shipgate
```

Then restart Claude Code (or `/reload-plugins`). `/shipgate` and `/turbo`
become available.

---

## What a review feels like

You get a URL. Open it. You see **one change at a time** — read it, decide,
move on. Every card is written for a decision-maker, not a developer.

For each card you do one of three things:

- **Approve** — you're happy. The next change appears immediately. Approvals
  never slow you down; you can move through them as fast as you like.
- **Request a change** — something should be different. Add a short note
  saying what.
- **Ask a question** — you need more before you can decide. Add the question.

The moment you request a change or ask a question, the review **pauses** and
tells you to go back to Claude. That's deliberate — you should never review
the rest while something earlier is unresolved. Go to your Claude terminal;
Claude actually does the work (makes the change, or answers you) and refreshes
the rest of the review so it stays true to reality. When Claude says it's
done, click **Continue** and the next item unlocks.

When nothing is left, you'll see **"✅ All reviewed — nothing left for
Claude."** Your decisions are recorded automatically — there's no form to
submit, and no going back: approved is approved.

**Keyboard:** `A` approve · `C` request a change · `Q` ask a question.

### The technical detail, if you want it

Every card has a **"View technical detail"** button. It opens a side panel
with the raw change for that item. You never need it to decide — it's there
purely for the technically curious. The card itself is always enough.

---

## What Claude does behind it

You don't need to know this to use Shipgate, but briefly: Claude writes the
review by grouping the work into changes *by intent* (a feature, a decision, a
deletion), explains each in plain language, and orders them so the ones
needing your judgement come first. While you review, anything you flag comes
straight back to Claude to resolve before you continue. Your final set of
decisions is handed back to Claude to act on.

Implementation detail (server, contract, state) lives in
[`docs/specs/2026-05-16-shipgate-v2-stepwise-design.md`](docs/specs/2026-05-16-shipgate-v2-stepwise-design.md)
— not here. This file is for using Shipgate.

---

*Built by OneStudio · `onestudio-co/shipgate`*
