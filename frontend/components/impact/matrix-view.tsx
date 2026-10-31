"use client"

import { ChevronDownIcon, CircleAlertIcon, UserRoundCheckIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { Fragment, useMemo, useState, useTransition } from "react"

import { reviewRecommendation, updateAssignment } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/format"
import type { Person } from "@/lib/org"
import type { Analysis, Assignment, Gap, GapState, Mapping, MatrixRow, Priority, Recommendation } from "@/lib/impact"
import { cn } from "@/lib/utils"

import { FilterPills, INPUT, Notice, Select } from "../organisation/org-ui"

export const GAP: Record<GapState, { label: string; className: string }> = {
  addressed: { label: "Addressed", className: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" },
  partially_addressed: { label: "Partially addressed", className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300" },
  not_addressed: { label: "Not addressed", className: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300" },
  cannot_assess: { label: "Cannot assess", className: "border-border bg-muted text-muted-foreground" },
}

const PRIORITY: Record<Priority, string> = {
  critical: "text-rose-700 dark:text-rose-300",
  high: "text-amber-700 dark:text-amber-300",
  medium: "text-foreground",
  low: "text-muted-foreground",
}

const IMPLEMENTATION = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
]

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase())
}

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap", className)}>{children}</span>
}

function OwnerCell({ assignment, people }: { assignment: Assignment | null; people: Map<string, Person> }) {
  if (!assignment) return <span className="text-muted-foreground">—</span>
  const owner = assignment.owner_id ? people.get(assignment.owner_id) : null
  if (owner) {
    return (
      <span className="block">
        <span className="flex items-center gap-1.5 font-medium">
          {assignment.status === "confirmed" ? <UserRoundCheckIcon className="size-3.5 text-emerald-600" aria-label="Confirmed" /> : null}
          {owner.name}
        </span>
        <span className="text-xs text-muted-foreground">{assignment.status === "confirmed" ? "Confirmed" : "Suggested · needs confirming"}</span>
      </span>
    )
  }
  return (
    <span className="block">
      <span className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
        <CircleAlertIcon className="size-3.5" aria-hidden />
        Assign manually
      </span>
      <span className="text-xs text-muted-foreground">{assignment.suggested_department !== "Unassigned" ? assignment.suggested_department : "No department"}</span>
    </span>
  )
}

function AssignmentForm({ rec, people, deadline }: { rec: Recommendation; people: Person[]; deadline?: string }) {
  const router = useRouter()
  const a = rec.assignment
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null)
  const departments = useMemo(() => {
    const groups = new Map<string, Person[]>()
    for (const person of [...people].sort((x, y) => x.name.localeCompare(y.name))) {
      const key = person.department || "No department"
      groups.set(key, [...(groups.get(key) ?? []), person])
    }
    return [...groups.entries()].sort(([x], [y]) => x.localeCompare(y))
  }, [people])

  function save(form: HTMLFormElement, confirmOnly = false) {
    const data = new FormData(form)
    const owner = String(data.get("owner_id") ?? "") || null
    const patch = confirmOnly
      ? { confirm: true }
      : {
          ...(owner !== a.owner_id ? { owner_id: owner } : {}),
          due_date: String(data.get("due_date") ?? "") || null,
          ...(owner ? { implementation_status: String(data.get("implementation_status") ?? "") || null } : {}),
          priority_override: String(data.get("priority_override") ?? "") || null,
        }
    startTransition(async () => {
      setNotice(null)
      const result = await updateAssignment(rec.id, patch)
      setNotice(result.ok ? { tone: "success", text: "Saved." } : { tone: "error", text: result.message ?? "Could not save." })
      if (result.ok) router.refresh()
    })
  }

  if (rec.status === "rejected") {
    return <p className="text-sm text-muted-foreground">Rejected recommendations are not actioned.</p>
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        save(event.currentTarget)
      }}
    >
      {a.needs_manual_assignment ? (
        <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <b className="font-medium">Needs manual assignment.</b> {a.manual_reason}
          </span>
        </p>
      ) : a.basis ? (
        <p className="text-sm text-muted-foreground">
          {a.status === "confirmed" ? "From the register: " : "Suggested from the register: "}
          {a.basis}
        </p>
      ) : null}

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Owner</span>
        <Select name="owner_id" defaultValue={a.owner_id ?? ""}>
          <option value="">Unassigned</option>
          {departments.map(([dept, members]) => (
            <optgroup key={dept} label={dept}>
              {members.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                  {person.designation ? ` — ${person.designation}` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <span className="text-xs text-muted-foreground">Suggested department: {a.suggested_department}</span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Action deadline</span>
          <input type="date" name="due_date" defaultValue={a.due_date ?? ""} className={INPUT} />
          {deadline ? <span className="text-xs text-muted-foreground">Regulation effective {formatDate(deadline)}</span> : null}
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Status</span>
          <Select name="implementation_status" defaultValue={a.implementation_status ?? "not_started"} disabled={!a.owner_id}>
            {IMPLEMENTATION.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          {!a.owner_id ? <span className="text-xs text-muted-foreground">Assign an owner first</span> : null}
        </label>
      </div>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Delivery priority</span>
        <Select name="priority_override" defaultValue={a.priority_override ?? ""}>
          <option value="">As assessed ({rec.priority.level})</option>
          {(["critical", "high", "medium", "low"] as const).map((p) => (
            <option key={p} value={p}>
              {label(p)}
            </option>
          ))}
        </Select>
      </label>

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {a.status === "assigned" && a.owner_id ? (
          <Button type="button" variant="outline" disabled={pending} onClick={(event) => save(event.currentTarget.form!, true)}>
            Confirm owner
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  )
}

function ReviewControls({ rec }: { rec: Recommendation }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  if (rec.status !== "draft") {
    return (
      <p className="text-sm text-muted-foreground">
        {label(rec.status)}
        {rec.approved_by ? ` by ${rec.approved_by}` : ""}
        {rec.review_note ? ` — “${rec.review_note}”` : ""}
      </p>
    )
  }
  function review(decision: "approve" | "reject") {
    const note = decision === "reject" ? window.prompt("Why is this being rejected?")?.trim() : undefined
    if (decision === "reject" && !note) return
    startTransition(async () => {
      const result = await reviewRecommendation(rec.id, decision, "reviewer", note ?? "")
      setError(result.ok ? null : (result.message ?? "Review failed."))
      if (result.ok) router.refresh()
    })
  }
  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => review("approve")}>
          Approve draft
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => review("reject")}>
          Reject
        </Button>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  )
}

function Detail({
  row,
  gap,
  rec,
  mappings,
  people,
  deadline,
}: {
  row: MatrixRow
  gap?: Gap
  rec?: Recommendation
  mappings: Mapping[]
  people: Person[]
  deadline?: string
}) {
  return (
    <div className="grid gap-6 bg-muted/30 px-4 py-5 lg:grid-cols-3">
      <section className="grid content-start gap-3 text-sm">
        <h3 className="font-medium">Gap</h3>
        <p>{gap?.why_insufficient ?? row.gap.summary}</p>
        {gap?.what_is_missing.length ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Missing</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {gap.what_is_missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="grid gap-2">
          <p className="text-xs font-medium text-muted-foreground">Regulation · {row.obligation.section_ref}</p>
          <blockquote className="border-l-2 border-primary/50 pl-3 text-muted-foreground italic">“{row.obligation.quote}”</blockquote>
          {mappings.slice(0, 2).map((m) => (
            <Fragment key={m.id}>
              <p className="text-xs font-medium text-muted-foreground">
                {m.internal.title} §{m.internal.ref} · {label(m.relation)} · {Math.round(m.confidence * 100)}%
              </p>
              <blockquote className="border-l-2 border-border pl-3 text-muted-foreground italic">“{m.internal_quote}”</blockquote>
            </Fragment>
          ))}
        </div>
      </section>

      <section className="grid content-start gap-3 text-sm">
        <h3 className="font-medium">Recommended change</h3>
        {rec ? (
          <>
            <p className="font-medium">{rec.title}</p>
            <p className="rounded-lg border border-border bg-card p-3 leading-relaxed">{rec.proposed_text}</p>
            <p className="text-muted-foreground">
              <span className={cn("font-medium", PRIORITY[rec.priority.level])}>{label(rec.priority.level)} priority.</span>{" "}
              {rec.priority.rationale}
            </p>
            {rec.acceptance_criteria.length ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Done when</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {rec.acceptance_criteria.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ReviewControls rec={rec} />
          </>
        ) : (
          <p className="text-muted-foreground">No change needed: every required element is covered.</p>
        )}
      </section>

      <section className="grid content-start gap-3 text-sm">
        <h3 className="font-medium">Owner and action</h3>
        {rec ? (
          <AssignmentForm key={`${rec.id}-${rec.assignment.updated_at ?? ""}`} rec={rec} people={people} deadline={deadline} />
        ) : (
          <p className="text-muted-foreground">Nothing to action.</p>
        )}
      </section>
    </div>
  )
}

/**
 * The regulatory impact matrix: one row per obligation × internal document
 * (contract ImpactMatrixRow). Expanding a row shows the evidence, the draft
 * change and the owner, deadline and status a reviewer controls.
 */
export function MatrixView({
  analysis,
  rows,
  people,
  effective,
  initialOpen,
}: {
  analysis: Analysis
  rows: MatrixRow[]
  people: Person[]
  /** source id → regulation effective date, for the deadline hint */
  effective: Record<string, string>
  /** row_id to open on load (`?row=`), so a row can be linked to directly */
  initialOpen?: string
}) {
  const [state, setState] = useState("all")
  const [department, setDepartment] = useState("all")
  const [ownerFilter, setOwnerFilter] = useState("all")
  const [open, setOpen] = useState<string | null>(initialOpen ?? null)

  const gaps = useMemo(() => new Map((analysis.gaps ?? []).map((g) => [g.id, g])), [analysis])
  const recs = useMemo(() => new Map((analysis.recommendations ?? []).map((r) => [r.id, r])), [analysis])
  const maps = useMemo(() => new Map((analysis.mappings ?? []).map((m) => [m.id, m])), [analysis])
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const today = new Date().toISOString().slice(0, 10)

  const assignmentOf = (row: MatrixRow) => (row.recommendation ? (recs.get(row.recommendation.id)?.assignment ?? row.assignment) : null)
  const departments = [...new Set(rows.map((r) => r.internal?.department || "Unassigned"))].sort()
  const shown = rows.filter((row) => {
    const a = assignmentOf(row)
    if (state !== "all" && row.gap.state !== state) return false
    if (department !== "all" && (row.internal?.department || "Unassigned") !== department) return false
    if (ownerFilter === "manual" && !(a && !a.owner_id)) return false
    if (ownerFilter === "unconfirmed" && !(a && a.owner_id && a.status !== "confirmed")) return false
    if (ownerFilter === "overdue" && !(a?.due_date && a.due_date < today && a.implementation_status !== "done")) return false
    return true
  })
  const count = (s: string) => rows.filter((r) => r.gap.state === s).length
  const manual = rows.filter((r) => {
    const a = assignmentOf(r)
    return a && !a.owner_id
  }).length

  return (
    <div className="grid gap-4">
      <FilterPills
        value={state}
        onChange={setState}
        options={[
          { value: "all", label: "All", count: rows.length },
          ...(Object.keys(GAP) as GapState[]).map((s) => ({ value: s, label: GAP[s].label, count: count(s) })),
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-48">
          <Select value={department} onChange={(event) => setDepartment(event.target.value)} aria-label="Department">
            <option value="all">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </span>
        <span className="w-56">
          <Select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} aria-label="Ownership">
            <option value="all">Any ownership</option>
            <option value="manual">Needs manual assignment ({manual})</option>
            <option value="unconfirmed">Owner not yet confirmed</option>
            <option value="overdue">Overdue actions</option>
          </Select>
        </span>
        <span className="ml-auto text-sm text-muted-foreground">
          {shown.length} of {rows.length} rows
        </span>
      </div>

      {shown.length ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Obligation</th>
                <th className="px-4 py-2.5 font-medium">Internal component</th>
                <th className="px-4 py-2.5 font-medium">Gap</th>
                <th className="px-4 py-2.5 font-medium">Recommended change</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
                <th className="px-4 py-2.5 font-medium">Due</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="w-10" aria-label="Expand" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((row) => {
                const a = assignmentOf(row)
                const rec = row.recommendation ? recs.get(row.recommendation.id) : undefined
                const gap = gaps.get(row.gap.id)
                const isOpen = open === row.row_id
                const priority = (a?.priority_override ?? row.recommendation?.priority) as Priority | undefined
                const overdue = a?.due_date && a.due_date < today && a.implementation_status !== "done"
                return (
                  <Fragment key={row.row_id}>
                    <tr
                      className={cn("cursor-pointer align-top hover:bg-muted/30", isOpen && "bg-muted/30")}
                      onClick={() => setOpen(isOpen ? null : row.row_id)}
                    >
                      <td className="max-w-[260px] px-4 py-3">
                        <span className="font-medium">{row.obligation.section_ref}</span>
                        <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.obligation.quote}</span>
                      </td>
                      <td className="max-w-[200px] px-4 py-3">
                        {row.internal?.document_id ? (
                          <>
                            <span className="block font-medium">{row.internal.title}</span>
                            <span className="text-xs text-muted-foreground">{row.internal.department}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground italic">No matching document</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={GAP[row.gap.state]?.className}>{GAP[row.gap.state]?.label ?? "Needs review"}</Badge>
                      </td>
                      <td className="max-w-[240px] px-4 py-3">
                        {row.recommendation ? (
                          <>
                            <span className="line-clamp-2">{row.recommendation.title}</span>
                            <span className="text-xs">
                              <span className={cn("font-medium", priority && PRIORITY[priority])}>{priority ? label(priority) : ""}</span>
                              <span className="text-muted-foreground"> · {label(row.recommendation.status)}</span>
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">None needed</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <OwnerCell assignment={a} people={byId} />
                      </td>
                      <td className={cn("px-4 py-3 whitespace-nowrap", overdue && "font-medium text-destructive")}>
                        {a?.due_date ? formatDate(a.due_date) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {a?.implementation_status ? label(a.implementation_status) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-3">
                        <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} aria-hidden />
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr>
                        <td colSpan={8} className="p-0">
                          <Detail
                            row={row}
                            gap={gap}
                            rec={rec}
                            mappings={(gap?.mapping_ids ?? []).map((id) => maps.get(id)).filter((m): m is Mapping => Boolean(m))}
                            people={people}
                            deadline={effective[row.obligation.source_id]}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No rows match these filters.
        </p>
      )}
    </div>
  )
}
