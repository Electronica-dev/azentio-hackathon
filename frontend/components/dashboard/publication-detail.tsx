import { ArrowLeftIcon, ChevronRightIcon, ExternalLinkIcon, GitCompareArrowsIcon, Link2OffIcon } from "lucide-react"
import Link from "next/link"

import {
  areaLabel,
  dashboardStateOf,
  DASHBOARD_STATE,
  effectiveLabel,
  isUnresolvedRelationship,
  REGION_LABEL,
  reviewStateLabel,
} from "@/lib/domain"
import type { SourceDetail } from "@/lib/domain"
import { formatDate } from "@/lib/format"
import type { Region, RegulaState } from "@/lib/types"
import { cn } from "@/lib/utils"

import { ClauseDiff } from "./clause-diff"
import { ObligationCard } from "./obligation-card"
import { ChangeClassBadge, Chip, EmptyState, SectionHeading } from "./primitives"

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

/** One callout explaining what this publication was compared against, if anything. */
function RelationshipCallout({ detail }: { detail: SourceDetail }) {
  const { row, prior } = detail
  const { relationship } = row
  const confidence = typeof relationship.confidence === "number" ? relationship.confidence : null

  if (isUnresolvedRelationship(row.source)) {
    return (
      <div className="flex gap-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50/70 p-4 text-sm dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10">
        <Link2OffIcon className="mt-0.5 size-4 shrink-0 text-fuchsia-700 dark:text-fuchsia-300" aria-hidden />
        <div className="grid gap-1">
          <p className="font-medium text-fuchsia-900 dark:text-fuchsia-200">No reliable earlier version found</p>
          <p className="text-fuchsia-900/80 dark:text-fuchsia-200/80">
            This needs a manual link before changes can be compared.
            {confidence !== null ? ` Best match was ${percent(confidence)}` : ""}
            {relationship.prior_source_id ? ` (${relationship.prior_source_id})` : ""}
            {confidence !== null ? "." : ""}
          </p>
          {relationship.rationale ? (
            <p className="text-xs text-fuchsia-900/70 dark:text-fuchsia-200/70">{relationship.rationale}</p>
          ) : null}
        </div>
      </div>
    )
  }

  const priorLabel = prior ? prior.short_title || prior.title : relationship.prior_ref
  if (!priorLabel) return null

  return (
    <div className="flex gap-3 rounded-xl border border-border bg-card p-4 text-sm shadow-xs">
      <GitCompareArrowsIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="grid gap-1">
        <p>
          Compared with{" "}
          {prior ? (
            <Link href={`/publications/${encodeURIComponent(prior.id)}`} className="font-medium text-primary hover:underline">
              {priorLabel}
            </Link>
          ) : (
            <span className="font-medium">{priorLabel}</span>
          )}
          {confidence !== null ? <span className="text-muted-foreground"> · {percent(confidence)} match</span> : null}
        </p>
        {relationship.rationale ? <p className="text-xs text-muted-foreground">{relationship.rationale}</p> : null}
      </div>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}

/**
 * Publication detail — "two clicks from dashboard to a clause quote" (R19):
 * dashboard row → this page → the obligation card carries the quote.
 */
export function PublicationDetail({ detail, state, highlight }: { detail: SourceDetail; state: RegulaState; highlight?: string }) {
  const { row, prior, citedReferences } = detail
  const { source } = row
  const dashboardState = DASHBOARD_STATE[dashboardStateOf(source)]
  const changedClauses = row.clauses.filter((clause) => clause.change_type !== "unchanged")
  const highlightObligation = highlight ? row.obligations.find((obligation) => obligation.id === highlight) : undefined
  const highlightClauseId = highlightObligation?.clause_id
  const visibleClauses =
    highlightClauseId && !changedClauses.some((clause) => clause.id === highlightClauseId)
      ? [...row.clauses.filter((clause) => clause.id === highlightClauseId), ...changedClauses]
      : changedClauses
  const country = row.region === "OTHER" ? "Other" : (REGION_LABEL[row.region as Region] ?? row.region)
  const days = source.days_left

  const sections = [
    { id: "changes", label: "What changed", count: visibleClauses.length },
    { id: "obligations", label: "Obligations", count: row.obligations.length },
    { id: "related", label: "Related", count: detail.related.length },
  ]

  return (
    <div className="grid gap-8">
      <div className="grid gap-4">
        <Link
          href="/#repository"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          All publications
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Chip chip={{ ...dashboardState, label: dashboardState.short }} />
          {row.changeClass ? <ChangeClassBadge value={row.changeClass} short /> : null}
        </div>
        <div>
          <h1 className="max-w-4xl font-heading text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            {source.title}
          </h1>
          {source.summary ? (
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted-foreground">{source.summary}</p>
          ) : null}
        </div>
        <nav aria-label="On this page" className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm shadow-xs hover:border-foreground/20"
            >
              {section.label}
              <span className="text-muted-foreground tabular-nums">{section.count}</span>
            </a>
          ))}
        </nav>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="grid min-w-0 gap-10">
          <section id="changes" className="grid scroll-mt-20 gap-4">
            <SectionHeading
              title="What changed"
              hint={
                prior
                  ? `${visibleClauses.length} of ${row.clauses.length} clauses differ from ${prior.ref}.`
                  : "No earlier version is linked, so clauses are shown as published."
              }
            />
            <RelationshipCallout detail={detail} />
            {visibleClauses.length === 0 ? (
              <EmptyState title="No clauses extracted yet" description="The document may still be queued for extraction." />
            ) : (
              visibleClauses.map((clause) => (
                <div key={clause.id} id={clause.id} className="scroll-mt-20">
                  <ClauseDiff
                    clause={clause}
                    priorLabel={prior?.ref}
                    priorHref={prior ? `/publications/${encodeURIComponent(prior.id)}#${clause.prior_clause_id ?? ""}` : undefined}
                    highlightQuote={highlightObligation?.clause_id === clause.id ? highlightObligation.quote : undefined}
                  />
                </div>
              ))
            )}
          </section>

          <section id="obligations" className="grid scroll-mt-20 gap-4">
            <SectionHeading
              title="Obligations"
              hint="What this publication requires, each with its clause reference and the exact source text."
            />
            {row.obligations.length ? (
              row.obligations.map((obligation, index) => (
                <ObligationCard
                  key={obligation.id}
                  obligation={obligation}
                  index={index}
                  anchor={`obl-${obligation.id}`}
                  sources={state.sources}
                />
              ))
            ) : (
              <EmptyState
                title="Awaiting extraction"
                description="This publication has been ingested but its obligations have not been extracted yet."
              />
            )}
          </section>

          <section id="related" className="grid scroll-mt-20 gap-4">
            <SectionHeading title="Related publications" hint={`Other publications from ${country}.`} />
            {detail.related.length ? (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
                {detail.related.map((related) => {
                  const relatedState = DASHBOARD_STATE[dashboardStateOf(related)]
                  return (
                    <li key={related.id}>
                      <Link
                        href={`/publications/${encodeURIComponent(related.id)}`}
                        className="group flex items-center gap-4 px-4 py-3 hover:bg-muted/40"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium group-hover:text-primary">{related.title}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {related.authority ?? related.regulator} · {formatDate(related.published)}
                          </span>
                        </span>
                        <Chip chip={{ ...relatedState, label: relatedState.short }} className="hidden sm:inline-flex" />
                        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/50 group-hover:text-foreground" aria-hidden />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState title="No other publications from this country" />
            )}
          </section>
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-20">
          <div className="rounded-xl border border-border bg-card px-4 py-2 text-sm shadow-xs">
            <dl className="divide-y divide-border">
              <Fact label="Regulator">{row.authority}</Fact>
              <Fact label="Country">{country}</Fact>
              <Fact label="Reference">
                <span className="font-mono text-xs break-all">{source.ref}</span>
              </Fact>
              <Fact label="Type">{row.docType}</Fact>
              <Fact label="Published">{formatDate(source.published)}</Fact>
              <Fact label="Effective">
                <span className={cn(!source.effective && "font-normal text-muted-foreground italic")}>
                  {effectiveLabel(source)}
                </span>
              </Fact>
              <Fact label="Deadline">
                {typeof days === "number" ? (
                  <span className={cn(days < 0 && "text-destructive", days >= 0 && days < 45 && "text-amber-700 dark:text-amber-300")}>
                    {days < 0 ? `${Math.abs(days)} days overdue` : `${days} days left`}
                  </span>
                ) : (
                  <span className="font-normal text-muted-foreground">None stated</span>
                )}
              </Fact>
              <Fact label="Business areas">
                {row.areas.length ? row.areas.map(areaLabel).join(", ") : <span className="font-normal text-muted-foreground">Not extracted</span>}
              </Fact>
              <Fact label="Review">{reviewStateLabel(source)}</Fact>
            </dl>
            {source.url ? (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="my-2 inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                Open source document <ExternalLinkIcon className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </div>

          {citedReferences.length ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm shadow-xs">
              <h2 className="font-medium">Cited regulations</h2>
              <ul className="mt-2 grid gap-2">
                {citedReferences.map((reference) => (
                  <li key={reference.value}>
                    {reference.source ? (
                      <Link
                        href={`/publications/${encodeURIComponent(reference.source.id)}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {reference.source.short_title}
                      </Link>
                    ) : (
                      <span>{reference.value}</span>
                    )}
                    <span className="block font-mono text-xs text-muted-foreground">
                      {reference.source ? reference.value : "not in repository"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
