import { FileSearchIcon, Link2OffIcon, RadioTowerIcon, UploadIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  buildDashboard,
  DASHBOARD_STATE,
  DASHBOARD_STATE_ORDER,
  describeMeta,
  filterRows,
  REGION_LABEL,
  type DashboardState,
  type Filters,
} from "@/lib/domain"
import { formatDate, formatDateTime, plural } from "@/lib/format"
import type { RegulaState } from "@/lib/types"
import { cn } from "@/lib/utils"

import { FilterBar } from "./filter-bar"
import { KpiRow } from "./kpi-row"
import { SectionHeading } from "./primitives"
import { RegionMatrix } from "./region-matrix"
import { ChangeClassLegend, RepositoryTable } from "./repository-table"

const STATE_ICON: Record<DashboardState, React.ComponentType<{ className?: string }>> = {
  new_publication: FileSearchIcon,
  amendment: RadioTowerIcon,
  awaiting_review: FileSearchIcon,
  unresolved: Link2OffIcon,
}

/** Region → country name for the header summary. */
function regionSummary(regions: string[]): string {
  const named = regions
    .filter((region) => region !== "OTHER")
    .map((region) => REGION_LABEL[region as keyof typeof REGION_LABEL] ?? region)
  if (regions.includes("OTHER")) named.push("Other")
  return named.join(" · ")
}

const SORT_LABEL: Record<string, string> = {
  published: "publication date",
  effective: "effective date",
  obligations: "obligation count",
  title: "title",
}

/**
 * Monitor strip (R4/R5 preview). The contract's v1.1 `meta.monitor` block is
 * optional: when it is absent we say so instead of inventing a last/next run.
 * The actions are disabled until `POST /api/monitor/run` and
 * `POST /api/sources/upload` exist — a button that silently does nothing is
 * worse than one that explains itself.
 */
function MonitorStrip({ state }: { state: RegulaState }) {
  const { monitor } = describeMeta(state.meta)
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px]">
      <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
        <RadioTowerIcon className="size-3.5 text-primary" aria-hidden />
        Source monitoring
      </span>
      <Separator orientation="vertical" className="h-4" />
      {monitor.configured ? (
        <>
          <span>
            <b className="font-semibold text-foreground">{monitor.configured_sources}</b> configured sources
          </span>
          <span aria-hidden>·</span>
          <span>every {monitor.frequency_hours}h</span>
          <span aria-hidden>·</span>
          <span>
            last run <b className="font-semibold text-foreground">{formatDateTime(monitor.last_run)}</b>
          </span>
          <span aria-hidden>·</span>
          <span>
            next run <b className="font-semibold text-foreground">{formatDateTime(monitor.next_run)}</b>
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">
          Monitor metadata not reported by this payload. The source registry, frequency and last/next run arrive with
          contract v1.1 <code className="font-mono">meta.monitor</code>.
        </span>
      )}
      <span className="ml-auto inline-flex items-center gap-1.5">
        <Button type="button" size="sm" disabled title="Lands with POST /api/monitor/run">
          <RadioTowerIcon aria-hidden />
          Run monitoring
        </Button>
        <Button type="button" variant="outline" size="sm" disabled title="Lands with POST /api/sources/upload">
          <UploadIcon aria-hidden />
          Upload circular
        </Button>
      </span>
    </div>
  )
}

function QueueTabs({ dashboard, filters }: { dashboard: ReturnType<typeof buildDashboard>; filters: Filters }) {
  const tabs: { key: DashboardState | "all"; label: string; count: number; href: string }[] = [
    {
      key: "all",
      label: "All publications",
      count: dashboard.counts.sources,
      href: filters.region ? `/?region=${filters.region}#repository` : "/#repository",
    },
    ...DASHBOARD_STATE_ORDER.map((key) => ({
      key,
      label: DASHBOARD_STATE[key].label,
      count: dashboard.counts.byState[key],
      href: `/?state=${key}${filters.region ? `&region=${filters.region}` : ""}#repository`,
    })),
  ]

  return (
    <div role="tablist" aria-label="Publication queues" className="flex flex-wrap items-center gap-1">
      {tabs.map((tab) => {
        const active = (filters.state ?? "all") === tab.key
        const tone = tab.key === "all" ? "bg-foreground" : DASHBOARD_STATE[tab.key].tone
        const Icon = tab.key === "all" ? null : STATE_ICON[tab.key]
        return (
          <Link
            key={tab.key}
            role="tab"
            aria-selected={active}
            href={tab.href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
              active
                ? "border-foreground/20 bg-card text-foreground shadow-sm"
                : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
            {tab.key !== "all" ? <span className={cn("size-1.5 rounded-full", tone)} aria-hidden /> : null}
            {tab.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] tabular-nums",
                active ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
              )}
            >
              {tab.count}
            </span>
          </Link>
        )
      })}
    </div>
  )
}

function UnresolvedBanner({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <Link
      href="/?state=unresolved#repository"
      className="flex items-start gap-2 rounded-lg border border-fuchsia-200 bg-fuchsia-50/60 px-3 py-2 text-xs hover:bg-fuchsia-50 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10"
    >
      <Link2OffIcon className="mt-0.5 size-3.5 shrink-0 text-fuchsia-700 dark:text-fuchsia-300" aria-hidden />
      <span className="text-fuchsia-900/90 dark:text-fuchsia-200/90">
        <b className="font-semibold">{plural(count, "publication")}</b> could not be reliably linked to an earlier
        regulation. These are queued for manual review and shown without a side-by-side diff.
      </span>
    </Link>
  )
}

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
  const { regions } = describeMeta(state.meta)
  const activeState = filters.state as DashboardState | undefined
  const stateLabel = activeState && activeState in DASHBOARD_STATE ? DASHBOARD_STATE[activeState].label : undefined

  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-4 px-4 py-4">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <RadioTowerIcon className="size-3.5" aria-hidden />
              {state.meta.product} · {state.meta.tagline}
            </div>
            <h1 className="mt-0.5 font-heading text-2xl font-semibold tracking-tight">
              Regulatory Intelligence Dashboard
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {regionSummary(regions)} · AI &amp; BFSI applicability tracked per obligation · as of{" "}
              {formatDate(state.meta.as_of)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
                degraded
                  ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
              )}
            >
              <span className={cn("size-1.5 rounded-full", degraded ? "bg-amber-500" : "bg-emerald-500")} aria-hidden />
              {origin === "api" ? "Live API" : "Offline fixture"}
            </span>
            <span className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-muted-foreground">
              {state.meta.version}
            </span>
            <span className="rounded-full border border-border bg-card px-2 py-0.5 text-muted-foreground">
              mode: {state.meta.mode}
            </span>
          </div>
        </div>
        {degraded ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            <b className="font-semibold">API unreachable — showing the committed offline fixture.</b>{" "}
            {degradedReason ? <span>{degradedReason}</span> : null}
          </div>
        ) : null}
        <MonitorStrip state={state} />
      </header>

      <KpiRow dashboard={dashboard} activeRegion={filters.region} />
      <UnresolvedBanner count={dashboard.counts.byState.unresolved} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,320px)] xl:items-start">
        <section id="repository" className="grid scroll-mt-4 gap-3">
          <SectionHeading
            title="Regulatory repository"
            hint="Every discovered publication, filterable by country, regulator, date, business area and change classification."
          />
          <QueueTabs dashboard={dashboard} filters={filters} />
          <FilterBar dashboard={dashboard} filters={filters} stateLabel={stateLabel} />
          <div className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="text-[11px] text-muted-foreground">
                <b className="font-semibold text-foreground">{rows.length}</b> of {dashboard.counts.sources}{" "}
                publications · sorted by {SORT_LABEL[filters.sort ?? "published"] ?? "publication date"}
              </span>
              <span className="text-[10px] text-muted-foreground">Click a row to open the publication</span>
            </div>
            <RepositoryTable rows={rows} />
          </div>
          <ChangeClassLegend classes={dashboard.changeClasses} />
        </section>

        <aside className="grid gap-3">
          <div className="rounded-lg bg-card px-3 py-2.5 ring-1 ring-foreground/10">
            <SectionHeading title="By region × classification" hint="Where this cycle's changes sit" />
            <div className="mt-2">
              <RegionMatrix dashboard={dashboard} />
            </div>
          </div>
          <div className="rounded-lg bg-card px-3 py-2.5 ring-1 ring-foreground/10">
            <SectionHeading title="How to read the states" />
            <dl className="mt-2 grid gap-2 text-[11px]">
              {DASHBOARD_STATE_ORDER.map((key) => (
                <div key={key} className="flex gap-2">
                  <span className={cn("mt-1 size-2 shrink-0 rounded-full", DASHBOARD_STATE[key].tone)} aria-hidden />
                  <div>
                    <dt className="font-semibold">{DASHBOARD_STATE[key].label}</dt>
                    <dd className="text-muted-foreground">
                      {key === "new_publication"
                        ? "Newly published, no earlier regulation on file."
                        : key === "amendment"
                          ? "A prior regulation was found and the changes were classified."
                          : key === "awaiting_review"
                            ? "Extraction finished, waiting for a human to accept it."
                            : "No reliable prior regulation — needs manual linkage."}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
            <p className="mt-2 border-t border-border pt-2 text-[10px] leading-relaxed text-muted-foreground">
              States cascade: a publication still awaiting review is filed under that queue even when a prior
              regulation was found. Filter by change classification to isolate amendments awaiting review.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
