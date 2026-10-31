"use server"

import { revalidatePath } from "next/cache"

const API = (process.env.REGULA_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "")

export type DiscoveryResult = {
  ok: boolean
  discovered?: number
  new?: number
  ingested?: number
  errors?: number
  message?: string
}

/**
 * Run one monitoring cycle: fetch the RBI and SEBI RSS feeds, ingest the newest
 * directive pages into the repository, then refresh the cached state.
 */
export async function runDiscovery(): Promise<DiscoveryResult> {
  try {
    const response = await fetch(`${API}/api/discover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ingest: true, limit: 3 }),
      cache: "no-store",
      signal: AbortSignal.timeout(180_000),
    })
    if (!response.ok) {
      return { ok: false, message: `discovery returned HTTP ${response.status}` }
    }
    const data = (await response.json()) as {
      stats?: { discovered?: number; new?: number }
      ingested?: unknown[]
      errors?: unknown[]
    }
    return {
      ok: true,
      discovered: data.stats?.discovered ?? 0,
      new: data.stats?.new ?? 0,
      ingested: (data.ingested ?? []).length,
      errors: (data.errors ?? []).length,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "discovery failed" }
  }
}

export type RelationshipSignal = { name: string; value: number; detail: string }

export type RelationshipCandidate = {
  document_id: string
  title: string
  confidence: number
  score?: number
  rationale?: string
}

export type RelationshipOutcome = {
  status: "linked" | "proposed" | "standalone" | "unresolved"
  confidence?: number
  rationale?: string
  prior_source_id?: string | null
  prior_title?: string | null
  alternatives?: RelationshipCandidate[]
  model_opinion?: {
    prior_document_id?: string | null
    confidence?: number
    evidence?: string
    rationale?: string
  } | null
  signals?: RelationshipSignal[]
}

export type UploadOutcome = {
  ok: boolean
  duplicate?: boolean
  message?: string
  quality?: string
  source?: {
    id: string
    title: string
    ref: string
    authority: string
    region: string
    published: string
  }
  relationship?: RelationshipOutcome | null
  run?: { stats?: { clauses?: number; obligations?: number; impacts?: number; tasks?: number } } | null
  backfilled?: { source_id: string; title: string }[]
}

/**
 * Upload one circular. The backend runs the whole selection ladder: hard gates,
 * instrument identity, chain position, decisive evidence, score band. The
 * outcome tells the reviewer whether it auto-linked, needs a decision, or
 * stands alone.
 */
export async function uploadCircular(input: {
  filename: string
  content_base64: string
  authority?: string
}): Promise<UploadOutcome> {
  try {
    const response = await fetch(`${API}/api/sources/upload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, actor: "Compliance upload" }),
      cache: "no-store",
      signal: AbortSignal.timeout(180_000),
    })
    const data = (await response.json().catch(() => null)) as
      | (Partial<UploadOutcome> & { error?: string })
      | null
    if (!response.ok) {
      return { ok: false, message: data?.error ?? `upload returned HTTP ${response.status}` }
    }
    revalidatePath("/", "layout")
    return { ...(data ?? {}), ok: true }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "upload failed" }
  }
}

/** Accept a predecessor from the grey band, then re-diff against it. */
export async function confirmRelationship(
  sourceId: string,
  priorSourceId: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const response = await fetch(`${API}/api/sources/${encodeURIComponent(sourceId)}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prior_source_id: priorSourceId, actor: "Compliance reviewer" }),
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      return { ok: false, message: data?.error ?? `link returned HTTP ${response.status}` }
    }
    revalidatePath("/", "layout")
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "link failed" }
  }
}

export type SyncSchedule = {
  ok: boolean
  enabled?: boolean
  cron?: string | null
  next_run?: string | null
  last_run?: { started: string; ok: boolean; new?: number; ingested?: number; errors?: number; error?: string } | null
  message?: string
}

async function syncScheduleRequest(init?: RequestInit): Promise<SyncSchedule> {
  try {
    const response = await fetch(`${API}/api/sync/schedule`, {
      ...init,
      headers: { "content-type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    const data = (await response.json()) as Omit<SyncSchedule, "ok"> & { error?: string }
    if (!response.ok) {
      return { ok: false, message: data.error ?? `schedule returned HTTP ${response.status}` }
    }
    return { ok: true, ...data }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "schedule unavailable" }
  }
}

/** Read the backend's cron schedule for automatic document sync. */
export async function getSyncSchedule(): Promise<SyncSchedule> {
  return syncScheduleRequest()
}

/** Set the sync cron expression, or pass "off" to make sync manual-only. */
export async function setSyncSchedule(cron: string): Promise<SyncSchedule> {
  return syncScheduleRequest({ method: "POST", body: JSON.stringify({ cron }) })
}

export type OrgResult = { ok: boolean; added?: number; message?: string }

async function orgRequest(path: string, body: unknown): Promise<OrgResult> {
  try {
    const response = await fetch(`${API}/api/org/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    })
    const data = (await response.json().catch(() => null)) as { added?: unknown[]; error?: string } | null
    if (!response.ok) return { ok: false, message: data?.error ?? `request returned HTTP ${response.status}` }
    revalidatePath("/", "layout")
    return { ok: true, added: data?.added?.length ?? 0 }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "request failed" }
  }
}

/**
 * Store one internal document. Bulk uploads call this once per file so no
 * single request approaches the Server Action body limit.
 */
export async function uploadOrgDocument(input: {
  filename: string
  content_base64: string
  category: string
  department?: string
  owner?: string
  version?: string
  review_date?: string
}): Promise<OrgResult> {
  const { filename, content_base64, ...meta } = input
  return orgRequest("documents", { files: [{ filename, content_base64 }], ...meta })
}

/** Add assets or people from one form entry or a CSV file's text. */
export async function addOrgRecords(
  kind: "assets" | "people",
  input: { item: Record<string, string> } | { csv: string },
): Promise<OrgResult> {
  return orgRequest(kind, input)
}

export async function deleteOrgRecord(kind: "documents" | "assets" | "people", id: string): Promise<OrgResult> {
  return orgRequest(`${kind}/${encodeURIComponent(id)}/delete`, {})
}

export type Level2Result = { ok: boolean; message?: string; analysisId?: string }

/** Run the Level 2 mapping → gap → draft pass over the analysed obligations. */
export async function runLevel2Analysis(sourceId?: string): Promise<Level2Result> {
  try {
    const response = await fetch(`${API}/api/level2/analyses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ regulatory_source_id: sourceId || undefined, actor: "Compliance reviewer" }),
      cache: "no-store",
      signal: AbortSignal.timeout(180_000),
    })
    const data = (await response.json().catch(() => null)) as
      | { analysis?: { id?: string }; error?: string }
      | null
    if (!response.ok) return { ok: false, message: data?.error ?? `analysis returned HTTP ${response.status}` }
    revalidatePath("/assessments")
    return { ok: true, analysisId: data?.analysis?.id }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "analysis failed" }
  }
}

/** Edit a draft recommendation. Only drafts are editable; the backend enforces it. */
export async function saveRecommendation(
  id: string,
  patch: { proposed_text?: string; title?: string; implementation_notes?: string; business_area?: string; acceptance_criteria?: string[] },
): Promise<Level2Result> {
  try {
    const response = await fetch(`${API}/api/level2/recommendations/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...patch, actor: "Compliance reviewer" }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    })
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    if (!response.ok) return { ok: false, message: data?.error ?? `save returned HTTP ${response.status}` }
    revalidatePath("/assessments")
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "save failed" }
  }
}

/** Approve or reject a draft. The role is verified by the backend. */
export async function reviewRecommendation(
  id: string,
  decision: "approve" | "reject",
  role: "reviewer" | "admin",
  note: string,
): Promise<Level2Result> {
  try {
    const response = await fetch(`${API}/api/level2/recommendations/${encodeURIComponent(id)}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, role, note, actor: "Compliance reviewer" }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    })
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    if (!response.ok) return { ok: false, message: data?.error ?? `review returned HTTP ${response.status}` }
    revalidatePath("/assessments")
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "review failed" }
  }
}

// Level 2: impact analysis, owners and actions. The reviewer identity is fixed
// until the app has sign-in; the backend requires role reviewer|admin.
const REVIEWER = { actor: "Compliance reviewer", role: "reviewer" } as const

export type ImpactResult = { ok: boolean; message?: string; id?: string }

async function level2Request(path: string, method: "POST" | "PATCH", body: unknown): Promise<ImpactResult> {
  try {
    const response = await fetch(`${API}/api/level2/${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    })
    const data = (await response.json().catch(() => null)) as { error?: string; analysis?: { id?: string } } | null
    if (!response.ok) return { ok: false, message: data?.error ?? `request returned HTTP ${response.status}` }
    revalidatePath("/", "layout")
    return { ok: true, id: data?.analysis?.id }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "request failed" }
  }
}

/** Map obligations to internal clauses, assess gaps, draft changes, then match owners from the register. */
export async function runImpactAnalysis(scope: { regulatory_source_id: string } | { obligation_ids: string[] }) {
  return level2Request("analyses", "POST", { ...scope, actor: REVIEWER.actor })
}

/** Re-run the ownership register lookup, e.g. after importing people. Never overwrites a reviewer's choice. */
export async function matchOwners(analysisId: string) {
  return level2Request(`analyses/${encodeURIComponent(analysisId)}/assign-owners`, "POST", { actor: REVIEWER.actor })
}

export async function updateAssignment(
  recommendationId: string,
  patch: {
    owner_id?: string | null
    confirm?: boolean
    due_date?: string | null
    implementation_status?: string | null
    priority_override?: string | null
  },
) {
  return level2Request(`recommendations/${encodeURIComponent(recommendationId)}/assignment`, "PATCH", { ...patch, ...REVIEWER })
}
