import { ArrowRightIcon, CircleAlertIcon, FileWarningIcon } from "lucide-react"
import Link from "next/link"

import { formatDate } from "@/lib/format"
import type { Overview, ScoreComponent } from "@/lib/org"
import { cn } from "@/lib/utils"

const GRADE = {
  good: { label: "Good", text: "text-emerald-700 dark:text-emerald-300", stroke: "stroke-emerald-500", bar: "bg-emerald-500" },
  fair: { label: "Needs work", text: "text-amber-700 dark:text-amber-300", stroke: "stroke-amber-500", bar: "bg-amber-500" },
  at_risk: { label: "At risk", text: "text-rose-700 dark:text-rose-300", stroke: "stroke-rose-500", bar: "bg-rose-500" },
} as const

function gradeOf(score: number): keyof typeof GRADE {
  return score >= 80 ? "good" : score >= 60 ? "fair" : "at_risk"
}

function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-5 shadow-xs", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-heading font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      {children}
      <ArrowRightIcon className="size-3.5" aria-hidden />
    </Link>
  )
}

function ScoreRing({ score }: { score: number }) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const grade = GRADE[gradeOf(score)]
  return (
    <div className="relative size-36 shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={radius} className="fill-none stroke-muted" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          className={cn("fill-none", grade.stroke)}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading text-4xl font-semibold tabular-nums">{score}</span>
        <span className={cn("text-sm font-medium", grade.text)}>{grade.label}</span>
      </div>
    </div>
  )
}

function ScoreRow({ component }: { component: ScoreComponent }) {
  const scored = component.score !== null
  return (
    <li className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{component.label}</span>
        <span className="tabular-nums text-muted-foreground">{scored ? `${component.score}%` : "Not scored"}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        {scored ? (
          <div className={cn("h-full rounded-full", GRADE[gradeOf(component.score!)].bar)} style={{ width: `${component.score}%` }} />
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{component.detail}</p>
    </li>
  )
}

function Stat({ label, value, hint, href, alert }: { label: string; value: number; hint: string; href: string; alert?: boolean }) {
  return (
    <Link href={href} className="group rounded-xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-foreground/20">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("mt-1 block font-heading text-3xl font-semibold tabular-nums", alert && value > 0 && "text-rose-700 dark:text-rose-300")}>
        {value}
      </span>
      <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
        {hint}
        <ArrowRightIcon className="size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </span>
    </Link>
  )
}

/**
 * Home: one compliance score with its breakdown, the headline counts, and the
 * short lists someone should act on first. Every number links to where it
 * comes from.
 */
export function Home({ overview }: { overview: Overview }) {
  const { totals } = overview
  const maxOpen = Math.max(1, ...overview.open_tasks_by_team.map((team) => team.open))

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel title="Compliance score">
          {overview.score === null ? (
            <p className="text-sm text-muted-foreground">Not enough data to score yet. Add documents and assets to get started.</p>
          ) : (
            <div className="grid gap-6">
              <div className="flex items-center gap-5">
                <ScoreRing score={overview.score} />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  A weighted average of the checks below. Checks without data yet are left out rather than counted as zero.
                </p>
              </div>
              <ul className="grid gap-4">
                {overview.components.map((component) => (
                  <ScoreRow key={component.key} component={component} />
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <div className="grid content-start gap-6">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Open regulatory changes" value={totals.open_changes} hint={`of ${totals.publications} publications`} href="/regulatory" />
            <Stat label="Critical gaps" value={totals.critical_impacts} hint="not yet approved" href="/regulatory" alert />
            <Stat label="Open change tasks" value={totals.open_tasks} hint="across all departments" href="/regulatory" />
            <Stat
              label="Internal records"
              value={totals.documents + totals.assets}
              hint={`${totals.documents} documents · ${totals.assets} assets · ${totals.people} people`}
              href="/organisation"
            />
          </div>

          <Panel title="Needs attention" action={<PanelLink href="/regulatory">All changes</PanelLink>}>
            {overview.attention.length ? (
              <ul className="divide-y divide-border">
                {overview.attention.map((item) => (
                  <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                    <Link href={`/publications/${encodeURIComponent(item.source_id)}`} className="group flex gap-3">
                      <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium group-hover:text-primary">{item.asset}</span>
                        <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{item.gap}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {item.ref} · {item.owner ? `${item.owner}, ` : ""}{item.team}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No critical gaps open. Nice.</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Panel title="Upcoming deadlines">
          {overview.deadlines.length ? (
            <ul className="grid gap-3">
              {overview.deadlines.map((deadline) => (
                <li key={deadline.source_id}>
                  <Link href={`/publications/${encodeURIComponent(deadline.source_id)}`} className="group flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium group-hover:text-primary">{deadline.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[deadline.authority, formatDate(deadline.effective)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-sm tabular-nums",
                        deadline.days_left < 0 ? "font-medium text-destructive" : deadline.days_left < 45 ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                      )}
                    >
                      {deadline.days_left < 0 ? `${Math.abs(deadline.days_left)}d late` : `${deadline.days_left}d`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No dated obligations.</p>
          )}
        </Panel>

        <Panel title="Open work by department">
          {overview.open_tasks_by_team.length ? (
            <ul className="grid gap-3">
              {overview.open_tasks_by_team.slice(0, 6).map((team) => (
                <li key={team.team} className="grid gap-1">
                  <div className="flex justify-between text-sm">
                    <span>{team.team}</span>
                    <span className="tabular-nums text-muted-foreground">{team.open}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${(team.open / maxOpen) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No open tasks.</p>
          )}
        </Panel>

        <Panel title="Missing documents" action={<PanelLink href="/organisation">Upload</PanelLink>}>
          {overview.missing_categories.length ? (
            <ul className="grid gap-2.5">
              {overview.missing_categories.map((category) => (
                <li key={category.value} className="flex items-center gap-2 text-sm">
                  <FileWarningIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {category.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Every document type has at least one file on record.</p>
          )}
        </Panel>
      </div>
    </div>
  )
}
