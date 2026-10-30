# Demo script — 3 minutes

**Roles:** C narrates. FE drives. You answer architecture.
**Rule:** never debug in front of judges. If it breaks, switch to the backup video.

## Before you walk on

- [ ] `run.cmd` running on the demo laptop; `http://127.0.0.1:8787` open.
- [ ] Browser zoom 100%, window 1440×900, bookmarks bar hidden.
- [ ] Start on `#/inbox`; scroll top.
- [ ] Second laptop on the same URL, same state.
- [ ] Backup video open in a tab, muted, paused at 0:00.
- [ ] Deck PDF open in a third tab.
- [ ] Phone timer visible to C only.

## The script

### 0:00 — Hook (inbox)
> “A circular drops on Friday. Forty-seven pages. Thirty-one days to comply. Somewhere in here is a change to a system that nobody in this room has heard of.”

Pause. Let them read the inbox.

### 0:15 — Scale (inbox)
> “Three sources, two regulators, twenty-three critical impacts — already assessed. This is not a summary. It is a work plan.”

Hover the KYC row, then click.

### 0:30 — The redline (source, Section 16)
> “Here is the amendment. The old twenty-four-month re-KYC cycle is struck through. The new twelve-month cycle is inserted. Every obligation below is anchored to this clause — not generated from thin air.”

Click **Section 16**. Then click the **Section 17** obligation.

### 0:50 — The gap (source, impacts)
> “Beneficial ownership used to mean twenty-five per cent. It now means ten. Our core banking CIF hard-codes twenty-five. That is not a policy edit — that is a twenty-five-day system change, owned by Vikram, due November twenty-fourth.”

Point at the delta `25 → 10` and the owner.

### 1:15 — The decision (approve)
> “Priya, the compliance owner, approves the impact. That approval is not a checkbox in a spreadsheet — it is a hash-chained event.”

Click **✓**. Wait for the toast. Point at the approved tag.

### 1:30 — The plan (change plan)
> “Twenty-five tasks. Two hundred and ninety-seven effort-days. Sequenced policy first, then process, then system. Every task has an owner and a due date derived from the effective date.”

Click **Open change plan**. Move one task to **Approved** (hover the card, click Approve).

### 1:55 — The graph (impact graph)
> “This is the whole story in one picture: clause, obligation, asset, task. No black box. Every edge is a piece of evidence.”

Toggle **Critical path**. Click a node to open the detail.

### 2:20 — The proof (audit)
> “And this is what the auditor gets. Every extraction, every score, every approval, hash-linked to the one before it. Verify the chain. Export the pack.”

Click **Verify chain**. Point at `Chain verified`. Click **Download .md pack**.

### 2:40 — Close
> “Regula turns regulatory text into an auditable change programme — under thirty milliseconds, with every claim traceable. Thank you.”

## If the live run is part of the brief

At 0:20, instead of opening KYC:
1. Click **Run agent** on the unanalysed SEBI circular.
2. Let the modal animate. Say nothing for two seconds; let the steps land.
3. “Six steps. Nine obligations. Twenty-nine impacts. Ten tasks. Nineteen milliseconds.”
4. Click **View assessment** and continue at 0:30.

## Q&A handoff

- C answers product/business.
- You answer architecture/accuracy/integration.
- FE answers UI/UX and “how did you build it so fast”.
- If a question is about something we didn’t build: “Out of scope for the prototype; here’s the extension point.” Never bluff.

## The five sentences to memorize

1. “Impact is a graph, not a summary.”
2. “Every claim is anchored to a clause.”
3. “The gap is numeric: 25 to 10, 24 months to 12.”
4. “A human approves; the agent never executes.”
5. “The audit chain is the product.”
