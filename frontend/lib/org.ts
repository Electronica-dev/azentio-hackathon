import "server-only"

export type OrgDocument = {
  id: string
  title: string
  category: string
  department: string
  owner: string
  version: string
  review_date: string
  filename: string
  bytes: number
  words: number
  quality: string
  excerpt: string
  uploaded: string
}

export type OrgAsset = {
  id: string
  type: "policy" | "control" | "system" | "process"
  name: string
  owner: string
  team: string
  criticality: number
  version?: string
  state?: string
  tags?: string[]
}

export type Person = {
  id: string
  name: string
  email: string
  department: string
  designation: string
}

export type OrgSnapshot = {
  documents: OrgDocument[]
  assets: OrgAsset[]
  people: Person[]
  categories: { value: string; label: string }[]
  asset_types: string[]
}

export type ScoreComponent = { key: string; label: string; weight: number; score: number | null; detail: string }

export type Overview = {
  score: number | null
  grade: "good" | "fair" | "at_risk" | null
  components: ScoreComponent[]
  totals: {
    documents: number
    assets: number
    people: number
    departments: number
    publications: number
    open_changes: number
    critical_impacts: number
    open_tasks: number
  }
  attention: { id: string; asset: string; team: string; owner: string; gap: string; source_id: string; ref: string; score: number }[]
  deadlines: { source_id: string; title: string; ref: string; authority: string; effective: string; days_left: number }[]
  open_tasks_by_team: { team: string; open: number }[]
  missing_categories: { value: string; label: string }[]
}

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string }

function apiBase(): string {
  return (process.env.REGULA_API_URL ?? process.env.NEXT_PUBLIC_REGULA_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "")
}

async function load<T>(path: string): Promise<Loaded<T>> {
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      headers: { accept: "application/json" },
    })
    if (!response.ok) return { ok: false, error: `GET ${path} returned HTTP ${response.status}` }
    return { ok: true, data: (await response.json()) as T }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "the API is unreachable" }
  }
}

/** Internal documents, assets and people. Always fresh: these change from this app. */
export function getOrg(): Promise<Loaded<OrgSnapshot>> {
  return load<OrgSnapshot>("/api/org")
}

/** Compliance score and the Home page summary. */
export function getOverview(): Promise<Loaded<Overview>> {
  return load<Overview>("/api/overview")
}

export const CATEGORY_LABEL: Record<string, string> = {
  policy: "Policy or SOP",
  process: "Business process",
  control_catalogue: "Risk & control catalogue",
  ai_governance: "AI governance policy",
  system_inventory: "System inventory",
  ownership_register: "Ownership register",
}
