"use server"

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
