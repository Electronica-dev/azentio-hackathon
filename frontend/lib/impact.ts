import "server-only"

import type { Loaded } from "./org"

export type GapState = "addressed" | "partially_addressed" | "not_addressed" | "cannot_assess"
export type Priority = "critical" | "high" | "medium" | "low"
export type ImplementationStatus = "not_started" | "in_progress" | "blocked" | "done"

export type Assignment = {
  status: "unassigned" | "assigned" | "confirmed"
  suggested_department: string
  owner_id: string | null
  due_date: string | null
  implementation_status: ImplementationStatus | null
  source: "classification" | "ownership_register" | "reviewer" | "none"
  priority_override: Priority | null
  basis?: string | null
  needs_manual_assignment?: boolean
  manual_reason?: string | null
  updated_by?: string
  updated_at?: string
}

export type Mapping = {
  id: string
  obligation_id: string
  internal: { document_id: string; chunk_id: string | null; ref: string; title: string }
  relation: string
  reason: string
  internal_quote: string
  confidence: number
}

export type Gap = {
  id: string
  obligation_id: string
  obligation_ref: string
  internal_document_id: string | null
  internal_title: string | null
  department: string
  state: GapState
  summary: string
  what_is_missing: string[]
  why_insufficient: string | null
  mapping_ids: string[]
  recommendation_ids: string[]
  confidence: number
  needs_review: boolean
}

export type Recommendation = {
  id: string
  gap_ids: string[]
  obligation_id: string
  kind: "compliance_change" | "evidence_request"
  change_type: string
  target: { kind: string; id: string | null; ref: string | null; title: string }
  title: string
  rationale: string
  proposed_text: string
  implementation_notes: string
  regulatory_clause: { section_ref: string; quote: string }
  business_area: string
  priority: { level: Priority; rationale: string; due_hint_days?: number | null }
  acceptance_criteria: string[]
  status: "draft" | "approved" | "rejected" | "superseded"
  version: number
  approved_by: string | null
  review_note: string | null
  assignment: Assignment
}

export type Analysis = {
  id: string
  status: string
  generated_at: string
  regulatory_scope: string[]
  internal_scope: string[]
  excluded: { document_id: string; title?: string; reason: string }[]
  counts: { obligations: number; mappings: number; gaps: Record<string, number>; recommendations: Record<string, number> }
  mappings?: Mapping[]
  gaps?: Gap[]
  recommendations?: Recommendation[]
}

export type MatrixRow = {
  row_id: string
  obligation: { id: string; source_id: string; source_title: string; section_ref: string; quote: string; change_class: string; deadline: string }
  internal: { document_id: string | null; chunk_id: string | null; title: string; doc_type: string; department: string; business_area: string }
  gap: { id: string; state: GapState; summary: string; confidence: number }
  recommendation: { id: string; title: string; change_type: string; priority: Priority; status: string } | null
  mapping: { id: string; relation: string; confidence: number } | null
  assignment: Assignment
}

function apiBase(): string {
  return (process.env.REGULA_API_URL ?? process.env.NEXT_PUBLIC_REGULA_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "")
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, { cache: "no-store", signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`GET ${path} returned HTTP ${response.status}`)
  return (await response.json()) as T
}

export type ImpactData = {
  analyses: Analysis[]
  analysis: Analysis | null
  rows: MatrixRow[]
}

/** The chosen analysis (or the newest) with its matrix rows and full gap/recommendation detail. */
export async function getImpact(analysisId?: string): Promise<Loaded<ImpactData>> {
  try {
    const { analyses } = await get<{ analyses: Analysis[] }>("/api/level2/analyses")
    const id = analyses.some((a) => a.id === analysisId) ? analysisId : analyses[0]?.id
    if (!id) return { ok: true, data: { analyses, analysis: null, rows: [] } }
    const [{ analysis }, { rows }] = await Promise.all([
      get<{ analysis: Analysis }>(`/api/level2/analyses/${encodeURIComponent(id)}`),
      get<{ rows: MatrixRow[] }>(`/api/level2/impact-matrix?analysis_id=${encodeURIComponent(id)}`),
    ])
    return { ok: true, data: { analyses, analysis, rows } }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "the API is unreachable" }
  }
}
