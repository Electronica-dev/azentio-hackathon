import "server-only"

import type { AnalysisSummary, Level2Analysis, Level2Envelope, MatrixRow } from "./level2-types"

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string }

function apiBase(): string {
  return (process.env.REGULA_API_URL ?? process.env.NEXT_PUBLIC_REGULA_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "")
}

async function load<T>(path: string, timeout = 8000): Promise<Loaded<T>> {
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeout),
      headers: { accept: "application/json" },
    })
    if (!response.ok) return { ok: false, error: `GET ${path} returned HTTP ${response.status}` }
    return { ok: true, data: (await response.json()) as T }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "the API is unreachable" }
  }
}

/**
 * Latest analysis plus its matrix. Two extra reads on top of the list, not one
 * per gap — the page renders from a single snapshot of the run.
 */
export async function getLevel2(): Promise<Loaded<Level2Envelope>> {
  const list = await load<{ analyses: AnalysisSummary[] }>("/api/level2/analyses")
  if (!list.ok) return list

  const latest = list.data.analyses[0] ?? null
  if (!latest) return { ok: true, data: { analyses: [], latest: null, matrix: [] } }

  const [analysis, matrix] = await Promise.all([
    load<{ analysis: Level2Analysis }>(`/api/level2/analyses/${encodeURIComponent(latest.id)}`),
    load<{ rows: MatrixRow[] }>(`/api/level2/impact-matrix?analysis_id=${encodeURIComponent(latest.id)}`),
  ])
  if (!analysis.ok) return analysis
  if (!matrix.ok) return matrix

  return {
    ok: true,
    data: { analyses: list.data.analyses, latest: analysis.data.analysis, matrix: matrix.data.rows },
  }
}
