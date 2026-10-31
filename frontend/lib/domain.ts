/**
 * Domain derivations for the Regulatory Intelligence Dashboard.
 *
 * Everything here is pure and deterministic: the same `/api/state` document
 * always produces the same dashboard. The four states in `DashboardState`
 * answer requirement R18 directly:
 *
 *   new_publication — first_seen set on this monitor cycle, no prior regulation
 *   amendment       — a prior regulation was found and changes were classified
 *   awaiting_review — extraction done, a human has not accepted it yet
 *   unresolved      — no reliable prior regulation could be established
 *
 * "Awaiting review" is a review flag and the other three are relationship
 * states, so a document can be *both* an amendment and awaiting review. To keep
 * the queue tabs mutually exclusive (R18: "Four distinct states ... as queue
 * tabs"), the queues cascade in that order; the plain "All" table still shows
 * the composite view, so each tab's count is the count of rows it contains.
 */

import type {
  Applicability,
  ChangeClass,
  Chip,
  Clause,
  Meta,
  MonitorMeta,
  Obligation,
  RegulaState,
  Region,
  ReviewState,
  Source,
} from "./types"

export type { Chip } from "./types"

// ---------------------------------------------------------------------------
// Enum metadata — label + shadcn Badge class for each change class / state
// ---------------------------------------------------------------------------

const chip = (label: string, short: string, className: string): Chip => ({ label, short, className })

const NEUTRAL = "border-border bg-muted text-muted-foreground dark:bg-muted/60"

/** The seven R15 change classes. Every class is reachable from the filter bar. */
export const CHANGE_CLASS: Record<ChangeClass, Chip> = {
  new_obligation: chip(
    "New obligation introduced",
    "New obligation",
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  ),
  modified: chip(
    "Existing obligation modified",
    "Modified",
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  ),
  withdrawn: chip(
    "Obligation withdrawn or superseded",
    "Withdrawn",
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  ),
  deadline_extended: chip(
    "Compliance deadline extended",
    "Deadline extended",
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  ),
  deadline_shortened: chip(
    "Compliance deadline shortened",
    "Deadline shortened",
    "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300",
  ),
  clarification: chip(
    "Additional clarification issued",
    "Clarification",
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
  ),
  no_material_change: chip(
    "No material change identified",
    "No material change",
    NEUTRAL,
  ),
}

export const CHANGE_CLASS_ORDER: ChangeClass[] = [
  "new_obligation",
  "modified",
  "withdrawn",
  "deadline_extended",
  "deadline_shortened",
  "clarification",
  "no_material_change",
]

export type DashboardState = "new_publication" | "amendment" | "awaiting_review" | "unresolved"

export const DASHBOARD_STATE: Record<DashboardState, Chip & { tone: string }> = {
  new_publication: {
    ...chip(
      "New publication",
      "New",
      "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300",
    ),
    tone: "bg-teal-500",
  },
  amendment: {
    ...chip(
      "Amendment",
      "Amendment",
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
    ),
    tone: "bg-blue-500",
  },
  awaiting_review: {
    ...chip(
      "Awaiting review",
      "Awaiting review",
      "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300",
    ),
    tone: "bg-orange-500",
  },
  unresolved: {
    ...chip(
      "Unresolved relationship",
      "Unresolved",
      "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-300",
    ),
    tone: "bg-fuchsia-500",
  },
}

export const DASHBOARD_STATE_ORDER: DashboardState[] = [
  "new_publication",
  "amendment",
  "awaiting_review",
  "unresolved",
]

/** R15 requires a threshold below which the relationship is considered unreliable. */
export const RELATIONSHIP_CONFIDENCE_FLOOR = 0.45

const REGIONS: Region[] = ["KSA", "UAE", "INDIA", "AFRICA"]

export const REGION_LABEL: Record<Region, string> = {
  KSA: "Saudi Arabia",
  UAE: "United Arab Emirates",
  INDIA: "India",
  AFRICA: "Africa",
}

/** Business areas for the "applicability" facet (R9 taxonomy). */
const APPLICABILITY_LABEL: Record<Applicability, string> = {
  ai: "AI",
  banking: "Banking",
  lending: "Lending",
  insurance: "Insurance",
  payments: "Payments",
  bfsi: "BFSI",
}

const APPLICABILITY_ORDER: Applicability[] = ["ai", "banking", "lending", "insurance", "payments", "bfsi"]

const DOC_TYPE_LABEL: Record<string, string> = {
  circular: "Circular",
  amendment: "Amendment",
  guideline: "Guideline",
  consultation: "Consultation",
  regulation: "Regulation",
  framework: "Framework",
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

export const neutralChip = NEUTRAL

export function changeClassChip(value?: string | null): Chip {
  const key = value as ChangeClass | undefined
  if (key && key in CHANGE_CLASS) return CHANGE_CLASS[key]
  if (value) return chip(titleCase(value.replaceAll("_", " ")), titleCase(value.replaceAll("_", " ")), NEUTRAL)
  return chip("Unclassified", "Unclassified", NEUTRAL)
}

export function docTypeLabel(value?: string | null): string {
  if (!value) return "Not classified"
  return DOC_TYPE_LABEL[value] ?? titleCase(value.replaceAll("_", " "))
}

export function applicabilityLabel(value: string): string {
  const key = value as Applicability
  return APPLICABILITY_LABEL[key] ?? titleCase(value.replaceAll("_", " "))
}

/** "not stated" — R2 requires an explicit label when a regulator omits the effective date. */
export function effectiveLabel(source: Source): string {
  return source.effective && source.effective.trim() ? source.effective : "not stated"
}

export function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (m) => m.toUpperCase())
}

// ---------------------------------------------------------------------------
// Source derivations
// ---------------------------------------------------------------------------

/** v1.1 renames `regulator` → `authority`; read either so both contracts render. */
export function authorityOf(source: Source): string {
  return source.authority ?? source.regulator ?? "Unknown authority"
}

/**
 * Region is explicit in v1.1. Under the frozen contract we fall back to the
 * regulator → region map so India's RBI/SEBI documents still group correctly.
 */
export function regionOf(source: Source): Region | "OTHER" {
  if (source.region && (REGIONS as string[]).includes(source.region)) return source.region as Region
  switch (authorityOf(source)) {
    case "SAMA":
      return "KSA"
    case "CBUAE":
      return "UAE"
    case "RBI":
    case "SEBI":
      return "INDIA"
    case "CBN":
      return "AFRICA"
    default:
      return "OTHER"
  }
}

export function relationshipOf(source: Source): Required<Pick<NonNullable<Source["relationship"]>, "status">> &
  NonNullable<Source["relationship"]> {
  const relationship = source.relationship
  if (relationship?.status) return relationship as NonNullable<Source["relationship"]>
  // Derivation for pre-v1.1 payloads: a prior document implies a link, its
  // absence implies the document stands alone. Never a silent "unresolved".
  const prior = (source as Source & { prior_doc?: string | null }).prior_doc
  return prior ? { status: "linked", prior_source_id: prior } : { status: "standalone" }
}

export function isUnresolvedRelationship(source: Source): boolean {
  const relationship = relationshipOf(source)
  if (relationship.status === "unresolved") return true
  return (
    relationship.status === "linked" &&
    typeof relationship.confidence === "number" &&
    relationship.confidence < RELATIONSHIP_CONFIDENCE_FLOOR
  )
}

const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  new: "New — not yet reviewed",
  awaiting_review: "Awaiting review",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
}

export function reviewStateOf(source: Source): ReviewState {
  const explicit = source.review_state as ReviewState | undefined
  if (explicit && explicit in REVIEW_STATE_LABEL) return explicit
  // Derivation for pre-v1.1 payloads: only "new" workflow status is unreviewed.
  return source.status === "new" ? "new" : "approved"
}

export function reviewStateLabel(source: Source): string {
  return REVIEW_STATE_LABEL[reviewStateOf(source)] ?? titleCase(String(source.review_state))
}

export function reviewStateChip(source: Source): Chip {
  switch (reviewStateOf(source)) {
    case "approved":
      return chip("Approved", "Approved", "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300")
    case "rejected":
      return chip("Rejected", "Rejected", "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300")
    case "in_review":
      return chip("In review", "In review", "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300")
    case "awaiting_review":
      return chip("Awaiting review", "Awaiting review", "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300")
    default:
      return chip("New", "New", "border-border bg-muted text-muted-foreground dark:bg-muted/60")
  }
}

/** The four mutually exclusive dashboard states, cascaded in priority order. */
export function dashboardStateOf(source: Source): DashboardState {
  const review = reviewStateOf(source)
  if (review === "new" || review === "awaiting_review" || review === "in_review") return "awaiting_review"
  if (isUnresolvedRelationship(source)) return "unresolved"
  const relationship = relationshipOf(source)
  if (relationship.status === "linked") return "amendment"
  return "new_publication"
}

/** Region badge tint, kept separate from the change-class palette. */
export function regionChipClass(region: Region | "OTHER"): string {
  switch (region) {
    case "KSA":
      return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
    case "UAE":
      return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
    case "INDIA":
      return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
    case "AFRICA":
      return "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300"
    default:
      return NEUTRAL
  }
}

/** Business areas a publication touches, derived from its obligations' applicability. */
export function areasOf(obligations: Obligation[]): Applicability[] {
  const found = new Set<string>()
  for (const obligation of obligations) {
    for (const area of obligation.applicability ?? []) found.add(area)
  }
  return APPLICABILITY_ORDER.filter((area) => found.has(area))
}

export function areaLabel(value: string): string {
  return applicabilityLabel(value)
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

export type SourceRow = {
  source: Source
  state: DashboardState
  region: Region | "OTHER"
  authority: string
  docType: string
  relationship: NonNullable<Source["relationship"]>
  changeClass: ChangeClass | string | undefined
  obligations: Obligation[]
  clauses: Clause[]
  /** Clauses that introduce, amend, replace or withdraw a requirement. */
  changedClauses: Clause[]
  areas: string[]
  businessAreas: string[]
}

const MATERIAL_CHANGE = new Set(["added", "modified", "removed"])

export type Dashboard = {
  rows: SourceRow[]
  regions: (Region | "OTHER")[]
  authorities: string[]
  changeClasses: ChangeClass[]
  businessAreas: string[]
  reviewStates: ReviewState[]
  counts: {
    sources: number
    byState: Record<DashboardState, number>
    byRegion: Record<string, number>
    byChangeClass: Record<string, number>
    obligations: number
    aiObligations: number
    changedClauses: number
  }
}

export function buildDashboard(state: RegulaState): Dashboard {
  const clausesBySource = groupBy(state.clauses, (clause) => clause.source_id)
  const obligationsBySource = groupBy(state.obligations, (obligation) => obligation.source_id)

  const rows: SourceRow[] = state.sources
    .map((source) => {
      const obligations = obligationsBySource.get(source.id) ?? []
      const clauses = clausesBySource.get(source.id) ?? []
      const changedClauses = clauses.filter((clause) => MATERIAL_CHANGE.has(clause.change_type))
      const areas = Array.from(new Set(obligations.flatMap((obligation) => obligation.applicability ?? [])))
      return {
        source,
        state: dashboardStateOf(source),
        region: regionOf(source),
        authority: authorityOf(source),
        docType: docTypeLabel(source.doc_type),
        relationship: relationshipOf(source),
        changeClass: source.change_class,
        obligations,
        clauses,
        changedClauses,
        areas: APPLICABILITY_ORDER.filter((area) => areas.includes(area)),
        businessAreas: Array.from(new Set(obligations.flatMap((obligation) => obligation.applies_to ?? []))).sort(),
      }
    })
    .sort((a, b) => b.source.published.localeCompare(a.source.published))

  const byState = Object.fromEntries(DASHBOARD_STATE_ORDER.map((key) => [key, 0])) as Record<DashboardState, number>
  const byRegion: Record<string, number> = {}
  const byChangeClass: Record<string, number> = {}

  for (const row of rows) {
    byState[row.state] += 1
    byRegion[row.region] = (byRegion[row.region] ?? 0) + 1
    if (row.changeClass) byChangeClass[row.changeClass] = (byChangeClass[row.changeClass] ?? 0) + 1
  }

  const businessAreas = Array.from(new Set(rows.flatMap((row) => row.businessAreas))).sort()
  const changeClasses = CHANGE_CLASS_ORDER.filter((key) => key in byChangeClass)
  const regions = Array.from(new Set(rows.map((row) => row.region)))
  const authorities = Array.from(new Set(rows.map((row) => row.authority))).sort()

  return {
    rows,
    regions,
    authorities,
    changeClasses,
    businessAreas,
    reviewStates: Array.from(new Set(rows.map((row) => reviewStateOf(row.source)))),
    counts: {
      sources: rows.length,
      byState,
      byRegion,
      byChangeClass,
      obligations: state.obligations.length,
      aiObligations: state.obligations.filter((obligation) => (obligation.applicability ?? []).includes("ai")).length,
      changedClauses: rows.reduce((total, row) => total + row.changedClauses.length, 0),
    },
  }
}

// ---------------------------------------------------------------------------
// Filtering (R17 — all five filters compose)
// ---------------------------------------------------------------------------

export type SortKey = "published" | "effective" | "obligations" | "title"

export type Filters = {
  q?: string
  region?: string
  authority?: string
  changeClass?: string
  area?: string
  /** The active queue tab. Absent means "All publications". */
  state?: string
  sort?: string
}

const SORT_KEYS: SortKey[] = ["published", "effective", "obligations", "title"]

export function normalizeFilters(params: Record<string, string | string[] | undefined>): Filters {
  const read = (key: string) => {
    const raw = params[key]
    const value = Array.isArray(raw) ? raw[0] : raw
    const trimmed = value?.trim()
    return trimmed ? trimmed : undefined
  }
  const sort = read("sort")
  return {
    q: read("q"),
    region: read("region"),
    authority: read("authority"),
    changeClass: read("changeClass"),
    area: read("area"),
    state: read("state"),
    sort: sort && (SORT_KEYS as string[]).includes(sort) ? sort : "published",
  }
}

/** Case-insensitive substring match over title, ref, authority and region (R6). */
function matchesSearch(row: SourceRow, q: string): boolean {
  const haystack = [
    row.source.title,
    row.source.short_title,
    row.source.ref,
    row.authority,
    row.source.jurisdiction,
    row.region,
    REGION_LABEL[row.region as Region] ?? "",
    row.docType,
    ...row.source.tags,
  ]
    .join(" ")
    .toLowerCase()
  return haystack.includes(q.toLowerCase())
}

export function filterRows(rows: SourceRow[], filters: Filters): SourceRow[] {
  const q = filters.q?.trim()
  return rows
    .filter((row) => (q ? matchesSearch(row, q) : true))
    .filter((row) => (filters.region ? row.region === filters.region : true))
    .filter((row) => (filters.authority ? row.authority === filters.authority : true))
    .filter((row) => (filters.changeClass ? row.changeClass === filters.changeClass : true))
    .filter((row) => (filters.area ? row.businessAreas.includes(filters.area) : true))
    .filter((row) => (filters.state ? row.state === filters.state : true))
    .sort(comparator(filters.sort))
}

function comparator(sort?: string): (a: SourceRow, b: SourceRow) => number {
  switch (sort) {
    case "effective":
      return (a, b) =>
        (b.source.effective ?? "").localeCompare(a.source.effective ?? "") ||
        b.source.published.localeCompare(a.source.published)
    case "obligations":
      return (a, b) => b.obligations.length - a.obligations.length || b.source.published.localeCompare(a.source.published)
    case "title":
      return (a, b) => a.source.title.localeCompare(b.source.title)
    default:
      return (a, b) => b.source.published.localeCompare(a.source.published)
  }
}

// ---------------------------------------------------------------------------
// Document detail helpers
// ---------------------------------------------------------------------------

export type SourceDetail = {
  row: SourceRow
  prior: Source | null
  related: Source[]
  obligationsByClause: Map<string, Obligation[]>
  citedReferences: { value: string; source: Source | null }[]
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const bucket = map.get(k)
    if (bucket) bucket.push(item)
    else map.set(k, [item])
  }
  return map
}

export function findSource(state: RegulaState, id: string): Source | null {
  return state.sources.find((source) => source.id === id) ?? null
}

/**
 * Resolve a prior-regulation pointer. v1.1 carries the prior source id; the
 * frozen contract carries the prior document filename, which we match against
 * `doc` so pre-v1.1 payloads still link.
 */
export function resolvePrior(state: RegulaState, source: Source): Source | null {
  const pointer = relationshipOf(source).prior_source_id
  if (!pointer) return null
  const direct = findSource(state, pointer)
  if (direct) return direct
  return (
    state.sources.find(
      (candidate) =>
        candidate.id !== source.id &&
        ((candidate as Source & { doc?: string }).doc === pointer || candidate.ref === pointer),
    ) ?? null
  )
}

/** A cited reference opens the prior publication when we can resolve it (R11). */
function resolveReference(state: RegulaState, value: string): Source | null {
  const needle = value.toLowerCase().replaceAll(" ", "")
  return (
    state.sources.find((candidate) => {
      const ref = (candidate.ref ?? "").toLowerCase().replaceAll(" ", "")
      const doc = ((candidate as Source & { doc?: string }).doc ?? "").toLowerCase()
      return (ref && (ref === needle || needle.includes(ref))) || (doc && needle.includes(doc))
    }) ?? null
  )
}

export function buildDetail(state: RegulaState, id: string): SourceDetail | null {
  const dashboard = buildDashboard(state)
  const row = dashboard.rows.find((candidate) => candidate.source.id === id)
  if (!row) return null

  const obligationsByClause = groupBy(row.obligations, (obligation) => obligation.clause_id)

  const referenced = new Map<string, { value: string; source: Source | null }>()
  for (const obligation of row.obligations) {
    for (const reference of obligation.references ?? []) {
      if (!referenced.has(reference)) referenced.set(reference, { value: reference, source: resolveReference(state, reference) })
    }
  }

  return {
    row,
    prior: resolvePrior(state, row.source),
    related: dashboard.rows
      .filter((candidate) => candidate.source.id !== row.source.id && candidate.region === row.region)
      .map((candidate) => candidate.source),
    obligationsByClause,
    citedReferences: Array.from(referenced.values()),
  }
}

/** Parse "10%" / "24 months" style values so the diff can mark numeric changes. */
export function numericTokens(text: string): Set<string> {
  const matches = text.match(/\b\d+(?:\.\d+)?(?:\s?(?:%|per cent|months?|days?|years?|hours?|weeks?))?/gi) ?? []
  return new Set(matches.map((match) => match.toLowerCase().replace(/\s+/g, " ")))
}

export function describeMeta(meta: Meta): { regions: Region[]; monitor: Required<MonitorMeta> & { configured: boolean } } {
  const regions = (meta.regions ?? REGIONS).filter((region): region is Region => REGIONS.includes(region))
  const monitor = meta.monitor ?? {}
  return {
    regions: regions.length ? regions : REGIONS,
    monitor: {
      configured_sources: monitor.configured_sources ?? 0,
      frequency_hours: monitor.frequency_hours ?? 0,
      last_run: monitor.last_run ?? "",
      next_run: monitor.next_run ?? "",
      configured: Boolean(monitor.last_run || monitor.configured_sources),
    },
  }
}
