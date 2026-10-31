# Regula

**Regulatory Change Impact Agent** — track a regulatory change, assess policy / process / system impact, and produce an audit-ready change plan.

Built for the Azentio.ai Build Labs hackathon, Challenge 02.

![Inbox](misc/shot-inbox.png)

---

## Run it

**Backend** — Python stdlib only, no install:

```bat
run.cmd        :: legacy entry point, now starts backend/serve.py on :8787
```

Or directly: `python backend\serve.py --reset` (rebuilds the demo workspace from seed).

**Frontend** — Next.js dashboard, one install:

```bat
cd frontend
npm ci
npm run dev    :: http://localhost:3000
```

The frontend reads `GET http://127.0.0.1:8787/api/state` server-side and falls back to
`frontend/mock/state.json` with a visible degraded banner when the API is down.

**AI enrichment** (clause alignment, change class, plain-English significance) is a direct
OpenAI-compatible call. Put the key in the repo-root `.env`:

```ini
REGULA_LLM_BASE_URL=https://openrouter.ai/api/v1
REGULA_LLM_MODEL=z-ai/glm-5.3-flash
REGULA_LLM_API_KEY=...
```

Without a key the pipeline still runs; enrichment fields simply stay empty.

`app/` and `web/` are the original zero-build prototype, kept for reference. `backend/` +
`frontend/` are the canonical application.

---

## What it does

```
circular → clauses + redline → obligations → asset graph → scored impact → change plan → audit chain
```

- **Clause redline.** Section-level diff against the prior version, word-level additions and deletions.
- **Obligations.** Extracted with a verbatim quote, clause reference, modality, deadline and confidence.
- **Asset graph.** Every obligation is mapped to policies, processes, systems and controls with a match score and shared tags.
- **Numeric gap.** Machine-readable parameters (`review_cycle_months`, `bo_threshold_pct`, `retention_years`, …) are compared to the bank's current configuration. `24 → 12`, `25% → 10%`, `5 years → 8 years`.
- **Impact score.** Criticality × change type × urgency × gap, with a written rationale and effort estimate.
- **Change plan.** One owned task per impacted asset, priority, due date derived from the effective date, dependency on the policy change.
- **Evidence chain.** SHA-256 hash chain over every extraction, approval and status change. Exportable assessment pack.

No LLM is called. The run is deterministic and reproducible. `app/regula/llm.py` is an optional adapter stub for teams that want to add one.

---

## The demo path

1. **Inbox** — 3 sources, 2 regulators, 31 days to the KYC deadline.
2. Open **KYC Amendment 2026**.
3. Click **Section 16** — see the 24-month cycle struck through and 12 months inserted.
4. Click the **Section 17** obligation — the CIF system is hard-coded at 25% beneficial ownership; the amendment requires 10%.
5. **Approve** an impact — the audit chain gets a new hash.
6. Open the **change plan** — 25 tasks, 297 effort-days, owners and due dates.
7. Open the **impact graph** — clause → obligation → asset → task.
8. **Verify chain** and export the assessment pack.
9. Go back to the inbox and **Run agent** on the unanalysed SEBI or Digital Lending circular.

---

## Architecture

```
app/
  serve.py              stdlib ThreadingHTTPServer, static + JSON API
  regula/
    ingest.py           sequential clause parser, prior-version alignment, redline
    extract.py          obligation extraction, tags, deadlines, params
    match.py            TF-IDF + curated priors over the asset inventory
    assess.py           score, severity, delta detection, rationale, effort
    planner.py          owned tasks, dependencies, due dates
    pipeline.py         run orchestration with per-step timings
    audit.py            SHA-256 prev-hash chain
    store.py            state assembly, persistence, report export
    llm.py              optional adapter (disabled)
  data/
    rbi_kyc_2026.txt    amendment
    rbi_kyc_2024.txt    prior version (redline)
    rbi_digital_lending_2026.txt
    sebi_cyber_2026.txt
    inventory.json      41 policies, processes, systems and controls
    sources.json
web/
  index.html
  css/tokens.css        palette + type scale
  css/app.css           layout + components
  js/app.js             router, agent-run modal, chrome
  js/views/             inbox · source · graph · plan · audit
  mock/state.json       generated fixture
contracts/api.md        frozen API contract
```

**Why zero dependencies?** Hackathon Wi-Fi is a risk, npm installs are a time sink, and merge conflicts multiply with lockfiles. Python stdlib and native ES modules are enough for this demo and make the whole thing reproducible from a clean folder.

---

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/state` | Whole workspace: sources, clauses, obligations, assets, impacts, tasks, audit, runs, summary |
| POST | `/api/sources/{id}/run` | Run the agent on one source |
| POST | `/api/impacts/{id}/review` | `{decision: "approved"\|"rejected", note, actor}` |
| POST | `/api/tasks/{id}/status` | `{status: "proposed"\|"approved"\|"in_progress"\|"done", actor}` |
| GET | `/api/export/{sourceId}.md` | Download the assessment pack |
| POST | `/api/reset` | Rebuild from seed |
| GET | `/api/health` | Liveness |

Full field definitions: [`contracts/api.md`](contracts/api.md).

---

## Demo data honesty

The circulars are realistic but synthetic, written for the demo. The prior-versions file exists so the redline is real. The asset inventory is a curated model of a mid-size Indian bank's KYC and lending stack; every asset has an owner, a current state and parameters that conflict with the amendment.

The engine is real: it parses, extracts, maps, scores, plans and hashes whatever is in `app/data/`.

---

## Known limits (say this before a judge does)

- PDF/OCR ingestion is not wired; documents are text files.
- The asset inventory is curated, not imported from ServiceNow/Archer.
- Scoring weights are hand-tuned for the demo, not calibrated on a labelled gold set.
- Approval is a demo identity, not SSO.
- The optional LLM adapter is a stub.

Roadmap: PDF extraction, control-library import, Jira/ServiceNow sync, reviewer workflow, gold-set accuracy benchmark.

---

## License

Internal hackathon prototype. Not for production use.
