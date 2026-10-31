# Level 1 — Requirements & Delegation (Regulatory Change Impact Agent)

**Brief:** AI for Regulatory Intelligence, Compliance & BFSI — KSA, UAE, India, selected African countries.
**Level 1 scope:** monitor → understand → compare → dashboard. 0–3 h window.
**Repo state:** Regula scaffold already covers India-only, redline, obligations, impacts, plan, audit, dashboard shell.

> **Clock:** T+0 = 11:25 IST. Contract freeze 11:40. Integration 12:40. `demo-1` 12:55. Hard stop 13:00.
> Every requirement below must be demo-visible; anything else is deferred.

---

## 1. Gap summary (what the brief adds to today's scaffold)

| Brief capability | Today | Gap to close |
|---|---|---|
| Monitor ≥4 sources over 4 regions | 3 seeded India docs, no monitor | Source registry (KSA/UAE/INDIA/SOUTH_AFRICA), manual trigger, dedupe, new-vs-processed |
| Manual upload PDF/DOCX/TXT | none | Upload endpoint + text extraction (DOCX/TXT solid, PDF best-effort) |
| Structured extraction with clause refs | obligations + quotes + section refs | applicability, applies_to, references-to-earlier-regs, change class per clause |
| Historical comparison + 6 change classes | section redline vs prior | classification taxonomy at clause/source level + plain-English significance |
| Side-by-side previous vs updated | single-pane redline | two-column diff view with highlight |
| Dashboard by country/regulator/date/area/class | inbox + filters | region/authority/class filters, review queue, unresolved-relationship queue, search |
| Human review / accountability / traceability | impact approve + hash chain | source-level review state + audit event |

---

## 2. Requirement catalogue

Each requirement has an ID, an observable acceptance check, and an owner. **A = AI (you), B = backend/data, C = UI (Friend A).**

### 2.1 Monitoring & repository

| ID | Requirement | Acceptance (what a judge sees) | Owner |
|---|---|---|---|
| R1 | Configure ≥4 regulatory sources across KSA, UAE, India, South Africa. | Config screen/table lists SAMA (KSA), CBUAE (UAE), RBI/SEBI (India), SARB (South Africa) with authority, region, jurisdiction, frequency. | B (data/config) + C (display) |
| R2 | Retrieve newly published documents; identify authority, jurisdiction, pub date, title, ref, effective date. | Each row shows all six fields; missing effective date shows "not stated". | B |
| R3 | Distinguish new vs already-processed documents. | Run monitor twice: second run reports `new: 0`, `duplicates: n`; UI shows "new" badge only on first. | B |
| R4 | Manual trigger of a monitoring cycle. | "Run monitoring" button → progress → result summary (`discovered/new/duplicate/errors`) in <2 s. | B (endpoint) + C (panel) |
| R5 | Configurable monitoring frequency. | Frequency editable per source (or global) and persisted; UI shows last/next run. | B + C |
| R6 | Searchable repository of all publications. | Search box filters by title/ref/authority/region; result opens the publication. | C (client-side over `/api/state`) |
| R7 | Manual upload of PDF, DOCX or text circular. | Upload a `.docx` and a `.txt` → new source appears, obligations extracted. PDF: accept + extract text or show "needs OCR" without crashing. | B (endpoint) + C (modal) |

### 2.2 Document understanding

| ID | Requirement | Acceptance | Owner |
|---|---|---|---|
| R8 | Extract obligations/mandatory requirements with clause/section reference. | Every obligation card shows clause ref + verbatim quote (already true for India; must hold for new docs). | A (extraction/enrichment) + B (deterministic baseline) |
| R9 | Classify applicability: AI, banking, lending, insurance, payments. | Applicability chips on each obligation; at least one KSA AI-in-credit obligation tagged `ai`, `lending`, `banking`. | A + B (tags) |
| R10 | Compliance deadlines and effective dates. | Source header + obligations carry deadline; countdown shown. | B (existing) |
| R11 | References to earlier regulations/circulars. | Each source lists cited prior refs; clicking opens the prior source. | A (NER) + B (resolve) |
| R12 | Clauses that introduce / amend / replace / withdraw requirements. | Clause status chip: `new`, `amended`, `replaced`, `withdrawn`. | B (redline → status) |
| R13 | Entities/departments/activities the requirement applies to. | `applies_to` chips (e.g. "Credit Risk", "Model Validation", "Retail Lending"). | A + B |

### 2.3 Historical comparison

| ID | Requirement | Acceptance | Owner |
|---|---|---|---|
| R14 | Retrieve the earlier publication and diff against it. | Opening KSA amendment shows prior 2024 circular auto-linked with confidence. | B |
| R15 | Classify changes: new obligation, modified, withdrawn/superseded, deadline extended, deadline shortened, clarification, no material change. | Every changed clause/source carries exactly one of the 7 classes; dashboard filter uses them. | B (rules) + A (LLM tie-break + significance) |
| R16 | Side-by-side previous and updated clauses, highlighted, with plain-English significance. | Two-column view: red strikethrough / green insert; one sentence "why it matters". | C (view) + A (significance text) |

### 2.4 Dashboard & governance

| ID | Requirement | Acceptance | Owner |
|---|---|---|---|
| R17 | Dashboard by country, regulator, publication date, business area, change classification. | All five filters work together; counts update. | C |
| R18 | Distinguish new publications, amendments, awaiting review, unresolved relationship. | Four distinct states visible in the table and as queue tabs. | C + B (fields) |
| R19 | Open any publication → obligations + source references. | Two clicks from dashboard to a clause quote. | C |
| R20 | Human review, approval, accountability, traceability. | Source review action (reviewed/rejected) writes a hash-chained audit event with actor; impact approval still works. | B (audit) + C (button) |

---

## 3. Contract v1.1 — additive only (freeze 11:40)

Existing fields never change. All new fields optional in the UI.

### `Source` additions

```jsonc
{
  "region": "KSA",                  // KSA | UAE | INDIA | SOUTH_AFRICA
  "authority": "SAMA",              // SAMA | CBUAE | RBI | SEBI | CBN
  "jurisdiction": "Saudi Arabia",
  "doc_type": "amendment",          // circular | amendment | guideline | consultation
  "url": "https://www.sama.gov.sa/...",
  "first_seen": "2026-10-31T11:30:00+05:30",
  "processed_at": "2026-10-31T11:31:00+05:30",
  "relationship": {                 // link to the earlier regulation
    "status": "linked",             // linked | standalone | unresolved
    "prior_source_id": "src-sama-ai-2024",
    "confidence": 0.87,
    "rationale": "Both govern model risk in credit decisioning."
  },
  "change_class": "modified",       // see R15 enum
  "review_state": "awaiting_review" // new | awaiting_review | in_review | approved | rejected
}
```

`change_class` enum (source + clause level):
`new_obligation`, `modified`, `withdrawn`, `deadline_extended`, `deadline_shortened`, `clarification`, `no_material_change`.

### `Clause` additions

```jsonc
{
  "change_class": "modified",
  "significance": "Model validation moves from annual to semi-annual — the validation calendar must be rebuilt.",
  "prior_clause_id": "src-sama-ai-2024#c7"
}
```

### `Obligation` additions

```jsonc
{
  "applicability": ["ai", "lending", "banking"],
  "applies_to": ["Credit Risk", "Model Validation", "Retail Lending"],
  "references": ["SAMA/2024/31"],
  "significance": "…",
  "enrichment": "llm"               // llm | rule | none  (honesty flag)
}
```

### `meta` additions

```jsonc
{
  "regions": ["KSA", "UAE", "INDIA", "SOUTH_AFRICA"],
  "monitor": {
    "configured_sources": 6,
    "frequency_hours": 6,
    "last_run": "2026-10-31T11:30:00+05:30",
    "next_run": "2026-10-31T17:30:00+05:30"
  }
}
```

### New endpoints

| Method | Path | Body / response | Owner |
|---|---|---|---|
| `POST` | `/api/monitor/run` | `{}` → `{run:{discovered,new,duplicates,ingested,errors[],ms}}` | B |
| `POST` | `/api/sources/upload` | `{filename, content_base64, authority?, region?}` → `{source}` | B |
| `POST` | `/api/sources/{id}/review` | `{decision:"reviewed"\|"rejected", actor, note}` → `{source}` + audit event `source.reviewed` | B |
| `GET` | `/api/sources?q=` | optional; UI may filter `/api/state` client-side | B |

Search can stay client-side (state is one document). Upload stays JSON+base64 (no multipart parser in stdlib).

---

## 4. Work packages

### A — AI (you): `app/regula/llm.py`, `app/regula/enrich.py`, `app/data/ai_cache.json`

Deliverables:
1. **Provider adapter** — OpenAI-compatible via `REGULA_LLM_BASE_URL`, `REGULA_LLM_API_KEY`, `REGULA_LLM_MODEL`; strict JSON output; timeout 8 s; hard fallback to rules.
2. **Obligation enrichment** — from a clause, return `{statements:[{statement, quote, applicability[], applies_to[], references[], deadline}], confidence}`. Reject any quote not a verbatim substring of the clause (no hallucinated evidence).
3. **Change classification + significance** — given prior/new clause pair and the rule-based guess, return `change_class` + one-sentence `significance`; must agree with the rule for numeric/deadline changes unless it gives a reason.
4. **Relationship detection** — new doc vs candidate prior docs: return `{prior_source_id, confidence, rationale}`; nil if none.
5. **Offline cache** — run once against the seeded docs, commit `app/data/ai_cache.json`; demo reads cache so no network is needed on stage.
6. **Honesty flag** — every enriched object carries `enrichment: "llm"|"rule"` and `confidence`; UI shows it.

Acceptance: KSA AI circular yields ≥5 obligations tagged `ai`; significance present on every changed clause; kill the network → demo still runs (cache).

### B — Backend / data / ops: `app/serve.py`, `app/regula/**` (except llm/enrich), `app/data/**`, `contracts/**`, tests

Deliverables:
1. **Source registry** `app/data/regulators.json`: 6 sources, 4 regions, frequency, homepage, feed/offline mirror path, enabled.
2. **Data pack** (synthetic but realistic, matching existing style):
   - KSA SAMA — AI in Credit Decisioning (2026) **amend** 2024 AI governance circular.
   - UAE CBUAE — Consumer Protection (2026) **amend** 2024 regulation.
   - South Africa SARB — Proposed directive on BA returns (2026), issued for consultation.
   - Keep India RBI KYC + RBI Digital Lending + SEBI Cyber.
   - Prior docs where an earlier version exists so side-by-side is real.
3. **Monitor** `app/regula/monitor.py`: fetch each configured feed with 3 s timeout → on failure use `app/data/feeds/<id>.txt`; hash-dedupe against repository; mark `first_seen` / `processed_at`; return run stats.
4. **Upload** `app/regula/upload.py`: `.txt` direct; `.docx` via `zipfile` + XML strip; `.pdf` best-effort text extraction (raw stream scan) or store with `needs_review` flag. Never 500 on a bad file.
5. **Change classifier** `app/regula/change.py`: redline/param rules → 7 classes; relationship confidence via existing TF-IDF + tag overlap; `<0.45` → `unresolved`.
6. **Inventory additions** for AI/lending: AI Governance Policy, Model Risk Control, Explainability Control, Model Validation Process, Credit Decision Engine, AI Vendor Register — each with params that conflict with the KSA amendment.
7. **API**: endpoints in §3; `POST /api/reset` reseeds; export .md gains region/classification columns; audit events for monitor runs, uploads, source reviews.
8. **Tests**: monitor dedupe, upload docx/txt, classifier on the 7 cases, relationship unresolved path; keep `test_engine.py` green.
9. **Ops**: `run.cmd`, `README` update, mock export, `demo-1` tag, fresh-clone check.

### C — UI (Friend A): `web/**` only

Deliverables:
1. **Dashboard**: region chips (KSA/UAE/INDIA/SOUTH_AFRICA), authority + change-class + business-area filters, date sort, search; KPI row per region; queues: *Awaiting review*, *Unresolved relationship*.
2. **Monitor strip**: configured-sources count, last/next run, **Run monitoring** button calling `POST /api/monitor/run` with toast + state refresh; **Upload** modal (file → base64 → `POST /api/sources/upload`).
3. **Source view**: side-by-side prior vs current clause (use `previous_text` + redline), significance sentence, applicability/applies_to/reference chips, change-class badge; keep existing obligation + impact panels.
4. **Review**: source review button (reviewed/rejected) + audit toast; keep impact approval.
5. **Empty/unresolved states**: "No reliable prior regulation found" card instead of a broken diff.
6. **Mock parity**: `?mock=1` loads regenerated `web/mock/state.json`; verify 1440×900 and 1280×720.

---

## 5. Data pack spec (B, ship by 12:10)

> **Superseded for Africa.** The pack actually shipped onboards **SARB (South Africa)** as the
> African regulator — `src-sarb-ba-returns-2026`, region `SOUTH_AFRICA`, discovered from the
> SARB News and Publications RSS feed. The planned CBN (Nigeria) rows below are kept as the
> original plan; region `AFRICA` no longer exists because a region is a country, not a continent.

| id | region | authority | doc_type | title | prior |
|---|---|---|---|---|---|
| `src-sama-ai-2026` | KSA | SAMA | amendment | AI in Credit Decisioning — Amendment 2026 | `src-sama-ai-2024` |
| `src-sama-ai-2024` | KSA | SAMA | circular | AI & Model Risk Governance Circular 2024 | — |
| `src-cbuae-cp-2026` | UAE | CBUAE | amendment | Consumer Protection — Amendment 2026 | `src-cbuae-cp-2024` |
| `src-cbuae-cp-2024` | UAE | CBUAE | regulation | Consumer Protection Regulation 2024 | — |
| `src-sarb-ba-returns-2026` | SOUTH_AFRICA | SARB | consultation | Proposed Directive on BA Returns 2026 | — |
| `src-kyc-2026` | INDIA | RBI | amendment | KYC Amendment 2026 | `rbi_kyc_2024` |
| `src-dl-2026` | INDIA | RBI | amendment | Digital Lending Amendment 2026 | — |
| `src-sebi-2026` | INDIA | SEBI | amendment | SEBI Cyber Framework 2026 | — |

Each new circular: 12–18 clauses, at least one numeric threshold change, one new obligation, one withdrawal, one deadline shift, one clarification. That guarantees all 7 change classes appear in the dashboard.

---

## 6. Sequence (compressed clock)

| Time | A (AI) | B (backend/data) | C (UI) |
|---|---|---|---|
| 11:25–11:40 | read contract; scaffold `llm.py` adapter | **freeze contract v1.1**; registry + 3 source stubs | read contract; dashboard filters vs current state |
| 11:40–12:10 | prompts + cache on India docs; KSA doc when ready | monitor + upload + classifier + KSA/UAE/CBN docs | dashboard + monitor strip + upload modal |
| 12:10–12:35 | enrichment for all 6 sources; relationship pass | inventory additions; API wiring; mock export | source side-by-side + review + unresolved states |
| 12:35–12:50 | cache hardened; kill-network test | tests green; `run.cmd` clean; state sanity | `?mock=1` parity; viewport pass |
| 12:50–13:00 | demo rehearsal as AI narrator | tag `demo-1`; push | screen-drive rehearsal |

**Rule:** nobody edits another owner's files. Contract changes: B only, additive, announced in chat with one-line diff + version bump.

---

## 7. Demo path (Level 1, ~2 min)

1. Dashboard: 6 sources, 4 regions, 19 conflicting impacts; "Run monitoring" → *0 new, 3 duplicates*.
2. Upload a `.docx` circular → appears as *awaiting review*.
3. Open KSA AI amendment → side-by-side 2024 vs 2026 → clause "annual model validation" struck, "semi-annual" inserted; significance line; `ai/lending` chips.
4. Change-class filter → `new_obligation`, `modified`, `withdrawn`, `deadline_shortened` all populated.
5. Approve impact → audit chain grows; source review → `source.reviewed` event.
6. Open unresolved queue → one document honestly marked "no reliable prior regulation".

---

## 8. Definition of done (Level 1)

- [ ] 4 regions / ≥4 sources visible with authority, date, ref, effective date.
- [ ] Monitor run is idempotent (second run: 0 new).
- [ ] Upload works for `.txt` and `.docx`; `.pdf` does not crash.
- [ ] Every obligation shows clause ref + verbatim quote.
- [ ] Side-by-side diff renders with highlights + significance sentence.
- [ ] All 7 change classes reachable via filter.
- [ ] Review action writes an audit event; chain verifies.
- [ ] Search returns a publication by ref/title.
- [ ] `run.cmd` from clean folder; tests green; demo under 2 min.

---

## 9. Decisions & risks

| Decision | Why |
|---|---|
| South Africa = SARB (Prudential Authority) | English docs, real RSS feed; another African regulator is a JSON row + feed entry |
| Offline mirror for feeds, live fetch best-effort | Venue Wi-Fi risk; demo must be deterministic |
| JSON+base64 upload, not multipart | stdlib-only server; one code path for all three file types |
| LLM enrichments cached | Demo runs without network/model; AI is additive, not load-bearing |
| PDF text extraction best-effort | No PDF/OCR library in the zero-install stack; never block the demo |

**Biggest risk:** data pack (B) is on the critical path for A's and C's acceptance. If the KSA doc slips, A uses the India KYC doc to prove enrichment and C uses `previous_text` from existing sources; swap in KSA when ready.
