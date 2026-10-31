# Level 2 contract — gap analysis and draft recommendations

**Scope:** Level 2 capabilities 3 and 4 only.

| Workstream | Owns | Does not own |
|---|---|---|
| **A — upload & classification** | Internal document upload, text/chunk extraction, department + business-area classification, ownership register | Regulatory matching, gaps, recommendations |
| **B — this contract** | Regulatory obligation → internal document/clause mapping, gap determination, draft recommendations | Assigning owners, deadlines, implementation status |
| **C — matrix & actions** | Regulatory impact matrix rendering, owner confirmation, deadlines, implementation status | Deciding whether a gap exists or what the fix is |

The seam is deliberate: B emits **evidence and drafts**, C emits **accountability and execution**. No workstream writes another's fields.

---

## 1. Invariants

1. **Evidence or abstain.** Every mapping, gap and recommendation carries verbatim quotes with IDs. A claim without evidence is `cannot_assess`, never a guess.
2. **Four gap states, one of which is honest ignorance.** `addressed`, `partially_addressed`, `not_addressed`, `cannot_assess`. `cannot_assess` is a valid result, not an error.
3. **Drafts until approved.** A recommendation is `draft` when created. Only an authorised reviewer can approve or reject it. Approval is final for that version.
4. **No invented owners.** B may suggest a department from A's classification; it never names a person. `assignment.status` is `unassigned` until C confirms.
5. **Regeneration never destroys history.** Re-running an analysis creates a new analysis revision; previous recommendations become `superseded`, not deleted.
6. **Deterministic where it matters.** Matching and gap rules are deterministic for a fixed corpus. The optional model may propose wording, never a gap state or an approval.

---

## 2. Input from workstream A (agreed read model)

**Storage (normative).** Both workstreams share the same in-process state: `state["internal_documents"]` and `state["internal_chunks"]`. A owns writes to both and exposes `GET /api/internal/documents` and `GET /api/internal/documents/{id}/chunks`. B reads the same state in-process and never writes either collection.

B consumes the shapes below. A owns their production and classification.

### InternalDocument

```jsonc
{
  "id": "int-ai-gov",
  "title": "AI Model Governance Policy",
  "doc_type": "ai_governance",          // policy | sop | process | control_catalogue
                                        // | ai_governance | system_inventory | ownership_register
  "department": "Risk",                 // Department enum — see §4
  "department_raw": "Risk Tech",        // classifier label, kept for provenance
  "business_area": "Model Risk",
  "owner_id": "own-014",                // optional; from the ownership register
  "version": "v2.3",
  "effective_date": "2026-04-01",
  "source": {
    "filename": "ai-model-governance-policy.pdf",
    "hash": "sha256:…",
    "uploaded_at": "2026-10-31T15:54:54+05:30",
    "uploaded_by": "Compliance upload"
  },
  "classification": {
    "department": "Risk",
    "business_area": "Model Risk",
    "confidence": 0.91,
    "method": "llm",                    // rule | tfidf | llm | human
    "reviewed": false
  },
  "status": "classified"                // uploaded | extracted | classified | indexed
}
```

### InternalChunk

```jsonc
{
  "id": "int-ai-gov#c4",
  "document_id": "int-ai-gov",
  "ref": "3.2",
  "heading": "Model explainability",
  "text": "The model owner shall document …",
  "page": 7,
  "department": "Risk",
  "tags": ["explainability", "model governance"]
}
```

**Minimum B needs:** `id`, `title`, `doc_type`, `department`, `business_area`, `status`. Chunks are required for clause-level mapping; without them B can only produce document-level mappings.

A documents with `status != "indexed"` are excluded from analysis and reported in `analysis.excluded`.

---

## 3. Resources

### Mapping — one regulatory obligation to one internal document or clause

```jsonc
{
  "id": "map-an-001-obl-17-int-ai-gov-c4",
  "analysis_id": "an-001",
  "obligation_id": "obl-…-17",
  "obligation_ref": "Section 7(2)",
  "obligation_quote": "Every Regulated Entity shall ensure that an automated credit decision is reviewed by a natural person …",
  "internal": {
    "document_id": "int-ai-gov",
    "chunk_id": "int-ai-gov#c4",        // null for a document-level mapping
    "ref": "3.2",
    "title": "AI Model Governance Policy",
    "doc_type": "ai_governance",
    "department": "Risk",
    "business_area": "Model Risk"
  },
  "level": "clause",                     // document | clause
  "relation": "partially_addresses",     // addresses | partially_addresses | references | conflicts | unclear
  "reason": "The clause requires explainability but says nothing about human review or reviewer identity.",
  "internal_quote": "The model owner shall document the factors … in the model card.",
  "confidence": 0.86,
  "confidence_basis": "verbatim requirement overlap in §3.2; no human-review language found",
  "method": "rule",                      // rule | tfidf | llm | human
  "evidence": [
    { "kind": "obligation", "ref": "Section 7(2)", "quote": "…" },
    { "kind": "internal", "ref": "int-ai-gov#c4", "quote": "…" }
  ],
  "reviewed": false,
  "created_at": "2026-10-31T16:10:00+05:30"
}
```

Rules:
- `level` is `clause` iff `chunk_id` is set.
- At most one mapping per `(obligation_id, internal.document_id, chunk_id)`; duplicates are merged.
- `conflicts` means the internal text appears to contradict the requirement (e.g., an outdated threshold).
- `reviewed` is set by a human; analysis never sets it.

### Gap — one assessment per obligation × internal document

```jsonc
{
  "id": "gap-an-001-obl-17-int-ai-gov",
  "analysis_id": "an-001",
  "obligation_id": "obl-…-17",
  "obligation_ref": "Section 7(2)",
  "internal_document_id": "int-ai-gov",
  "internal_title": "AI Model Governance Policy",
  "department": "Risk",
  "business_area": "Model Risk",
  "state": "partially_addressed",
  "summary": "Explainability is documented; human review and reviewer identity retention are not.",
  "what_is_missing": [
    "mandatory human review for automated rejections",
    "retention of the decision and reviewer identity in the audit trail"
  ],
  "why_insufficient": "§3.2 requires a model card but no approval step, so a rejection can still be issued by the model alone.",
  "mapping_ids": ["map-an-001-obl-17-int-ai-gov-c4"],
  "recommendation_ids": ["rec-an-001-obl-17-int-ai-gov"],
  "confidence": 0.84,
  "confidence_basis": "two of four requirement elements have no internal counterpart",
  "method": "rule",
  "search_scope": {
    "documents_searched": ["int-ai-gov", "int-credit-policy"],
    "terms": ["human review", "reviewer", "audit trail", "override"],
    "excluded": []
  },
  "needs_review": true,
  "assessed_at": "2026-10-31T16:10:00+05:30"
}
```

### Recommendation — a draft change, not a task

```jsonc
{
  "id": "rec-an-001-obl-17-int-ai-gov",
  "analysis_id": "an-001",
  "gap_ids": ["gap-an-001-obl-17-int-ai-gov"],
  "obligation_id": "obl-…-17",
  "kind": "compliance_change",           // compliance_change | evidence_request
  "change_type": "process_step",         // add_clause | amend_clause | new_control
                                         // | process_step | system_change | training | evidence_request
  "target": {
    "kind": "policy",                    // policy | process | system | control
    "id": "int-ai-gov",
    "ref": "3.2",
    "title": "AI Model Governance Policy"
  },
  "title": "Require human review for automated credit rejections",
  "rationale": "The policy documents explainability but permits an automated rejection with no human decision point.",
  "proposed_text": "3.2.1 Every credit application rejected solely through automated decisioning shall be reviewed by a natural person before the rejection is communicated. The decision, the reviewer's identity and the timestamp shall be retained in the audit trail for the period required by the KYC Direction.",
  "implementation_notes": "Add the step to the credit decisioning workflow and to the model card template.",
  "regulatory_clause": {
    "obligation_id": "obl-…-17",
    "section_ref": "Section 7(2)",
    "quote": "Every Regulated Entity shall ensure that an automated credit decision is reviewed by a natural person …"
  },
  "business_area": "Model Risk",
  "priority": {
    "level": "high",
    "rationale": "Existing automated rejections are in production; the obligation is effective 2027-01-15.",
    "due_hint_days": 45
  },
  "acceptance_criteria": [
    "Rejected applications show a reviewer id and timestamp in the audit trail",
    "A sample of 20 rejections demonstrates the manual step"
  ],
  "evidence": [
    { "kind": "gap", "ref": "gap-an-001-obl-17-int-ai-gov", "quote": "…" }
  ],
  "confidence": 0.82,
  "confidence_basis": "clause-level gap with an explicit missing element",
  "method": "rule",
  "status": "draft",                     // draft | approved | rejected | superseded
  "version": 1,
  "created_at": "2026-10-31T16:10:00+05:30",
  "created_by": "Regula Agent",
  "approved_by": null,
  "approved_at": null,
  "review_note": null,
  "assignment": {
    "status": "unassigned",              // unassigned | assigned | confirmed
    "suggested_department": "Risk",
    "owner_id": null,
    "due_date": null,
    "implementation_status": null,       // not_started | in_progress | blocked | done
    "source": "classification"           // classification | ownership_register | reviewer | none
  }
}
```

Rules:
- `kind: compliance_change` requires non-empty `proposed_text`; otherwise `422`.
- `kind: evidence_request` is emitted only for a `cannot_assess` gap. Its `proposed_text` states what evidence to obtain; it must not assert a policy change.
- `regulatory_clause.quote` must be a verbatim substring of the obligation's `quote`.
- `assignment` is written by C. B only sets `status: unassigned`, `suggested_department` and `source`. B must never populate `owner_id`.
- `priority.level` is one of `critical | high | medium | low`; `rationale` is mandatory.

### ImpactMatrixRow — the handoff to C

```jsonc
{
  "row_id": "mx-an-001-obl-17-int-ai-gov",
  "analysis_id": "an-001",
  "obligation": {
    "id": "obl-…-17",
    "source_id": "src-ai-2026",
    "source_title": "AI in Credit Decisioning — Amendment 2026",
    "section_ref": "Section 7(2)",
    "quote": "…",
    "change_class": "modified",
    "deadline": ""
  },
  "internal": {
    "document_id": "int-ai-gov",
    "chunk_id": "int-ai-gov#c4",
    "title": "AI Model Governance Policy",
    "doc_type": "ai_governance",
    "department": "Risk",
    "business_area": "Model Risk"
  },
  "gap": { "id": "gap-…", "state": "partially_addressed", "summary": "…", "confidence": 0.84 },
  "recommendation": {
    "id": "rec-…",
    "title": "Require human review for automated credit rejections",
    "change_type": "process_step",
    "priority": "high",
    "status": "draft"
  },
  "mapping": { "id": "map-…", "relation": "partially_addresses", "confidence": 0.86 },
  "assignment": { "status": "unassigned", "suggested_department": "Risk", "owner_id": null }
}
```

`row_id` is stable for a given `(analysis_id, obligation_id, internal_document_id)`. C stores actions against `recommendation.id`, not `row_id`.

---

## 4. Enums

### Department

Fixed enum. Every `department` field in this contract — documents, mappings, gaps, recommendations, matrix rows — carries one of these values.

| Value | Absorbs these organisation labels |
|---|---|
| `Compliance` | Compliance, Compliance Tech |
| `Legal` | Legal, Company Secretary |
| `Risk` | Risk, Risk Tech |
| `Finance` | Finance, Finance Tech |
| `Operations` | Operations, Customer Service |
| `Technology` | Technology, IT, Integrations, Core Banking, Security |
| `Business` | Lending, Digital, Digital Banking |
| `Unassigned` | low-confidence classification, or a label that maps to none of the above |

A's classifier MUST emit one of these. The raw label is preserved in `department_raw` for audit and for the ownership register lookup. A document whose classification is below A's confidence floor is `Unassigned`, not a best-guess department.

### Other enums

| Enum | Values |
|---|---|
| `gap.state` | `addressed`, `partially_addressed`, `not_addressed`, `cannot_assess` |
| `mapping.relation` | `addresses`, `partially_addresses`, `references`, `conflicts`, `unclear` |
| `recommendation.status` | `draft`, `approved`, `rejected`, `superseded` |
| `recommendation.kind` | `compliance_change`, `evidence_request` |
| `change_type` | `add_clause`, `amend_clause`, `new_control`, `process_step`, `system_change`, `training`, `evidence_request` |
| `priority.level` | `critical`, `high`, `medium`, `low` |
| `assignment.status` | `unassigned`, `assigned`, `confirmed` |
| `assignment.source` | `classification`, `ownership_register`, `reviewer`, `none` |

Unknown values in any *other* enum render as *needs review* rather than failing the UI. `department` is the exception: it is a closed set, and an unknown value is a contract violation.

---

## 5. Endpoints (workstream B)

All responses are JSON. `actor` is required on writes; `role` is required for review.

| Method | Path | Purpose | Status |
|---|---|---|---|
| `GET` | `/api/internal/documents` | Read model from A | owned by A |
| `GET` | `/api/internal/documents/{id}/chunks` | Clause text for mapping | owned by A |
| `POST` | `/api/level2/analyses` | Run mapping + gaps + drafts | 201 |
| `GET` | `/api/level2/analyses` | List runs, newest first | 200 |
| `GET` | `/api/level2/analyses/{id}` | Run summary + counts | 200 |
| `GET` | `/api/level2/analyses/{id}/mappings` | Filter by `obligation_id`, `document_id`, `level` | 200 |
| `GET` | `/api/level2/analyses/{id}/gaps` | Filter by `state`, `department` | 200 |
| `GET` | `/api/level2/analyses/{id}/recommendations` | Filter by `status`, `priority` | 200 |
| `GET` | `/api/level2/impact-matrix` | `?analysis_id=` rows for C | 200 |
| `PATCH` | `/api/level2/recommendations/{id}` | Edit a `draft` | 200 |
| `POST` | `/api/level2/recommendations/{id}/review` | Approve or reject | 200 |

### POST /api/level2/analyses

```jsonc
{
  "regulatory_source_id": "src-ai-2026",   // or obligation_ids: ["obl-…"]
  "internal_document_ids": null,            // null = all indexed documents
  "options": { "use_llm": true, "min_confidence": 0.5 },
  "actor": "Priya Menon"
}
```

Response `201`:

```jsonc
{
  "analysis": {
    "id": "an-001",
    "status": "complete",                   // complete | partial | failed
    "regulatory_scope": ["src-ai-2026"],
    "internal_scope": ["int-ai-gov", "int-credit-policy"],
    "excluded": [{ "document_id": "int-legacy", "reason": "not indexed" }],
    "counts": {
      "obligations": 6,
      "mappings": 11,
      "gaps": { "addressed": 1, "partially_addressed": 3, "not_addressed": 1, "cannot_assess": 1 },
      "recommendations": { "draft": 4, "evidence_request": 1 }
    },
    "generated_at": "2026-10-31T16:10:00+05:30",
    "engine_version": "level2-1"
  }
}
```

The run is synchronous. If it is later moved behind a queue, keep the shape and return `202` with `status: "running"` plus the same `GET /analyses/{id}` polling — clients must already tolerate `running`/`partial`.

`partial` means some documents were excluded or the model was unavailable; the rule-based result is still returned.

### POST /api/level2/recommendations/{id}/review

```jsonc
{ "decision": "approve", "actor": "Priya Menon", "role": "reviewer", "note": "Wording accepted." }
```

- `approve` → `status: "approved"`, `approved_by`, `approved_at`, audit event `level2.recommendation.approved`.
- `reject` → `status: "rejected"`, `review_note` mandatory, audit event.
- `role` must be `reviewer` or `admin`; otherwise `403`.
- Approving a version that is not current returns `409`.

### PATCH /api/level2/recommendations/{id}

Only `draft` may be edited. Editable: `title`, `proposed_text`, `implementation_notes`, `priority`, `acceptance_criteria`, `business_area`. Every successful edit bumps `version` and writes `level2.recommendation.edited`. Editing a non-draft returns `409`.

---

## 6. How a gap state is decided

The contract fixes the meaning, not the implementation:

| State | Condition |
|---|---|
| `addressed` | A clause-level mapping with `relation: addresses` covers **every** required element. `what_is_missing` is empty. |
| `partially_addressed` | A mapping exists, but at least one required element is missing or only implied. |
| `not_addressed` | No mapping above the confidence floor, **and** `search_scope` documents what was searched. This is evidence of absence, not an absence of evidence. |
| `cannot_assess` | The relevant document type is missing, the text is unreadable, or the evidence conflicts. `what_is_missing` lists the evidence needed to decide. |

Rules that both workstreams must respect:

1. `addressed` requires a **clause-level** mapping. A document-level match alone can never produce `addressed`.
2. `not_addressed` requires `search_scope` with at least one document and one term. No scope → `cannot_assess`.
3. `cannot_assess` never yields a `compliance_change` recommendation. It yields `kind: evidence_request` or no recommendation.
4. `confidence < 0.5` forces `needs_review: true` even when the state is firm.
5. A `conflicts` mapping forces `needs_review: true` regardless of state.

---

## 7. Recommendation quality rules

A recommendation is rejected at `422` unless it satisfies:

1. At least one `gap_ids` entry, and the gap is `partially_addressed`, `not_addressed` or `cannot_assess`.
2. `proposed_text` is specific enough to apply: it must name the actor, the action and the object. "Update the policy" is invalid.
3. `regulatory_clause.quote` is verbatim and at least 40 characters.
4. `priority.rationale` is non-empty.
5. `business_area` is non-empty; it is copied from the internal document but may be corrected by a reviewer.

Draft wording for `cannot_assess` must be an evidence request, e.g. *"Provide the AI governance policy section covering human review of automated credit decisions"* — not a fabricated clause.

---

## 8. Ownership and action handoff

**Placement (normative).** `assignment` is nested on the recommendation. There is no separate `/api/actions` resource; `recommendation.id` is the anchor for every owner, deadline and status change.

B returns `assignment` with:

```jsonc
{ "status": "unassigned", "suggested_department": "Risk", "owner_id": null, "source": "classification" }
```

C may:
- confirm or change `owner_id`, `due_date`, `implementation_status`;
- set `status` to `assigned` or `confirmed`;
- leave it `unassigned` when the register has no match, with `source: "none"`.

B never reads back `assignment` for gap logic. A change in ownership must not change a gap state or a recommendation's content.

---

## 9. Errors

| Code | When |
|---|---|
| `400` | Missing scope, unknown field type |
| `403` | Review without `role: reviewer|admin` |
| `404` | Unknown analysis/recommendation/gap |
| `409` | Editing or approving a non-current version; approving an already-approved recommendation |
| `422` | Recommendation violates a quality rule; gap lacks evidence and is not `cannot_assess` |
| `200` with `status: "partial"` | Model unavailable or documents excluded — degradation, not failure |

---

## 10. Audit events

Every write is hash-chained like the existing audit trail:

- `level2.analysis.completed`
- `level2.mapping.created`
- `level2.gap.determined`
- `level2.recommendation.drafted`
- `level2.recommendation.edited`
- `level2.recommendation.approved`
- `level2.recommendation.rejected`
- `level2.recommendation.superseded`

Each carries `analysis_id`, `recommendation_id` where relevant, `actor`, and a one-line detail.

---

## 11. Versioning

- Re-running an analysis creates `an-002`; it never mutates `an-001`.
- Recommendations from `an-001` that are not re-emitted become `superseded`.
- `approved` recommendations are never edited in place. A new analysis creates a new draft with `version: 1` and the old one stays `approved` + `superseded`.
- `GET /api/state` may expose `level2.latest_analysis_id` and counts; it must not embed every mapping.

---

## 12. Worked example — one row end to end

**Regulation.** AI in Credit Decisioning Amendment 2026, Section 7(2): automated credit decisions must be reviewed by a natural person, with the decision and reviewer identity retained.

**Internal.** AI Model Governance Policy §3.2 requires a model card and documents explainability. No approval step.

**Mapping.** `partially_addresses`, confidence 0.86.

**Gap.** `partially_addressed`, missing: human review; reviewer identity retention. Why: §3.2 permits the model alone to reject.

**Recommendation.** `process_step`, `proposed_text` adds §3.2.1 requiring human review before communication, retaining decision + reviewer identity in the audit trail. Priority `high`, business area `Model Risk`, status `draft`, assignment `unassigned` with suggested department `Risk`.

**Matrix row.** Obligation × AI Model Governance Policy, gap state, recommendation id, unassigned owner — ready for C to attach an owner and a due date.

---

## 13. Resolved decisions

1. **Internal corpus** — `state["internal_documents"]` + `state["internal_chunks"]`; A owns writes and the two `GET` endpoints. B reads the same state in-process.
2. **Assignment location** — nested `assignment` on the recommendation; no separate action resource, `recommendation.id` is the anchor.
3. **Department** — closed enum of eight values, with `department_raw` preserved for provenance and register lookup.

## 14. Remaining questions (defaults proposed)

1. **Priority ownership.** Default: B computes `priority` with a mandatory rationale; C may override at assignment time without changing the recommendation's content. Confirm if C would rather own the scale.
2. **Review identity.** Default: `role` in the review body, matching the existing `actor` convention. An `X-Role` header also works but splits the identity across two places.
3. **Analysis trigger.** Default: explicit `POST /analyses`, so a reviewer sees what changed before drafts appear. Automatic-on-classification can be added later without changing any resource shape.
