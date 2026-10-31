/**
 * Regula — Regulatory Change Impact Agent.
 *
 * Types mirror `contracts/api.md` (v1.0 frozen, v1.1 additive only).
 * v1.1 fields are declared optional so the dashboard renders against either
 * the frozen contract or the enriched payload without a code change.
 * Enums are widened to `string` unions with neutral fallbacks (contract
 * compatibility rule 3: "Enums may gain values; the UI must fall back to a
 * neutral chip").
 */

export type Region = "KSA" | "UAE" | "INDIA" | "SOUTH_AFRICA"

/** Display metadata for a domain enum value: human label + shadcn Badge classes. */
export type Chip = { label: string; short: string; className: string }

export type DocType = "circular" | "amendment" | "guideline" | "consultation" | "regulation" | "framework"

/** R15 — the seven change classes. Source and clause level. */
export type ChangeClass =
  | "new_obligation"
  | "modified"
  | "withdrawn"
  | "deadline_extended"
  | "deadline_shortened"
  | "clarification"
  | "no_material_change"

export type RelationshipStatus = "linked" | "standalone" | "unresolved"

export type ReviewState = "new" | "awaiting_review" | "in_review" | "approved" | "rejected"

export type Applicability = "ai" | "banking" | "lending" | "insurance" | "payments" | "bfsi"

export type SourceStatus = "new" | "in_review" | "analyzed" | "planned" | "implementing" | "done"

export interface Relationship {
  status: RelationshipStatus
  prior_source_id?: string | null
  /** Reference of the prior document (e.g. RBI/2022-23/111) when it is not a separate publication. */
  prior_ref?: string | null
  confidence?: number
  rationale?: string
}

export interface Source {
  id: string
  /** v1.0 field. v1.1 adds `authority`; prefer it when present. */
  regulator: string
  ref: string
  title: string
  short_title: string
  published: string
  /** Empty or null when the regulator did not state one. */
  effective?: string | null
  /** v1.0 workflow status. */
  status: SourceStatus | string
  risk: "high" | "medium" | "low" | string
  owner: string
  summary: string
  tags: string[]
  days_left?: number

  // ---- v1.1 additions (optional) ----
  region?: Region | string
  authority?: string
  jurisdiction?: string
  doc_type?: DocType | string
  url?: string
  first_seen?: string
  processed_at?: string
  relationship?: Relationship
  change_class?: ChangeClass | string
  review_state?: ReviewState | string
}

/** One display segment of a word-level redline. */
export interface RedlineSegment {
  t: "same" | "add" | "del"
  v: string
}

export interface Clause {
  id: string
  source_id: string
  num: string
  heading: string
  subject: string
  section_ref: string
  text: string
  body: string
  change_type: "added" | "modified" | "removed" | "unchanged" | string
  previous_text: string
  redline: RedlineSegment[]
  summary: string

  // ---- v1.1 additions (optional) ----
  change_class?: ChangeClass | string
  significance?: string
  prior_clause_id?: string | null
}

export interface Obligation {
  id: string
  clause_id: string
  source_id: string
  section_ref: string
  subject: string
  statement: string
  quote: string
  change_type: string
  kind: string
  modality: string
  deadline: string
  threshold: string
  params: Record<string, number | string>
  tags: string[]
  confidence: number
  clause_num?: string
  clause_heading?: string

  // ---- v1.1 additions (optional) ----
  applicability?: Applicability[] | string[]
  applies_to?: string[]
  references?: string[]
  significance?: string
  enrichment?: "llm" | "rule" | "none"
  /** Source- and obligation-level classification (R15). */
  change_class?: ChangeClass | string
}

export interface MonitorMeta {
  configured_sources?: number
  frequency_hours?: number
  last_run?: string
  next_run?: string
}

export interface Meta {
  org: string
  product: string
  tagline: string
  version: string
  as_of: string
  built_at: string
  scope: string
  mode: string

  // ---- v1.1 additions (optional) ----
  regions?: Region[]
  monitor?: MonitorMeta
}

export interface Summary {
  sources: number
  open_changes: number
  obligations: number
  impacts: number
  critical: number
  tasks: number
  effort_days: number
  approved: number
  coverage: number
  last_run_ms: number
}

export interface RegulaState {
  meta: Meta
  summary: Summary
  sources: Source[]
  clauses: Clause[]
  obligations: Obligation[]
  /** Present in the frozen contract; unused by this dashboard. */
  assets?: unknown[]
  impacts?: unknown[]
  tasks?: unknown[]
  runs?: unknown[]
  audit?: AuditEvent[]
  audit_chain?: { ok: boolean; checked: number; head: string }
}

export interface AuditEvent {
  id: string
  ts: string
  actor: string
  action: string
  entity: string
  detail: string
  prev_hash?: string
  hash?: string
}

/** The dashboard needs a valid state document; anything else is a contract violation. */
export function isRegulaState(value: unknown): value is RegulaState {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<RegulaState>
  return (
    Array.isArray(candidate.sources) &&
    Array.isArray(candidate.clauses) &&
    Array.isArray(candidate.obligations) &&
    typeof candidate.meta === "object" &&
    candidate.meta !== null
  )
}
