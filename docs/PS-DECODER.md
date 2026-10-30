# PS Decoder — fill this in at 10:00

Twenty minutes. No code. The brief will contain one constraint that changes the demo; find it here before sprint 1.

## The form

| Question | Live answer |
|---|---|
| Exact problem statement (copy verbatim) | |
| Who is the primary user? | |
| Regulators / jurisdictions | |
| Input format (PDF / text / API / email) | |
| Required output (plan / report / alert / ticket) | |
| Is an LLM explicitly required? | |
| What does “agent” mean to the judges? | |
| Judging weights | |
| Submission format | |
| Milestone 1 deliverable | |
| Milestone 2 deliverable | |
| The one “wow” interaction | |
| What we will explicitly not do | |

## Mapping to the six extension points

Every requirement must land here. If it doesn’t, it is a new feature — defer it.

| Extension point | Where | Cost to extend |
|---|---|---|
| **INGEST** | `app/regula/ingest.py`, `app/data/` | Low: another text file or a paste endpoint |
| **EXTRACT** | `app/regula/extract.py` (`TAG_PATTERNS`, `DEADLINE_RE`, params) | Low: a new rule |
| **INVENTORY** | `app/data/inventory.json` | Low: add assets with params and owners |
| **SCORE** | `app/regula/assess.py` | Medium: new factors, recalibrate |
| **VIEW** | `web/js/views/*.js` + one route | Medium: one screen |
| **EXPORT** | `app/regula/store.py` | Low: markdown/CSV/JSON |

## The three canned narratives

Use one. Do not blend.

### A. “The amendment lands” (default)
A regulator amends an existing master direction. We diff it, extract obligations, map to the bank’s stack, and produce a plan before the effective date.
**Best for:** “track changes”, “assess impact”, “policy/process/system”.

### B. “The new circular” (if the brief is a brand-new regulation)
No prior version. We skip the redline and lead with extraction + mapping + plan.
**Best for:** “new regulation”, “gap assessment”, “compliance roadmap”.
**Change:** demo starts on the unanalysed source; hide the redline tab.

### C. “The audit question” (if the brief is about evidence)
A supervisor asks: why did you change this system, who approved it, and what clause required it?
**Best for:** “audit”, “traceability”, “regulatory reporting”.
**Change:** demo starts on the graph, then audit, then export; source view becomes supporting evidence.

## Live brief red flags

| Phrase | What it really means | Our move |
|---|---|---|
| “Real-time” | They want polling/streaming | Say “event-driven ingestion is the next adapter”; demo a manual run |
| “All regulations” | They want breadth | Show 2 regulators + a domain-pack architecture; don’t scrape 50 docs |
| “Automatically update systems” | They want execution | Show the change ticket + approval gate; never auto-execute |
| “Chat with the regulation” | They want Q&A | Add an “Ask Regula” drawer over `obligations`; 45 min |
| “Accuracy benchmark” | They want a gold set | Be honest: evidence coverage, not accuracy claims |
| “Multi-tenant / RBAC” | Enterprise checkbox | Defer; say “out of scope for the prototype, designed for it” |

## One-sentence positioning (pick after the brief)

- If policy-led: “Regula reads the change and tells you which policies, processes and systems must move — with the evidence.”
- If audit-led: “Regula turns a regulatory change into an auditable decision chain.”
- If ops-led: “Regula turns a circular into an owned change plan in seconds.”
- If tech-led: “Regula is a deterministic impact engine with a traceability graph, not a summariser.”
