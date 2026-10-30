# Integration checkpoints

Two only. 12:30 and 15:30. 20 minutes each. Owner: you. Scribe: C.

## Checkpoint 1 — 12:30

| # | Check | Owner | Pass |
|---|---|---|---|
| 1 | `python app/serve.py --reset` starts clean on a fresh terminal | BE | ☐ |
| 2 | `GET /api/state` returns 3 sources and ≥1 analysed | BE | ☐ |
| 3 | FE opens the live URL without `?mock=1` and the inbox renders | FE | ☐ |
| 4 | Source view: clause click → obligation → impact → owner | FE | ☐ |
| 5 | Approve button writes an audit event | FE+BE | ☐ |
| 6 | `GET /api/export/{id}.md` downloads | BE | ☐ |
| 7 | No console errors on the demo path | FE | ☐ |
| 8 | `web/mock/state.json` regenerated from the live seed | BE | ☐ |

**If red:** fix only these. No new features. Re-run at 13:00 if needed.

## Checkpoint 2 — 15:30

| # | Check | Owner | Pass |
|---|---|---|---|
| 1 | Full 3-minute demo runs twice, timed | C | ☐ |
| 2 | Graph renders and node detail opens | FE | ☐ |
| 3 | Plan advances a task and the audit trail grows | FE+BE | ☐ |
| 4 | Verify chain returns “chain intact” | BE | ☐ |
| 5 | Export pack contains obligations + impacts + tasks | BE | ☐ |
| 6 | 1440×900 and 1280×720 both look right | FE | ☐ |
| 7 | Backup video recorded | C | ☐ |
| 8 | Deck has 9 slides with final screenshots | C | ☐ |

**If red:** cut the failing screen from the script. Do not cut the audit or the plan; they are the differentiator.

## Feature freeze — 16:00

After this, only:
- copy changes,
- number corrections,
- visual bugs that block reading,
- submission blockers.

No refactors, no new views, no dependency changes, no engine weight changes.

## Log

| Time | Failure | Owner | Status | Fix |
|---|---|---|---|---|
| | | | | |
