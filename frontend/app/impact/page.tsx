import type { Metadata } from "next"
import { CircleAlertIcon } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { AppHeader } from "@/components/dashboard/app-header"
import { MatchOwners, RunAnalysis } from "@/components/impact/impact-actions"
import { MatrixView } from "@/components/impact/matrix-view"
import { formatDateTime } from "@/lib/format"
import { getImpact } from "@/lib/impact"
import { getOrg } from "@/lib/org"
import { getRegulaState } from "@/lib/state"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Impact matrix · Regula",
  description: "Each regulatory obligation linked to the internal documents it affects, with the gap, the recommended change, an owner, a deadline and a status.",
}

export default function Page(props: PageProps<"/impact">) {
  return (
    <>
      <AppHeader active="impact" />
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
          <ImpactView searchParams={props.searchParams} />
        </Suspense>
      </main>
    </>
  )
}

function Unavailable({ error }: { error: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        This page needs the backend, which is unreachable ({error}). Start it with <code className="font-mono">python backend/serve.py</code> and reload.
      </span>
    </div>
  )
}

async function ImpactView({ searchParams }: Pick<PageProps<"/impact">, "searchParams">) {
  const params = await searchParams
  const requested = Array.isArray(params.analysis) ? params.analysis[0] : params.analysis
  const openRow = Array.isArray(params.row) ? params.row[0] : params.row
  const [impact, org, { state }] = await Promise.all([getImpact(requested), getOrg(), getRegulaState()])

  const sources = state.sources
    .map((s) => ({ id: s.id, title: s.short_title || s.title, obligations: state.obligations.filter((o) => o.source_id === s.id).map((o) => o.id) }))
    .filter((s) => s.obligations.length)
  const effective = Object.fromEntries(state.sources.filter((s) => s.effective).map((s) => [s.id, s.effective as string]))

  const header = (
    <section className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Impact matrix</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each regulatory obligation linked to the internal documents it affects, with the gap, the recommended change, and who owns
          the action.
        </p>
      </div>
      <RunAnalysis sources={sources} />
    </section>
  )

  if (!impact.ok) return (<>{header}<Unavailable error={impact.error} /></>)
  if (!org.ok) return (<>{header}<Unavailable error={org.error} /></>)

  const { analysis, analyses, rows } = impact.data
  if (!analysis) {
    return (
      <>
        {header}
        <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <p className="font-medium">No analysis yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Upload your internal policies on the{" "}
            <Link href="/organisation" className="font-medium text-primary hover:underline">
              Organisation
            </Link>{" "}
            page, add the people who own them, then run an analysis above.
          </p>
        </div>
      </>
    )
  }

  const open = (analysis.recommendations ?? []).filter((r) => r.status !== "rejected")
  const today = new Date().toISOString().slice(0, 10)
  const stats = [
    { label: "Need an owner", value: open.filter((r) => !r.assignment.owner_id).length, tone: "text-amber-700 dark:text-amber-300" },
    { label: "Owner to confirm", value: open.filter((r) => r.assignment.owner_id && r.assignment.status !== "confirmed").length },
    {
      label: "Overdue",
      value: open.filter((r) => r.assignment.due_date && r.assignment.due_date < today && r.assignment.implementation_status !== "done").length,
      tone: "text-destructive",
    },
    { label: "Done", value: open.filter((r) => r.assignment.implementation_status === "done").length, hint: `of ${open.length} actions` },
  ]

  return (
    <>
      {header}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        {analyses.length > 1 ? (
          <nav aria-label="Analyses" className="flex flex-wrap gap-1">
            {analyses.slice(0, 6).map((a) => (
              <Link
                key={a.id}
                href={`/impact?analysis=${a.id}`}
                aria-current={a.id === analysis.id ? "page" : undefined}
                className={cn("rounded-md px-2 py-0.5 font-mono text-xs", a.id === analysis.id ? "bg-foreground text-background" : "hover:bg-muted")}
              >
                {a.id}
              </Link>
            ))}
          </nav>
        ) : (
          <span className="font-mono text-xs">{analysis.id}</span>
        )}
        <span>
          {formatDateTime(analysis.generated_at)} · {analysis.counts.obligations} obligations against {analysis.internal_scope.length} internal
          document{analysis.internal_scope.length === 1 ? "" : "s"}
        </span>
        <span className="ml-auto">
          <MatchOwners analysisId={analysis.id} />
        </span>
      </div>

      {analysis.excluded.length ? (
        <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {analysis.excluded.length} document{analysis.excluded.length === 1 ? " was" : "s were"} left out because no text could be read:{" "}
          {analysis.excluded.map((e) => e.title || e.document_id).join(", ")}.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <span className="text-sm text-muted-foreground">{stat.label}</span>
            <span className={cn("mt-1 block font-heading text-2xl font-semibold tabular-nums", stat.value > 0 && stat.tone)}>{stat.value}</span>
            {stat.hint ? <span className="text-xs text-muted-foreground">{stat.hint}</span> : null}
          </div>
        ))}
      </div>

      <MatrixView analysis={analysis} rows={rows} people={org.data.people} effective={effective} initialOpen={openRow} />
    </>
  )
}
