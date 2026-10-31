"use client"

import { CheckIcon, FileClockIcon, PlayIcon, WrenchIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"

import { reviewRecommendation, runLevel2Analysis, saveRecommendation } from "@/app/actions"
import { FilterPills, Notice, Panel } from "@/components/organisation/org-ui"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/lib/format"
import type {
  GapState,
  Level2Analysis,
  Level2Gap,
  Level2Mapping,
  Level2Recommendation,
  MatrixRow,
} from "@/lib/level2-types"
import { cn } from "@/lib/utils"

const STATE: Record<GapState, { label: string; tone: string }> = {
  addressed: {
    label: "Addressed",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  },
  partially_addressed: {
    label: "Partial",
    tone: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  },
  not_addressed: {
    label: "No control",
    tone: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
  },
  cannot_assess: {
    label: "Cannot assess",
    tone: "border-border bg-muted text-muted-foreground",
  },
}

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "border-border bg-muted text-muted-foreground" },
  approved: {
    label: "Approved",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  },
  rejected: {
    label: "Rejected",
    tone: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
  },
  superseded: { label: "Superseded", tone: "border-border bg-muted text-muted-foreground" },
}

const PRIORITY: Record<string, string> = {
  critical: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200",
  high: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  medium: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
  low: "border-border bg-muted text-muted-foreground",
}

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold", className)}>
      {children}
    </span>
  )
}

/** Triggers one analysis run. Revalidates the route so the page re-reads the run. */
export function RunAssessment({ label = "Run assessment" }: { label?: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function run() {
    startTransition(async () => {
      setError(null)
      const result = await runLevel2Analysis()
      if (!result.ok) {
        setError(result.message ?? "The analysis failed.")
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
      <Button type="button" size="sm" onClick={run} disabled={pending}>
        {pending ? <FileClockIcon className="animate-pulse" aria-hidden /> : <PlayIcon aria-hidden />}
        {pending ? "Assessing…" : label}
      </Button>
    </div>
  )
}

function GapCard({ gap, mapping }: { gap: Level2Gap; mapping?: Level2Mapping }) {
  const state = STATE[gap.state]
  return (
    <article className="grid gap-2 rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-center gap-2">
        <Chip className={state.tone}>{state.label}</Chip>
        <span className="text-xs font-semibold">{gap.obligation_ref || "Regulatory requirement"}</span>
        <span className="text-[10px] text-muted-foreground">{gap.department}</span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
          confidence {Math.round(gap.confidence * 100)}%
        </span>
      </header>

      <p className="text-sm">{gap.summary}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{gap.why_insufficient}</p>

      <p className="text-[11px] text-muted-foreground">
        Internal evidence:{" "}
        <b className="font-medium text-foreground">{gap.internal_title}</b>
        {mapping?.internal.ref ? ` §${mapping.internal.ref}` : ""}
      </p>

      {gap.what_is_missing.length ? (
        <div className="flex flex-wrap gap-1.5">
          {gap.what_is_missing.map((item) => (
            <Chip key={item} className="border-border bg-muted/60 text-muted-foreground">
              missing: {item}
            </Chip>
          ))}
        </div>
      ) : null}

      {mapping?.internal_quote ? (
        <blockquote className="border-l-2 border-border pl-3 text-[11px] leading-relaxed text-muted-foreground">
          “{mapping.internal_quote.slice(0, 240)}
          {mapping.internal_quote.length > 240 ? "…" : ""}”
        </blockquote>
      ) : null}

      {gap.needs_review ? (
        <p className="text-[10px] font-medium text-amber-700 dark:text-amber-300">Flagged for reviewer attention.</p>
      ) : null}
    </article>
  )
}

function DraftCard({ rec, ownerName }: { rec: Level2Recommendation; ownerName?: string | null }) {
  const [text, setText] = useState(rec.proposed_text)
  const [note, setNote] = useState("")
  const [role, setRole] = useState<"reviewer" | "admin">("reviewer")
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null)
  const router = useRouter()

  const editable = rec.status === "draft"
  const dirty = text.trim() !== rec.proposed_text.trim()

  function save() {
    startTransition(async () => {
      setMessage(null)
      const result = await saveRecommendation(rec.id, { proposed_text: text })
      if (!result.ok) {
        setMessage({ tone: "error", text: result.message ?? "Could not save the draft." })
        return
      }
      setMessage({ tone: "success", text: "Draft saved as a new version." })
      router.refresh()
    })
  }

  function decide(decision: "approve" | "reject") {
    startTransition(async () => {
      setMessage(null)
      if (decision === "reject" && !note.trim()) {
        setMessage({ tone: "error", text: "A rejection needs a note." })
        return
      }
      const result = await reviewRecommendation(rec.id, decision, role, note)
      if (!result.ok) {
        setMessage({ tone: "error", text: result.message ?? "Could not record the decision." })
        return
      }
      setMessage({ tone: "success", text: decision === "approve" ? "Approved and written to the audit chain." : "Rejected." })
      router.refresh()
    })
  }

  return (
    <article className="grid gap-3 rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-center gap-2">
        <Chip className={STATUS[rec.status]?.tone ?? STATUS.draft.tone}>{STATUS[rec.status]?.label ?? rec.status}</Chip>
        <Chip className={PRIORITY[rec.priority.level] ?? PRIORITY.low}>{rec.priority.level}</Chip>
        {rec.method === "llm" ? (
          <Chip className="border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
            AI-polished
          </Chip>
        ) : null}
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{rec.change_type.replaceAll("_", " ")}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">v{rec.version}</span>
      </header>

      <div>
        <h3 className="text-sm font-semibold">{rec.title}</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {rec.business_area || "Unassigned area"} · {rec.target.title}
          {rec.target.ref ? ` §${rec.target.ref}` : ""}
        </p>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{rec.rationale}</p>

      <label className="grid gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Proposed change</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          readOnly={!editable}
          rows={4}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-xs leading-relaxed shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 read-only:bg-muted/40"
        />
      </label>

      <blockquote className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        <b className="font-semibold text-foreground">{rec.regulatory_clause.section_ref}</b> — “{rec.regulatory_clause.quote.slice(0, 220)}
        {rec.regulatory_clause.quote.length > 220 ? "…" : ""}”
      </blockquote>

      {rec.acceptance_criteria.length ? (
        <ul className="grid gap-1 text-[11px] text-muted-foreground">
          {rec.acceptance_criteria.map((criterion) => (
            <li key={criterion} className="flex gap-1.5">
              <CheckIcon className="mt-0.5 size-3 shrink-0 text-emerald-600" aria-hidden />
              {criterion}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-[10px] text-muted-foreground">
        Owner:{" "}
        {rec.assignment.status === "unassigned"
          ? `unassigned · suggested ${rec.assignment.suggested_department}`
          : ownerName ?? rec.assignment.owner_id}
        {rec.approved_by ? ` · approved by ${rec.approved_by} on ${formatDateTime(rec.approved_at)}` : ""}
      </p>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {editable ? (
        <div className="grid gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={save} disabled={pending || !dirty || !text.trim()}>
              Save draft
            </Button>
            <label className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
              role
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as "reviewer" | "admin")}
                className="h-7 rounded-md border border-input bg-card px-2 text-xs"
                disabled={pending}
              >
                <option value="reviewer">reviewer</option>
                <option value="admin">admin</option>
              </select>
            </label>
          </div>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Reviewer note (required to reject)"
            className="h-8 w-full rounded-lg border border-input bg-card px-3 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            disabled={pending}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => decide("approve")} disabled={pending}>
              <CheckIcon aria-hidden />
              Approve
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => decide("reject")} disabled={pending}>
              <XIcon aria-hidden />
              Reject
            </Button>
          </div>
        </div>
      ) : (
        <p className="border-t border-border pt-3 text-[10px] text-muted-foreground">
          Final for this version. A new analysis creates a new draft.
        </p>
      )}
    </article>
  )
}

export function AssessmentWorkspace({
  analysis,
  matrix,
  people,
}: {
  analysis: Level2Analysis
  matrix: MatrixRow[]
  people: Record<string, string>
}) {
  const [tab, setTab] = useState<"gaps" | "drafts" | "matrix">("gaps")
  const [filter, setFilter] = useState<GapState | "all">("all")
  const router = useRouter()

  const mappings = useMemo(() => {
    const map = new Map<string, Level2Mapping>()
    for (const mapping of analysis.mappings) map.set(mapping.id, mapping)
    return map
  }, [analysis.mappings])

  const gaps = filter === "all" ? analysis.gaps : analysis.gaps.filter((gap) => gap.state === filter)
  const counts = analysis.counts
  const stats = [
    { label: "Obligations", value: counts.obligations },
    { label: "Clause mappings", value: counts.mappings },
    { label: "Gaps", value: analysis.gaps.length },
    { label: "Drafts", value: analysis.recommendations.length },
  ]

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-lg font-semibold">Run {analysis.id}</h2>
            <Chip className={STATUS.draft.tone}>engine {analysis.engine_version}</Chip>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Generated {formatDateTime(analysis.generated_at)} · {analysis.internal_scope.length} internal documents in scope
          </p>
        </div>
        <RunAssessment label="Run again" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{stat.label}</div>
            <div className="font-heading text-xl font-semibold tabular-nums">{stat.value}</div>
          </div>
        ))}
      </div>

      {analysis.excluded.length ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {analysis.excluded.length} internal document(s) excluded: {analysis.excluded.map((item) => item.title || item.document_id).join(", ")}.
        </p>
      ) : null}

      <nav aria-label="Assessment sections" className="flex gap-1 border-b border-border">
        {(
          [
            ["gaps", `Gaps (${analysis.gaps.length})`],
            ["drafts", `Drafts (${analysis.recommendations.length})`],
            ["matrix", `Impact matrix (${matrix.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 pb-2 text-sm font-medium transition-colors",
              tab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => router.refresh()}>
          Refresh
        </Button>
      </nav>

      {tab === "gaps" ? (
        <div className="grid gap-3">
          <FilterPills
            value={filter}
            onChange={(value) => setFilter(value as GapState | "all")}
            options={[
              { value: "all", label: "All", count: analysis.gaps.length },
              ...(Object.keys(STATE) as GapState[]).map((key) => ({
                value: key,
                label: STATE[key].label,
                count: analysis.gaps.filter((gap) => gap.state === key).length,
              })),
            ]}
          />
          {gaps.length === 0 ? (
            <Panel title="No gaps in this state" description="Switch the filter to see the rest of the assessment.">
              <span />
            </Panel>
          ) : (
            gaps.map((gap) => (
              <GapCard key={gap.id} gap={gap} mapping={mappings.get(gap.mapping_ids[0] ?? "")} />
            ))
          )}
        </div>
      ) : null}

      {tab === "drafts" ? (
        <div className="grid gap-3">
          {analysis.recommendations.length === 0 ? (
            <Panel title="No drafts" description="Every requirement is either addressed or has no supporting evidence.">
              <span />
            </Panel>
          ) : (
            analysis.recommendations.map((rec) => (
              <DraftCard
                key={rec.id}
                rec={rec}
                ownerName={rec.assignment.owner_id ? people[rec.assignment.owner_id] : null}
              />
            ))
          )}
        </div>
      ) : null}

      {tab === "matrix" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Obligation</th>
                <th className="px-3 py-2 font-medium">Internal component</th>
                <th className="px-3 py-2 font-medium">Gap</th>
                <th className="px-3 py-2 font-medium">Recommended change</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium">Owner</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.row_id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium">{row.obligation.section_ref || "Requirement"}</div>
                    <div className="text-[10px] text-muted-foreground">{row.obligation.source_title || row.obligation.source_id}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium">{row.internal.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {row.internal.department}
                      {row.mapping?.relation ? ` · ${row.mapping.relation.replaceAll("_", " ")}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Chip className={STATE[row.gap.state].tone}>{STATE[row.gap.state].label}</Chip>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.recommendation ? (
                      <>
                        <div className="font-medium">{row.recommendation.title}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {row.recommendation.change_type.replaceAll("_", " ")} · {row.recommendation.status}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.recommendation ? (
                      <Chip className={PRIORITY[row.recommendation.priority] ?? PRIORITY.low}>
                        {row.recommendation.priority}
                      </Chip>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div>
                      {row.assignment.owner_id
                        ? people[row.assignment.owner_id] ?? row.assignment.owner_id
                        : "Unassigned"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{row.assignment.suggested_department}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

/** Small full-width empty state used by the page before the first run. */
export function EmptyAssessment() {
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">
        <WrenchIcon className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <div>
        <h2 className="font-heading text-base font-semibold">No impact assessment yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Run the engine over the analysed regulations and your internal documents. It maps obligations to clauses,
          states the gap and drafts a specific fix for review.
        </p>
      </div>
      <RunAssessment label="Run the first assessment" />
    </div>
  )
}
