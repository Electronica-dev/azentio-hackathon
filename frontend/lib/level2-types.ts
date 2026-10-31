/** Level 2 shapes, mirroring contracts/level2-gaps.md. */

export type GapState = "addressed" | "partially_addressed" | "not_addressed" | "cannot_assess"

export type RecommendationStatus = "draft" | "approved" | "rejected" | "superseded"

export type PriorityLevel = "critical" | "high" | "medium" | "low"

export type Level2Mapping = {
  id: string
  analysis_id: string
  obligation_id: string
  obligation_ref: string
  obligation_quote: string
  internal: {
    document_id: string
    chunk_id: string
    ref: string
    title: string
    doc_type: string
    department: string
    business_area: string
  }
  level: "document" | "clause"
  relation: "addresses" | "partially_addresses" | "references" | "conflicts" | "unclear"
  reason: string
  internal_quote: string
  confidence: number
  confidence_basis: string
}

export type Level2Gap = {
  id: string
  analysis_id: string
  obligation_id: string
  obligation_ref: string
  internal_document_id: string | null
  internal_title: string
  doc_type?: string
  department: string
  business_area: string
  state: GapState
  summary: string
  what_is_missing: string[]
  why_insufficient: string
  mapping_ids: string[]
  recommendation_ids: string[]
  confidence: number
  confidence_basis: string
  needs_review: boolean
}

export type Level2Recommendation = {
  id: string
  analysis_id: string
  gap_ids: string[]
  obligation_id: string
  kind: "compliance_change" | "evidence_request"
  change_type: string
  target: { kind: string; id: string | null; ref: string; title: string }
  title: string
  rationale: string
  proposed_text: string
  implementation_notes: string
  regulatory_clause: { obligation_id: string; section_ref: string; quote: string }
  business_area: string
  priority: { level: PriorityLevel; rationale: string; due_hint_days?: number }
  acceptance_criteria: string[]
  status: RecommendationStatus
  version: number
  created_at: string
  approved_by: string | null
  approved_at: string | null
  review_note: string | null
  assignment: {
    status: "unassigned" | "assigned" | "confirmed"
    suggested_department: string
    owner_id: string | null
    due_date: string | null
    implementation_status: string | null
    source: string
    priority_override: PriorityLevel | null
  }
}

export type Level2Analysis = {
  id: string
  status: "complete" | "partial" | "failed"
  generated_at: string
  engine_version: string
  regulatory_scope: string[]
  internal_scope: string[]
  excluded: { document_id: string; title: string; reason: string }[]
  counts: {
    obligations: number
    mappings: number
    gaps: Partial<Record<GapState, number>>
    recommendations: Record<string, number>
  }
  mappings: Level2Mapping[]
  gaps: Level2Gap[]
  recommendations: Level2Recommendation[]
}

export type AnalysisSummary = Omit<Level2Analysis, "mappings" | "gaps" | "recommendations">

export type MatrixRow = {
  row_id: string
  analysis_id: string
  obligation: {
    id: string
    source_id: string | null
    source_title: string
    section_ref: string
    quote: string
    change_class: string
    deadline: string
  }
  internal: {
    document_id: string | null
    chunk_id: string | null
    title: string
    doc_type: string
    department: string
    business_area: string
  }
  gap: { id: string; state: GapState; summary: string; confidence: number }
  recommendation: {
    id: string
    title: string
    change_type: string
    priority: PriorityLevel
    status: RecommendationStatus
  } | null
  mapping: { id: string; relation: string; confidence: number } | null
  assignment: {
    status: string
    suggested_department: string
    owner_id: string | null
    priority_override: PriorityLevel | null
  }
}

export type Level2Envelope = {
  analyses: AnalysisSummary[]
  latest: Level2Analysis | null
  matrix: MatrixRow[]
}
