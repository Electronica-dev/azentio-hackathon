# Regula â€” Hackathon Operating Plan
**Azentio.ai Build Labs Â· Sat 31 Oct 2026 Â· Challenge 02 â€” Regulatory Change Impact Agent**

> Theme (from the official challenge portfolio): **â€œTrack changes and assess policy, process and system impact.â€**
> The detailed brief drops at 10:00. This plan assumes the brief adds *constraints*, not a new universe.

---

## 1. The edge in one page

Most teams will build a chatbot that summarises a circular. Judges will see ten of those before lunch.

We are building the thing a bank actually needs after the summary: **a traceable decision chain from a clause to a named owner, a system change and an audit event.**

**The spine (does not change, whatever the brief says):**

```
Regulatory document
  â†’ clauses + redline (what changed)
  â†’ obligations (what must be done, with verbatim evidence)
  â†’ asset graph (policy / process / system / control)
  â†’ impact score + gap (why it matters, numerically)
  â†’ owned, sequenced change tasks (who does what by when)
  â†’ human approval + hash-chained audit (can we prove it?)
```

Every plausible problem statement is a skin over this spine:

| If the brief saysâ€¦ | We showâ€¦ |
|---|---|
| â€œTrack regulatory changesâ€ | Clause-level redline, amendment inbox |
| â€œAssess policy impactâ€ | Policy assets, clause-to-policy edges |
| â€œAssess process impactâ€ | Process assets, owner + effort |
| â€œAssess system impactâ€ | Parameter deltas (`24 months â†’ 12`), system gaps |
| â€œPrioritiseâ€ | Severity score, critical path |
| â€œGenerate a planâ€ | 25 tasks, dependencies, due dates |
| â€œAudit / evidenceâ€ | Hash chain, exportable assessment pack |
| â€œMulti-regulatorâ€ | RBI + SEBI in the same inbox |
| â€œWhat-if / simulateâ€ | Change a threshold, watch impacts re-score |
| â€œChat with regulationsâ€ | Add an â€œAsk Regulaâ€ panel over the same evidence |

**Five unfair advantages we already have:**
1. The official 15-theme portfolio is in `misc/challenges.pdf`; our theme is #02 and its exact wording is known.
2. Zero-install stack: `run.cmd` â†’ Python stdlib + static ES modules. No npm, no pip, no Wi-Fi dependency.
3. Contract-first API + generated mock fixture means FE and BE never wait on each other and never merge into the same file.
4. The demo is a **decision** (â€œapprove this impact, watch the audit writeâ€), not a generated paragraph.
5. The deck narrative and this runbook are pre-written; teammate C fills numbers instead of starting from blank slides.

---

## 2. The clock (real event timings)

| Time | What happens | Our move |
|---|---|---|
| 08:00â€“10:00 | Check-in, breakfast, setup | Run `run.cmd` on all three laptops. Confirm offline mode. Print/keep this plan open. Assign roles. |
| 10:00â€“10:30 | Opening + challenge briefing | **Do not code.** Capture the exact PS, judging criteria, submission format, milestone rules. |
| 10:30â€“10:50 | Decode | Fill the PS decoder (Â§6). Pick the one demo story. Decide what to fake. |
| 10:50â€“11:00 | Contract freeze | Agree `contracts/api.md` v1.0. Create branches. 10-minute setup. |
| 11:00â€“12:30 | Sprint 1 | BE: real document + domain pack. FE: rebrand + inbox + source view. C: deck skeleton + data sheet. |
| 12:30â€“13:00 | **Integration checkpoint 1** | End-to-end run on the real document. Tag `demo-1`. Fix only blockers. |
| 13:00â€“14:00 | Working lunch | C writes the 3-minute script. FE polishes. BE handles edge cases. |
| 14:00â€“15:30 | Sprint 2 | Graph, plan, review, export, audit. C builds visuals + rehearses alone. |
| 15:30â€“16:00 | **Integration checkpoint 2** | Full demo twice. Tag `demo-2`. Decide feature freeze. |
| 16:00â€“17:00 | Hardening | Bug bash, backup video, deck final, submission copy. **No new features after 16:00.** |
| 17:00â€“17:30 | Rehearsal Ã—2 | Timed, with handoffs. Q&A drill. |
| 17:30â€“17:45 | **Submit** | Code + deck + video link. Screenshot the confirmation. |
| 17:45â€“18:00 | Buffer | Only fix submission blockers. |
| 18:30â€“20:15 | Top 10 final jury | If we advance: 5-min pitch + 3-min Q&A. Same story, tighter. |

**Hard rule:** the demo must be submit-ready by **17:30**, not 18:00. Submission portals fail at deadlines.

---

## 3. Roles and file ownership

| Person | Owns | Does **not** touch | Primary output |
|---|---|---|---|
| **You (BE / lead)** | `app/regula/**`, `app/serve.py`, `app/data/**`, `contracts/**`, `run.cmd` | `web/**` after 11:30, `deck/**` | Engine, API, domain pack, integration, git gatekeeper |
| **FE** | `web/**` (HTML, CSS, JS, views, mock consumption) | `app/**`, `contracts/**` (review only) | Inbox, assessment workspace, graph, plan, audit UI |
| **C (generalist)** | `deck/**`, `docs/DEMO-SCRIPT.md`, submission copy, QA | `app/**`, `web/**` | Deck, script, backup video, judge Q&A, timer |

**Demo roles:** C narrates, FE drives the keyboard, you answer architecture questions. Rehearse the handoff (â€œPriya approvesâ€¦â€) â€” no dead air while someone finds a mouse.

**At 16:30, rotate:** C must be able to run the demo alone if FEâ€™s laptop dies.

---

## 4. Merge-conflict protocol (the explicit ask)

The goal is simple: **two people coding in parallel, zero shared files, zero merge conflicts.**

### 4.1 Freeze the contract, not the code
- `contracts/api.md` is frozen at **11:20**. It defines every field the UI reads.
- Only **you** change it. Changes are **additive only** and announced in the group chat as a one-line diff + version bump (`v1.0 â†’ v1.1`).
- FE codes against `web/mock/state.json`, generated from the same seed by `python app/export_mock.py`. It is **read-only** for FE.
- At 12:30, flip one switch: `?mock=1` off. Nothing else changes.

### 4.2 Directory ownership = conflict prevention
```
app/          YOU          engine, API, data, tests
web/          FE           all UI, all CSS, all views
contracts/    YOU          review by FE
docs/         C            plan, script, deck outline
deck/         C            pptx, pdf, images
misc/         nobody       source event material
```
Never edit a file you do not own. If a change is needed across the boundary, the owner makes it.

### 4.3 Git discipline
- `main` is always demo-able. Work on `be/<topic>` and `fe/<topic>`; merge by rebase, not merge commits.
- Push every 30 minutes. Tag `demo-1` at 13:00, `demo-2` at 16:00.
- Commit prefixes: `be:`, `fe:`, `deck:`, `docs:`.
- `git pull --rebase` before every push. Never force-push `main`.
- No dependency installs. No lockfiles. No mass reformat. No cross-boundary renames.

### 4.4 Integration checkpoints
At 12:30 and 15:30 only:
1. FE removes `?mock=1`.
2. BE starts the live server.
3. Walk the demo path once: inbox â†’ source â†’ approve â†’ plan â†’ graph â†’ export â†’ audit.
4. Write failures in `docs/INTEGRATION.md`; fix only blockers.

### 4.5 If a conflict happens anyway
The file owner resolves it. The other personâ€™s change is re-applied **by the owner**, never by â€œaccept bothâ€. Then add a one-line note in the commit message.

---

## 5. The 6-hour build plan (what â€œdoneâ€ means)

### Sprint 1 â€” 11:00â€“12:30 (make it real)
**BE**
- Wire the actual PS document (paste text â†’ `app/data/`), verify clause splitting and obligations.
- Add/adjust the domain pack: 8â€“12 assets relevant to the PS, with `params` that conflict with the new rule.
- Run `/api/state`, `/api/sources/{id}/run`, `/api/export/{id}`.
- Regenerate `web/mock/state.json`.

**FE**
- Apply Azentio palette/typography, replace product name if needed.
- Inbox: KPI row, source table, deadline panel, activity.
- Source: 3-pane workspace, clause redline, obligation cards, impact cards, approve action.
- Verify at 1440Ã—900 and 1280Ã—720.

**C**
- Deck skeleton: title, problem, insight, solution, demo storyboard, architecture, impact, team.
- Fill numbers from `/api/state` (not from memory).
- Draft 3-minute script; time it.

**Done when:** a stranger can open the URL, click a circular, see a redline, an obligation, an impact and an owner.

### Sprint 2 â€” 14:00â€“15:30 (make it memorable)
**BE**
- Graph payload sanity, plan dependencies, export report.
- Audit chain events for every mutation.
- Optional LLM adapter only if the PS explicitly requires free-text reasoning.

**FE**
- Graph view: 5-column traceability, critical-path toggle, node detail drawer.
- Plan: kanban, priority, effort, due dates, advance status.
- Audit: chain verification, export pack.
- Micro-interactions: run modal, toasts, empty states.

**C**
- Slide visuals: one screenshot per slide, no walls of text.
- Record a 90-second backup screen capture.
- Q&A cheat sheet; rehearse the 3-minute script twice.

**Done when:** the full 3-minute demo runs without a single â€œumm, waitâ€.

### Hardening â€” 16:00â€“17:00
- Fresh clone test on a clean folder.
- `python app/serve.py --reset` from zero.
- Backup video plays offline.
- Deck exported to PDF; fonts embedded or system-safe.
- Submission checklist completed.

---

## 6. PS decoder (10:30, 20 minutes)

Fill this in the room. Do not skip it; the brief will contain one constraint that changes the demo.

| Question | Answer (live) | What it changes |
|---|---|---|
| Exact PS sentence | | Deck slide 2 + demo opening |
| Who is the user? (compliance / audit / ops / CTO) | | Which screen leads |
| Which regulators / jurisdictions? | | Inbox filter + domain pack |
| What is the input? (PDF, text, API, email) | | Ingest adapter |
| What is the output? (plan, report, alert, ticket) | | Export / plan emphasis |
| Is â€œagentâ€ required to use an LLM? | | Add LLM adapter or stay deterministic |
| Judging weights (innovation / feasibility / impact / demo) | | Where to spend the last hour |
| Submission format (repo, video, deck, live URL) | | Câ€™s checklist |
| Milestone 1 deliverable | | First checkpoint scope |
| What would make the judge say â€œwowâ€? | | The one interaction to perfect |

**Mapping rule:** every requirement must land on one of six extension points:
`INGEST â†’ EXTRACT â†’ INVENTORY â†’ SCORE â†’ VIEW â†’ EXPORT`.
If it doesnâ€™t, itâ€™s a new feature, not a variant â€” defer it.

---

## 7. Demo script (3 minutes, exact clicks)

| Time | Screen | Narration | Click |
|---|---|---|---|
| 0:00 | Inbox | â€œA circular drops. 47 pages. 31 days. Who changes what?â€ | â€” |
| 0:15 | Inbox | â€œThree sources, two regulators, 23 critical impacts â€” already assessed.â€ | Hover KYC row |
| 0:30 | Source | â€œThis is the amendment. The old 24-month re-KYC cycle is struck through; the new 12-month cycle is inserted.â€ | Click Section 16 |
| 0:50 | Source | â€œEvery obligation is extracted with the verbatim quote. Every impact carries a numeric gap: 25% beneficial ownership becomes 10%.â€ | Click Section 17 obligation |
| 1:15 | Impact | â€œThe CIF system hard-codes 25. That is a 25-day change, owned by Vikram, due 24 November.â€ | Hover delta |
| 1:30 | Impact | â€œPriya approves it. The approval is hash-chained, not a checkbox in a spreadsheet.â€ | Click âœ“ |
| 1:45 | Plan | â€œTwenty-five tasks, 297 effort-days, sequenced policy â†’ process â†’ system.â€ | Move one task |
| 2:10 | Graph | â€œThis is the whole story: clause â†’ obligation â†’ asset â†’ task. No black box.â€ | Toggle critical path |
| 2:35 | Audit | â€œAnd this is what the auditor gets: every event, every hash, verifiable.â€ | Click Verify chain |
| 2:50 | Close | â€œRegula turns regulatory text into an auditable change program â€” in under thirty milliseconds.â€ | â€” |

**Backup plan:** if the live server dies, switch to the recorded 90-second video and continue narrating. Do not debug in front of judges.

---

## 8. Deck (9 slides, 16:9)

1. **Title** â€” Regula. Regulatory change, resolved. One-line thesis.
2. **The problem** â€” a circular, a spreadsheet, a deadline. Three numbers.
3. **The insight** â€” impact is a graph, not a summary.
4. **The product** â€” one pipeline, five artefacts: redline, obligations, impact, plan, evidence.
5. **Demo storyboard** â€” three screenshots with captions (not feature lists).
6. **Why itâ€™s trustworthy** â€” evidence-linked, deterministic, human-in-loop, hash-chained.
7. **Architecture** â€” ingest â†’ extract â†’ map â†’ score â†’ plan â†’ audit, with the six extension points.
8. **Impact** â€” time saved, coverage, audit readiness; realistic pilot metrics.
9. **Team + ask** â€” who we are, what weâ€™d build in 30 days.

**Slide rules:** one idea per slide, â‰¤25 words of body text, one screenshot or diagram, no bullet walls. Numbers on slides must match the app at submission time.

---

## 9. Judge Q&A cheat sheet

| Question | Answer |
|---|---|
| â€œIs this just an LLM wrapper?â€ | â€œNo model call is required. The pipeline is deterministic; an LLM adapter is optional for extraction. That is why it runs in sub-30 ms and why every output is reproducible.â€ |
| â€œHow do you prevent hallucination?â€ | â€œEvery obligation carries a verbatim quote and clause reference. The critic step rejects an impact with no evidence. Confidence is surfaced, not hidden.â€ |
| â€œHow is this different from a GRC tool?â€ | â€œGRC tracks what you tell it. Regula reads the change, maps it to your control library, quantifies the gap and drafts the plan.â€ |
| â€œWould a bank trust it?â€ | â€œIt never auto-executes. Humans approve impacts; every action is append-only and hash-chained; the evidence pack exports without trusting the agent.â€ |
| â€œWhatâ€™s real vs mocked?â€ | â€œThe engine, API, redline, scoring, plan and audit are real. The asset inventory and circulars are a curated demo pack; swapping in a bankâ€™s inventory is a JSON import.â€ |
| â€œHow does it scale to 500 circulars?â€ | â€œSame pipeline; add ingestion adapters and a queue. Scoring is O(obligations Ã— assets) and currently milliseconds.â€ |
| â€œWhy these assets?â€ | â€œThey mirror a mid-size bankâ€™s KYC/lending stack: CIF, onboarding, CKYC, AML, CRILC, DMS, V-CIP, consent. Each has an owner and a parameter.â€ |
| â€œWhat would you do with 30 more days?â€ | â€œPDF/table extraction, real control-library import, Jira/ServiceNow sync, reviewer workflow, and a gold-set accuracy benchmark.â€ |

**Never say:** â€œItâ€™s AI, so it figures it out.â€ Say: â€œIt extracts, maps, scores and proves â€” and a human approves.â€

---

## 10. Risks and countermeasures

| Risk | Probability | Countermeasure |
|---|---|---|
| PS adds a requirement we didnâ€™t build | High | Six extension points; 20-minute re-scope after each milestone; defer anything that isnâ€™t demo-visible |
| Venue Wi-Fi fails | Medium | Zero-install, offline; everything runs on localhost |
| Live demo fails | Medium | Backup video + screenshots + second laptop with the same repo |
| Merge conflict | Low (by design) | Contract freeze + directory ownership + checkpoints |
| Time overrun | High | Feature freeze 16:00; submit 17:30 |
| Deck unfinished | Medium | Skeleton committed now; C fills, never designs from scratch |
| Judge asks for a document we havenâ€™t seen | Medium | Paste-text fallback: `POST /api/sources` (30-min add) or run the closest seeded circular |
| Someone â€œimprovesâ€ the UI at 17:50 | Fatal | `main` frozen at 17:30; no commits after submission |

---

## 11. Definition of done (tick at 17:30)

- [ ] `run.cmd` works on a clean machine with only Python installed.
- [ ] Three sources visible; at least one fully analysed.
- [ ] Live run on an unanalysed source completes in under 2 seconds.
- [ ] Clause redline shows at least one oldâ†’new numeric change.
- [ ] Impact card shows current value, required value, owner, effort, due date.
- [ ] Approve action writes an audit event and updates the card.
- [ ] Plan has â‰¥10 tasks across â‰¥3 columns, with owners and due dates.
- [ ] Graph renders and a node opens a detail panel.
- [ ] Export downloads a markdown assessment.
- [ ] Verify chain returns â€œchain intactâ€.
- [ ] Deck PDF exported; 9 slides; numbers match the app.
- [ ] Backup video recorded and playable offline.
- [ ] Submission confirmed with a screenshot.

---

## 12. What not to build

Auth, multi-tenancy, real PDF OCR, vector databases, microservices, Docker, Kubernetes, chat UI, dark mode, drag-and-drop, email notifications, Jira sync, user management, settings pages.

Every one of these is a way to lose six hours and demo nothing.

---

## 13. Repository map

```
run.cmd                  one command, no install
app/
  serve.py               stdlib HTTP + JSON API
  regula/                ingest Â· extract Â· match Â· assess Â· planner Â· audit Â· store
  data/                  circulars, prior versions, asset inventory
  export_mock.py         regenerates web/mock/state.json
contracts/api.md         frozen contract
web/                     zero-build ES-module frontend
  js/views/              inbox Â· source Â· graph Â· plan Â· audit
docs/
  DEMO-SCRIPT.md         timed script
  DECK-OUTLINE.md        slide-by-slide notes
  PS-DECODER.md          live brief decoder
  INTEGRATION.md         checkpoint log
```

---

## 14. First 10 minutes tomorrow

1. `git init` (if not already), commit the scaffold, tag `baseline`.
2. Run `run.cmd`; open `http://127.0.0.1:8787`; click through all five screens.
3. Read `misc/challenges.pdf` again; confirm theme #02.
4. At 10:00, fill Â§6 before touching code.
5. Freeze the contract at 11:20. Then build.
