import Link from "next/link"

import { DASHBOARD_STATE, DASHBOARD_STATE_ORDER, type Dashboard, type DashboardState, type Filters } from "@/lib/domain"
import { cn } from "@/lib/utils"

const HINT: Record<DashboardState | "all", string> = {
  all: "Everything in the repository",
  new_publication: "No earlier version on file",
  amendment: "Changes vs. an earlier version",
  awaiting_review: "Ready for a human check",
  unresolved: "Needs a manual link",
}

/**
 * The four document states (R18) as queue tabs. Each card is a count and a
 * filter at once; the current region filter carries over.
 */
export function QueueTabs({ dashboard, filters }: { dashboard: Dashboard; filters: Filters }) {
  const region = filters.region ? `region=${filters.region}` : ""
  const tabs: { key: DashboardState | "all"; label: string; count: number; href: string }[] = [
    { key: "all", label: "All", count: dashboard.counts.sources, href: region ? `/?${region}#repository` : "/#repository" },
    ...DASHBOARD_STATE_ORDER.map((key) => ({
      key,
      label: DASHBOARD_STATE[key].short,
      count: dashboard.counts.byState[key],
      href: `/?state=${key}${region ? `&${region}` : ""}#repository`,
    })),
  ]
  const current = filters.state ?? "all"

  return (
    <nav aria-label="Publication queues" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tabs.map((tab) => {
        const active = current === tab.key
        const attention = tab.key === "unresolved" && tab.count > 0
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group rounded-xl border bg-card px-4 py-3 shadow-xs transition-colors",
              active ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/20",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {tab.key !== "all" ? (
                <span className={cn("size-2 rounded-full", DASHBOARD_STATE[tab.key].tone)} aria-hidden />
              ) : null}
              {tab.label}
            </span>
            <span
              className={cn(
                "mt-1 block font-heading text-2xl font-semibold tabular-nums",
                attention && "text-fuchsia-700 dark:text-fuchsia-300",
              )}
            >
              {tab.count}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{HINT[tab.key]}</span>
          </Link>
        )
      })}
    </nav>
  )
}
