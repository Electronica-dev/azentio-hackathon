# Demo script â€” 3 minutes

**Roles:** C narrates. FE drives. You answer architecture.
**Rule:** never debug in front of judges. If it breaks, switch to the backup video.

## Before you walk on

- [ ] `run.cmd` running on the demo laptop; `http://127.0.0.1:8787` open.
- [ ] Browser zoom 100%, window 1440Ã—900, bookmarks bar hidden.
- [ ] Start on `#/inbox`; scroll top.
- [ ] Second laptop on the same URL, same state.
- [ ] Backup video open in a tab, muted, paused at 0:00.
- [ ] Deck PDF open in a third tab.
- [ ] Phone timer visible to C only.

## The script

### 0:00 â€” Hook (inbox)
> â€œA circular drops on Friday. Forty-seven pages. Thirty-one days to comply. Somewhere in here is a change to a system that nobody in this room has heard of.â€

Pause. Let them read the inbox.

### 0:15 â€” Scale (inbox)
> â€œThree sources, two regulators, twenty-three critical impacts â€” already assessed. This is not a summary. It is a work plan.â€

Hover the KYC row, then click.

### 0:30 â€” The redline (source, Section 16)
> â€œHere is the amendment. The old twenty-four-month re-KYC cycle is struck through. The new twelve-month cycle is inserted. Every obligation below is anchored to this clause â€” not generated from thin air.â€

Click **Section 16**. Then click the **Section 17** obligation.

### 0:50 â€” The gap (source, impacts)
> â€œBeneficial ownership used to mean twenty-five per cent. It now means ten. Our core banking CIF hard-codes twenty-five. That is not a policy edit â€” that is a twenty-five-day system change, owned by Vikram, due November twenty-fourth.â€

Point at the delta `25 â†’ 10` and the owner.

### 1:15 â€” The decision (approve)
> â€œPriya, the compliance owner, approves the impact. That approval is not a checkbox in a spreadsheet â€” it is a hash-chained event.â€

Click **âœ“**. Wait for the toast. Point at the approved tag.

### 1:30 â€” The plan (change plan)
> â€œTwenty-five tasks. Two hundred and ninety-seven effort-days. Sequenced policy first, then process, then system. Every task has an owner and a due date derived from the effective date.â€

Click **Open change plan**. Move one task to **Approved** (hover the card, click Approve).

### 1:55 â€” The graph (impact graph)
> â€œThis is the whole story in one picture: clause, obligation, asset, task. No black box. Every edge is a piece of evidence.â€

Toggle **Critical path**. Click a node to open the detail.

### 2:20 â€” The proof (audit)
> â€œAnd this is what the auditor gets. Every extraction, every score, every approval, hash-linked to the one before it. Verify the chain. Export the pack.â€

Click **Verify chain**. Point at `Chain verified`. Click **Download .md pack**.

### 2:40 â€” Close
> â€œRegula turns regulatory text into an auditable change programme â€” under thirty milliseconds, with every claim traceable. Thank you.â€

## If the live run is part of the brief

At 0:20, instead of opening KYC:
1. Click **Run agent** on the unanalysed SEBI circular.
2. Let the modal animate. Say nothing for two seconds; let the steps land.
3. â€œSix steps. Nine obligations. Twenty-nine impacts. Ten tasks. Nineteen milliseconds.â€
4. Click **View assessment** and continue at 0:30.

## Q&A handoff

- C answers product/business.
- You answer architecture/accuracy/integration.
- FE answers UI/UX and â€œhow did you build it so fastâ€.
- If a question is about something we didnâ€™t build: â€œOut of scope for the prototype; hereâ€™s the extension point.â€ Never bluff.

## The five sentences to memorize

1. â€œImpact is a graph, not a summary.â€
2. â€œEvery claim is anchored to a clause.â€
3. â€œThe gap is numeric: 25 to 10, 24 months to 12.â€
4. â€œA human approves; the agent never executes.â€
5. â€œThe audit chain is the product.â€
