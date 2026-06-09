# Kaizen harvest — state directory

State for the `/kaizen harvest` workflow (kaizen learning from leading plugins).
See `../playbooks/harvest.md` for the workflow itself.

- `sources.md` — editable registry of plugins to harvest from. Add a row to add a source.
- `ledger.jsonl` — append-only dedup ledger; one line per candidate ever seen.
- `.cache/<name>/` — blobless partial clones of remote sources (`--filter=blob:none`; gitignored; never committed).
- `proposals/<date>.md` — STRUCTURAL candidates awaiting human approval (one file per run).
- `upstream/<date>.md` — backport briefs targeting the shipgate template (one file per run).

Harvest only READS source repos — it never writes to them.
