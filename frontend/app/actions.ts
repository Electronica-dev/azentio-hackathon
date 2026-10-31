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
    revalidatePath("/")
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
    revalidatePath("/")
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "link failed" }
  }
}
