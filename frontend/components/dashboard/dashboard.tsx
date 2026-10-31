import { CircleAlertIcon } from "lucide-react"

import {
  buildDashboard,
  DASHBOARD_STATE,
  describeMeta,
  filterRows,
  REGION_LABEL,
  type DashboardState,
  type Filters,
} from "@/lib/domain"
import { formatDate, formatDateTime } from "@/lib/format"
import type { RegulaState } from "@/lib/types"

import { AppHeader } from "./app-header"
import { FilterBar } from "./filter-bar"
import { QueueTabs } from "./queue-tabs"
import { RepositoryTable } from "./repository-table"
import { RunDiscovery } from "./run-discovery"
import { SyncScheduleControl } from "./sync-schedule"
import { UploadCircular } from "./upload-circular"

/** Region → country names for the page subtitle. */
function regionSummary(regions: string[]): string {
  const named = regions
    .filter((region) => region !== "OTHER")
    .map((region) => REGION_LABEL[region as keyof typeof REGION_LABEL] ?? region)
  if (regions.includes("OTHER")) named.push("Other")
  return named.join(", ")
}

/**
 * Dashboard: header with the two actions (upload, run monitoring), one quiet
 * monitoring line (R5), the four document states as queue tabs (R18), the
 * filter row (R6/R17) and the repository table. Every row opens the
 * publication (R19).
 */
export function Dashboard({
  state,
  filters,
  degraded,
  degradedReason,
  origin,
}: {
  state: RegulaState
  filters: Filters
  degraded: boolean
  degradedReason?: string
  origin: "api" | "fixture"
}) {
  const dashboard = buildDashboard(state)
  const rows = filterRows(dashboard.rows, filters)
  const { regions, monitor } = describeMeta(state.meta)
  const activeState = filters.state as DashboardState | undefined
  const stateLabel = activeState && activeState in DASHBOARD_STATE ? DASHBOARD_STATE[activeState].label : undefined

  return (
    <>
      <AppHeader origin={origin} degraded={degraded} />
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6">
        {degraded ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              The API is unreachable, so this is the saved offline copy.
              {degradedReason ? <span className="text-amber-800/80 dark:text-amber-200/70"> {degradedReason}</span> : null}
            </span>
          </div>
        ) : null}

        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">Regulatory changes</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {regionSummary(regions)} · updated {formatDate(state.meta.as_of)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <UploadCircular />
            <RunDiscovery />
          </div>
        </section>

        <div className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <SyncScheduleControl />
          {monitor.configured ? (
            <span>
              {monitor.configured_sources} sources · last checked {formatDateTime(monitor.last_run)}
            </span>
          ) : null}
        </div>

        <QueueTabs dashboard={dashboard} filters={filters} />

        <section id="repository" className="grid scroll-mt-20 gap-3">
          <FilterBar dashboard={dashboard} filters={filters} />
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            <RepositoryTable rows={rows} />
          </div>
          <p className="text-xs text-muted-foreground">
            Showing {rows.length} of {dashboard.counts.sources} publications
            {stateLabel ? <> in {stateLabel.toLowerCase()}</> : null}
          </p>
        </section>
      </main>
    </>
  )
}
