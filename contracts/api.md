# API contract — v1.0

**Frozen at 11:20 on hackathon day.** Additive changes only; bump the minor version and announce a one-line diff.

The UI reads exactly one document: `GET /api/state`. This is deliberate. One fetch, one shape, no waterfall, no per-view endpoints to coordinate.

## `GET /api/state`

```jsonc
{
  "meta": {
    "org": "Meridian Bank",
    "product": "Regula",
    "tagline": "Regulatory Change Impact Agent",
    "version": "1.0.0-demo",
    "as_of": "2026-10-31",
    "built_at": "2026-10-31T00:19:00+05:30",
    "scope": "India · RBI / SEBI",
    "mode": "deterministic"
  },
  "summary": {
    "sources": 3,
    "open_changes": 3,
    "obligations": 21,
    "impacts": 101,
    "critical": 19,
    "tasks": 25,
    "effort_days": 297,
    "approved": 2,
    "coverage": 100,
    "last_run_ms": 21
  },
  "sources": [ /* Source[] */ ],
  "clauses": [ /* Clause[] */ ],
  "obligations": [ /* Obligation[] */ ],
  "assets": [ /* Asset[] */ ],
  "impacts": [ /* Impact[] */ ],
  "tasks": [ /* Task[] */ ],
  "runs": [ /* Run[] */ ],
  "audit": [ /* AuditEvent[] */ ],
  "audit_chain": { "ok": true, "checked": 12, "head": "1ff3695bbcc5a8fe" }
}
```

### Source

| Field | Type | Notes |
|---|---|---|
| `id` | string | `src-kyc-2026` |
| `regulator` | string | `RBI`, `SEBI` |
| `ref` | string | official reference number |
| `title` | string | long title |
| `short_title` | string | for chips and graph |
| `published` | date | ISO |
| `effective` | date | ISO |
| `status` | enum | `new`, `in_review`, `analyzed`, `planned`, `implementing`, `done` |
| `risk` | enum | `high`, `medium`, `low` |
| `owner` | string | accountable executive |
| `summary` | string | one-paragraph description |
| `tags` | string[] | |
| `days_left` | int | derived at serialization |
| `obligations`, `impacts`, `critical`, `high`, `approved`, `tasks`, `open_tasks`, `effort_days` | int | derived counts |

### Clause

| Field | Type | Notes |
|---|---|---|
| `id` | string | `src-kyc-2026#c2` |
| `source_id` | string | |
| `num` | string | top-level number |
| `heading` | string | full heading |
| `subject` | string | short label, e.g. `periodic updation of KYC` |
| `section_ref` | string | `Section 16` |
| `text` | string | heading + body |
| `body` | string | body only |
| `change_type` | enum | `added`, `modified`, `removed`, `unchanged` |
| `previous_text` | string | prior section, empty if new |
| `redline` | `{t: "same"\|"add"\|"del", v: string}[]` | display segments |
| `summary` | string | one-line change description |

### Obligation

| Field | Type | Notes |
|---|---|---|
| `id` | string | `obl-kyc-3-1` |
| `clause_id`, `source_id` | string | |
| `section_ref` | string | |
| `subject` | string | clause subject |
| `statement` | string | normalised requirement, ≤320 chars |
| `quote` | string | verbatim evidence, ≤600 chars |
| `change_type` | enum | inherited from clause |
| `kind` | enum | `requirement`, `periodic`, `threshold`, `reporting`, `recordkeeping`, `consent`, `governance`, `verification`, `prohibition`, `removal` |
| `modality` | enum | `mandatory`, `prohibited`, `recommended`, `permitted` |
| `deadline` | string | e.g. `12 months`, `7 days`, `""` |
| `threshold` | string | e.g. `more than ten per cent` |
| `params` | object | machine-readable values, e.g. `{ "bo_threshold_pct": 10 }` |
| `tags` | string[] | canonical domain tags |
| `confidence` | number | 0–1 |

### Asset

| Field | Type | Notes |
|---|---|---|
| `id` | string | `sys-cif` |
| `type` | enum | `policy`, `process`, `system`, `control` |
| `name` | string | |
| `owner`, `team` | string | |
| `criticality` | int | 1–5 |
| `version` | string | |
| `state` | string | current-state description |
| `gap` | string | known gap |
| `params` | object | current configuration values |
| `tags` | string[] | |

### Impact

| Field | Type | Notes |
|---|---|---|
| `id` | string | `imp-kyc-3-1-sys-cif` |
| `obligation_id`, `source_id`, `asset_id` | string | |
| `asset_type`, `asset_name`, `owner`, `team` | | denormalised for the UI |
| `severity` | enum | `critical`, `high`, `medium`, `low` |
| `score` | int | 0–99 |
| `rationale` | string | why this score, in words |
| `gap` | string | current vs required |
| `deltas` | `{key,label,current,required,current_text,required_text}[]` | numeric mismatches |
| `effort_days` | int | |
| `confidence` | number | |
| `match_score` | number | mapping confidence |
| `shared_tags` | string[] | |
| `evidence` | string | clause quote |
| `status` | enum | `proposed`, `approved`, `rejected` |
| `reviewed_by`, `review_note` | string \| null | |

### Task

| Field | Type | Notes |
|---|---|---|
| `id` | string | `task-kyc-sys-cif` |
| `source_id`, `asset_id`, `asset_name`, `asset_type` | | |
| `title` | string | imperative |
| `description` | string | |
| `acceptance` | string | |
| `owner`, `team` | string | |
| `priority` | enum | `P1`, `P2`, `P3` |
| `severity` | enum | highest impact severity |
| `effort_days` | int | |
| `due` | date | |
| `status` | enum | `proposed`, `approved`, `in_progress`, `done` |
| `depends_on` | string[] | task ids |
| `impact_ids` | string[] | |

### AuditEvent

| Field | Type | Notes |
|---|---|---|
| `id` | string | `evt-0007` |
| `ts` | datetime | ISO with +05:30 |
| `actor` | string | agent or person |
| `action` | enum | `source.ingested`, `agent.run.completed`, `impact.approved`, `impact.rejected`, `task.status_changed` |
| `entity` | string | source ref / impact id / task id |
| `detail` | string | human-readable |
| `prev_hash`, `hash` | string | SHA-256 chain |

## `POST /api/sources/{id}/run`

Response:

```json
{ "run": { "id": "run-002", "steps": [], "ms": 19, "stats": {} }, "summary": {} }
```

The UI animates `run.steps`, then refetches `/api/state`.

## `POST /api/impacts/{id}/review`

```json
{ "decision": "approved", "note": "Confirmed by policy owner.", "actor": "Priya Menon" }
```

## `POST /api/tasks/{id}/status`

```json
{ "status": "in_progress", "actor": "Priya Menon" }
```

## `GET /api/export/{sourceId}.md`

`text/markdown` attachment: executive summary, obligation table, impact table, change plan, last audit events.

## Compatibility rules

1. Existing fields never change type or meaning.
2. New fields are optional in the UI.
3. Enums may gain values; the UI must fall back to a neutral chip.
4. IDs are stable across runs for the same source.
5. `GET /api/state` may grow; it must not shrink.
