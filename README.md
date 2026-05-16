# shipgate

Plain-language change review for non-technical decision-makers (founders, PMs,
designers). At the end of a Claude work cycle it turns "what changed" into
Change Cards — what changed, why, how safe — reviewed in a browser, no diffs.
Bundles `/turbo` (shipgate is turbo's end-of-run human gate).

## Operator (Claude)
End of a cycle → `shipgate` skill collects the change-set, writes
`.shipgate/<id>/state/cards.json` + per-card diffs, starts the local server,
gives the reviewer a URL. Next turn it reads `state/decision.json` and acts.

## Reviewer (human)
Open the URL. Each card: 👍 Looks good / ✏️ Change this / 💬 Question
(+ note). "View technical detail" opens a side drawer with the raw diff for
the curious. Submit → Claude receives the decision (auto under /turbo, else
paste `prepared-message.txt`).

## Commands
- `/shipgate` — run a review now.
- `/turbo` — autonomous cycle; ends in a shipgate review.
