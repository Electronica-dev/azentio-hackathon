# Regula — Hackathon Operating Plan
**Azentio.ai Build Labs · Sat 31 Oct 2026 · Challenge 02 — Regulatory Change Impact Agent**

> Theme (from the official challenge portfolio): **“Track changes and assess policy, process and system impact.”**
> The detailed brief drops at 10:00. This plan assumes the brief adds *constraints*, not a new universe.
>
> **Status: the scaffold is already built and committed (`baseline`).** Engine, API, three circulars, a 41-asset inventory, five screens, tests and this deck already run. Tomorrow is re-pointing the machine at the brief — not bootstrapping it.

---

## 1. The edge in one page

Most teams will build a chatbot that summarises a circular. Judges will see ten of those before lunch.

We are building the thing a bank actually needs after the summary: **a traceable decision chain from a clause to a named owner, a system change and an audit event.**

**The spine (does not change, whatever the brief says):**

```
Regulatory document
  → clauses + redline (what changed)
  → obligations (what must be done, with verbatim evidence)
  → asset graph (policy / process / system / control)
  → impact score + gap (why it matters, numerically)
  → owned, sequenced change tasks (who does what by when)
  → human approval + hash-chained audit (can we prove it?)
```

Every plausible problem statement is a skin over this spine:

| If the brief says… | We show… |
|---|---|
| “Track regulatory changes” | Clause-level redline, amendment inbox |
| “Assess policy impact” | Policy assets, clause-to-policy edges |
| “Assess process impact” | Process assets, owner + effort |
| “Assess system impact” | Parameter deltas (`24 months → 12`), system gaps |
| “Prioritise” | Severity score, critical path |
| “Generate a plan” | 25 tasks, dependencies, due dates |
| “Audit / evidence” | Hash chain, exportable assessment pack |
| “Multi-regulator” | RBI + SEBI in the same inbox |
| “What-if / simulate” | Change a threshold, watch impacts re-score |
| “Chat with regulations” | Add an “Ask Regula” panel over the same evidence |

**Five unfair advantages we already have:**
1. The official 15-theme portfolio is in `misc/challenges.pdf`; our theme is #02 and its exact wording is known.
2. Zero-install stack: `run.cmd` → Python stdlib + static ES modules. No npm, no pip, no Wi-Fi dependency.
3. Contract-first API + generated mock fixture means FE and BE never wait on each other and never merge into the same file.
4. The demo is a **decision** (“approve this impact, watch the audit write”), not a generated paragraph.
5. The deck narrative and this runbook are pre-written; teammate C fills numbers instead of starting from blank slides.

---

## 2. The clock (real event timings)

| Time | What happens | Our move |
|---|---|---|
| 08:00–10:00 | Check-in, breakfast, setup | Run `run.cmd` on all three laptops. Confirm offline mode. Print/keep this plan open. Assign roles. |
| 10:00–10:30 | Opening + challenge briefing | **Do not code.** Capture the exact PS, judging criteria, submission format, milestone rules. |
| 10:30–10:50 | Decode | Fill the PS decoder (§6). Pick the one demo story. Decide what to fake. |
| 10:50–11:00 | Contract freeze | Agree `contracts/api.md` v1.0. Create branches. 10-minute setup. |
| 11:00–12:30 | Sprint 1 | BE: real document + domain pack. FE: rebrand + inbox + source view. C: deck skeleton + data sheet. |
| 12:30–13:00 | **Integration checkpoint 1** | End-to-end run on the real document. Tag `demo-1`. Fix only blockers. |
| 13:00–14:00 | Working lunch | C writes the 3-minute script. FE polishes. BE handles edge cases. |
| 14:00–15:30 | Sprint 2 | Graph, plan, review, export, audit. C builds visuals + rehearses alone. |
| 15:30–16:00 | **Integration checkpoint 2** | Full demo twice. Tag `demo-2`. Decide feature freeze. |
| 16:00–17:00 | Hardening | Bug bash, backup video, deck final, submission copy. **No new features after 16:00.** |
| 17:00–17:30 | Rehearsal ×2 | Timed, with handoffs. Q&A drill. |
| 17:30–17:45 | **Submit** | Code + deck + video link. Screenshot the confirmation. |
| 17:45–18:00 | Buffer | Only fix submission blockers. |
| 18:30–20:15 | Top 10 final jury | If we advance: 5-min pitch + 3-min Q&A. Same story, tighter. |

**Hard rule:** the demo must be submit-ready by **17:30**, not 18:00. Submission portals fail at deadlines.

---

## 3. Roles and file ownership

| Person | Owns | Does **not** touch | Primary output |
|---|---|---|---|
| **You (BE / lead)** | `app/regula/**`, `app/serve.py`, `app/data/**`, `contracts/**`, `run.cmd` | `web/**` after 11:30, `deck/**` | Engine, API, domain pack, integration, git gatekeeper |
| **FE** | `web/**` (HTML, CSS, JS, views, mock consumption) | `app/**`, `contracts/**` (review only) | Inbox, assessment workspace, graph, plan, audit UI |
| **C (generalist)** | `deck/**`, `docs/DEMO-SCRIPT.md`, submission copy, QA | `app/**`, `web/**` | Deck, script, backup video, judge Q&A, timer |

**Demo roles:** C narrates, FE drives the keyboard, you answer architecture questions. Rehearse the handoff (“Priya approves…”) — no dead air while someone finds a mouse.

**At 16:30, rotate:** C must be able to run the demo alone if FE’s laptop dies.

---

## 4. Merge-conflict protocol (the explicit ask)

The goal is simple: **two people coding in parallel, zero shared files, zero merge conflicts.**

### 4.1 Freeze the contract, not the code
- `contracts/api.md` is frozen at **11:20**. It defines every field the UI reads.
- Only **you** change it. Changes are **additive only** and announced in the group chat as a one-line diff + version bump (`v1.0 → v1.1`).
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
3. Walk the demo path once: inbox → source → approve → plan → graph → export → audit.
4. Write failures in `docs/INTEGRATION.md`; fix only blockers.

### 4.5 If a conflict happens anyway
The file owner resolves it. The other person’s change is re-applied **by the owner**, never by “accept both”. Then add a one-line note in the commit message.

---

## 5. The 6-hour build plan (what “done” means)

### Sprint 1 — 11:00–12:30 (make it real)
**BE**
- Wire the actual PS document (paste text → `app/data/`), verify clause splitting and obligations.
- Add/adjust the domain pack: 8–12 assets relevant to the PS, with `params` that conflict with the new rule.
- Run `/api/state`, `/api/sources/{id}/run`, `/api/export/{id}`.
- Regenerate `web/mock/state.json`.

**FE**
- Apply Azentio palette/typography, replace product name if needed.
- Inbox: KPI row, source table, deadline panel, activity.
- Source: 3-pane workspace, clause redline, obligation cards, impact cards, approve action.
- Verify at 1440×900 and 1280×720.

**C**
- Deck skeleton: title, problem, insight, solution, demo storyboard, architecture, impact, team.
- Fill numbers from `/api/state` (not from memory).
- Draft 3-minute script; time it.

**Done when:** a stranger can open the URL, click a circular, see a redline, an obligation, an impact and an owner.

### Sprint 2 — 14:00–15:30 (make it memorable)
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

**Done when:** the full 3-minute demo runs without a single “umm, wait”.

### Hardening — 16:00–17:00
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
| Is “agent” required to use an LLM? | | Add LLM adapter or stay deterministic |
| Judging weights (innovation / feasibility / impact / demo) | | Where to spend the last hour |
| Submission format (repo, video, deck, live URL) | | C’s checklist |
| Milestone 1 deliverable | | First checkpoint scope |
| What would make the judge say “wow”? | | The one interaction to perfect |

**Mapping rule:** every requirement must land on one of six extension points:
`INGEST → EXTRACT → INVENTORY → SCORE → VIEW → EXPORT`.
If it doesn’t, it’s a new feature, not a variant — defer it.

---

## 7. Demo script (3 minutes, exact clicks)

| Time | Screen | Narration | Click |
|---|---|---|---|
| 0:00 | Inbox | “A circular drops. 47 pages. 31 days. Who changes what?” | — |
| 0:15 | Inbox | “Three sources, two regulators, 23 critical impacts — already assessed.” | Hover KYC row |
| 0:30 | Source | “This is the amendment. The old 24-month re-KYC cycle is struck through; the new 12-month cycle is inserted.” | Click Section 16 |
| 0:50 | Source | “Every obligation is extracted with the verbatim quote. Every impact carries a numeric gap: 25% beneficial ownership becomes 10%.” | Click Section 17 obligation |
| 1:15 | Impact | “The CIF system hard-codes 25. That is a 25-day change, owned by Vikram, due 24 November.” | Hover delta |
| 1:30 | Impact | “Priya approves it. The approval is hash-chained, not a checkbox in a spreadsheet.” | Click ✓ |
| 1:45 | Plan | “Twenty-five tasks, 297 effort-days, sequenced policy → process → system.” | Move one task |
| 2:10 | Graph | “This is the whole story: clause → obligation → asset → task. No black box.” | Toggle critical path |
| 2:35 | Audit | “And this is what the auditor gets: every event, every hash, verifiable.” | Click Verify chain |
| 2:50 | Close | “Regula turns regulatory text into an auditable change program — in under thirty milliseconds.” | — |

**Backup plan:** if the live server dies, switch to the recorded 90-second video and continue narrating. Do not debug in front of judges.

---

## 8. Deck (9 slides, 16:9)

1. **Title** — Regula. Regulatory change, resolved. One-line thesis.
2. **The problem** — a circular, a spreadsheet, a deadline. Three numbers.
3. **The insight** — impact is a graph, not a summary.
4. **The product** — one pipeline, five artefacts: redline, obligations, impact, plan, evidence.
5. **Demo storyboard** — three screenshots with captions (not feature lists).
6. **Why it’s trustworthy** — evidence-linked, deterministic, human-in-loop, hash-chained.
7. **Architecture** — ingest → extract → map → score → plan → audit, with the six extension points.
8. **Impact** — time saved, coverage, audit readiness; realistic pilot metrics.
9. **Team + ask** — who we are, what we’d build in 30 days.

**Slide rules:** one idea per slide, ≤25 words of body text, one screenshot or diagram, no bullet walls. Numbers on slides must match the app at submission time.

---

## 9. Judge Q&A cheat sheet

| Question | Answer |
|---|---|
| “Is this just an LLM wrapper?” | “No model call is required. The pipeline is deterministic; an LLM adapter is optional for extraction. That is why it runs in sub-30 ms and why every output is reproducible.” |
| “How do you prevent hallucination?” | “Every obligation carries a verbatim quote and clause reference. The critic step rejects an impact with no evidence. Confidence is surfaced, not hidden.” |
| “How is this different from a GRC tool?” | “GRC tracks what you tell it. Regula reads the change, maps it to your control library, quantifies the gap and drafts the plan.” |
| “Would a bank trust it?” | “It never auto-executes. Humans approve impacts; every action is append-only and hash-chained; the evidence pack exports without trusting the agent.” |
| “What’s real vs mocked?” | “The engine, API, redline, scoring, plan and audit are real. The asset inventory and circulars are a curated demo pack; swapping in a bank’s inventory is a JSON import.” |
| “How does it scale to 500 circulars?” | “Same pipeline; add ingestion adapters and a queue. Scoring is O(obligations × assets) and currently milliseconds.” |
| “Why these assets?” | “They mirror a mid-size bank’s KYC/lending stack: CIF, onboarding, CKYC, AML, CRILC, DMS, V-CIP, consent. Each has an owner and a parameter.” |
| “What would you do with 30 more days?” | “PDF/table extraction, real control-library import, Jira/ServiceNow sync, reviewer workflow, and a gold-set accuracy benchmark.” |

**Never say:** “It’s AI, so it figures it out.” Say: “It extracts, maps, scores and proves — and a human approves.”

---

## 10. Risks and countermeasures

| Risk | Probability | Countermeasure |
|---|---|---|
| PS adds a requirement we didn’t build | High | Six extension points; 20-minute re-scope after each milestone; defer anything that isn’t demo-visible |
| Venue Wi-Fi fails | Medium | Zero-install, offline; everything runs on localhost |
| Live demo fails | Medium | Backup video + screenshots + second laptop with the same repo |
| Merge conflict | Low (by design) | Contract freeze + directory ownership + checkpoints |
| Time overrun | High | Feature freeze 16:00; submit 17:30 |
| Deck unfinished | Medium | Skeleton committed now; C fills, never designs from scratch |
| Judge asks for a document we haven’t seen | Medium | Paste-text fallback: `POST /api/sources` (30-min add) or run the closest seeded circular |
| Someone “improves” the UI at 17:50 | Fatal | `main` frozen at 17:30; no commits after submission |

---

## 11. Definition of done (tick at 17:30)

- [ ] `run.cmd` works on a clean machine with only Python installed.
- [ ] Three sources visible; at least one fully analysed.
- [ ] Live run on an unanalysed source completes in under 2 seconds.
- [ ] Clause redline shows at least one old→new numeric change.
- [ ] Impact card shows current value, required value, owner, effort, due date.
- [ ] Approve action writes an audit event and updates the card.
- [ ] Plan has ≥10 tasks across ≥3 columns, with owners and due dates.
- [ ] Graph renders and a node opens a detail panel.
- [ ] Export downloads a markdown assessment.
- [ ] Verify chain returns “chain intact”.
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
  regula/                ingest · extract · match · assess · planner · audit · store
  data/                  circulars, prior versions, asset inventory
  export_mock.py         regenerates web/mock/state.json
contracts/api.md         frozen contract
web/                     zero-build ES-module frontend
  js/views/              inbox · source · graph · plan · audit
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
4. At 10:00, fill §6 before touching code.
5. Freeze the contract at 11:20. Then build.
