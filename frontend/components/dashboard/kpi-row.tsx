import Link from "next/link"

import { DASHBOARD_STATE, DASHBOARD_STATE_ORDER, type Dashboard, type DashboardState } from "@/lib/domain"
import { formatNumber } from "@/lib/format"
import type { Region } from "@/lib/types"
import { cn } from "@/lib/utils"

import { Tag } from "./primitives"

const REGION_NAMES: Record<string, string> = {
  KSA: "Saudi Arabia",
  UAE: "UAE",
  INDIA: "India",
  SOUTH_AFRICA: "South Africa",
  OTHER: "Other",
}

function Kpi({
  label,
  value,
  hint,
  tone,
  href,
  active,
}: {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: string
  href?: string
  active?: boolean
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {tone ? <span className={cn("size-1.5 rounded-full", tone)} aria-hidden /> : null}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 font-heading text-xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</div> : null}
    </>
  )
  const base = "rounded-lg bg-card px-3 py-2.5 ring-1 ring-foreground/10"
  if (!href) return <div className={base}>{body}</div>
  return (
    <Link
      href={href}
      className={cn(
        base,
        "block transition-colors hover:bg-muted/40",
        active && "ring-2 ring-primary/60",
      )}
      aria-current={active ? "true" : undefined}
    >
      {body}
    </Link>
  )
}

/** KPI row: one tile per monitored region plus the four document states (R17/R18). */
export function KpiRow({ dashboard, activeRegion }: { dashboard: Dashboard; activeRegion?: string }) {
  const { counts, regions } = dashboard
  const regionOrder = regions.filter((region): region is Region => region !== "OTHER")

  return (
    <section aria-label="Regulatory KPIs" className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Developments by region
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {formatNumber(counts.sources)} publications · {formatNumber(counts.obligations)} obligations extracted
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {regionOrder.map((region) => (
          <Kpi
            key={region}
            label={<>{region}</>}
            value={formatNumber(counts.byRegion[region] ?? 0)}
            hint={REGION_NAMES[region] ?? region}
            href={`/?region=${region}#repository`}
            active={activeRegion === region}
          />
        ))}
      </div>

      <div className="mt-1 flex items-baseline justify-between">
        <h2 className="font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Document states
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {formatNumber(counts.changedClauses)} changed clauses · {formatNumber(counts.aiObligations)} AI-tagged
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {DASHBOARD_STATE_ORDER.map((state: DashboardState) => (
          <Kpi
            key={state}
            label={DASHBOARD_STATE[state].label}
            tone={DASHBOARD_STATE[state].tone}
            value={formatNumber(counts.byState[state])}
            hint={state === "unresolved" ? "no reliable prior found" : undefined}
            href={`/?state=${state}#repository`}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <Tag className="border-dashed">AI / BFSI focus</Tag>
        <span>
          Applicability is extracted per obligation (AI · banking · lending · insurance · payments). AI-tagged
          obligations are highlighted throughout the repository.
        </span>
      </div>
    </section>
  )
}
