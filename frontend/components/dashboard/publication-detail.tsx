import { ArrowLeftIcon, ExternalLinkIcon, GitCompareArrowsIcon, Link2OffIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  areaLabel,
  dashboardStateOf,
  DASHBOARD_STATE,
  effectiveLabel,
  isUnresolvedRelationship,
  reviewStateChip,
  reviewStateLabel,
  titleCase,
} from "@/lib/domain"
import type { SourceDetail } from "@/lib/domain"
import { formatDate, formatDateTime, plural } from "@/lib/format"
import type { RegulaState } from "@/lib/types"
import { cn } from "@/lib/utils"

import { ClauseDiff } from "./clause-diff"
import { ObligationCard } from "./obligation-card"
import { ChangeClassBadge, Chip, EmptyState, RegionBadge, SectionHeading, Tag } from "./primitives"

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-1.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-xs font-medium">{value}</dd>
      {hint ? <dd className="text-[10px] text-muted-foreground">{hint}</dd> : null}
    </div>
  )
}

function RelationshipPanel({ detail }: { detail: SourceDetail }) {
  const { row, prior } = detail
  const { relationship } = row
  const unresolved = isUnresolvedRelationship(row.source)
  const confidence = typeof relationship.confidence === "number" ? relationship.confidence : null

  if (unresolved) {
    return (
      <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/60 px-3 py-2.5 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10">
        <div className="flex items-center gap-1.5 font-heading text-xs font-semibold text-fuchsia-800 dark:text-fuchsia-300">
          <Link2OffIcon className="size-3.5" aria-hidden />
          No reliable prior regulation found
        </div>
        <p className="mt-1 text-xs leading-relaxed text-fuchsia-900/80 dark:text-fuchsia-200/80">
          The system could not establish a reliable relationship with earlier regulations, so a side-by-side
          comparison is not shown. This publication is queued for manual review.
        </p>
        <dl className="mt-2 grid gap-1 text-[11px]">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-muted-foreground">Status</dt>
            <dd className="font-medium">{relationship.status}</dd>
          </div>
          {confidence !== null ? (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">Best match</dt>
              <dd className="font-medium">
                {Math.round(confidence * 100)}% confidence
                {confidence < 0.45 ? " — below the 45% threshold" : ""}
              </dd>
            </div>
          ) : null}
          {relationship.prior_source_id ? (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">Candidate</dt>
              <dd className="font-medium">{relationship.prior_source_id}</dd>
            </div>
          ) : null}
          {relationship.rationale ? (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">Rationale</dt>
              <dd>{relationship.rationale}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    )
  }

  if (prior) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5 dark:border-blue-500/30 dark:bg-blue-500/10">
        <div className="flex items-center gap-1.5 font-heading text-xs font-semibold text-blue-800 dark:text-blue-300">
          <GitCompareArrowsIcon className="size-3.5" aria-hidden />
          Compared against a prior regulation
        </div>
        <p className="mt-1 text-xs leading-relaxed text-blue-900/80 dark:text-blue-200/80">
          {relationship.rationale ?? "A prior regulation was identified for this publication."}
        </p>
        <dl className="mt-2 grid gap-1 text-[11px]">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-muted-foreground">Status</dt>
            <dd className="font-medium">{relationship.status}</dd>
          </div>
          {confidence !== null ? (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">Confidence</dt>
              <dd className="font-medium tabular-nums">{Math.round(confidence * 100)}%</dd>
            </div>
          ) : null}
        </dl>
        <Link
          href={`/publications/${encodeURIComponent(prior.id)}`}
          className="mt-2 inline-flex items-center gap-1 rounded-md border border-blue-300/70 bg-card px-2 py-1 text-[11px] font-medium text-blue-800 hover:underline dark:border-blue-500/40 dark:text-blue-300"
        >
          Prior: {prior.short_title || prior.title}
          <ExternalLinkIcon className="size-3" aria-hidden />
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
      <div className="font-heading text-xs font-semibold">No prior regulation on file</div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {relationship.rationale ??
          "This publication was retrieved without an earlier version in the repository, so there is nothing to diff. It is treated as a standalone publication."}
      </p>
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
  const dashboardState = dashboardStateOf(source)
  const aiObligations = row.obligations.filter((obligation) => (obligation.applicability ?? []).includes("ai"))
  const changedClauses = row.clauses.filter((clause) => clause.change_type !== "unchanged")
  const highlightObligation = highlight ? row.obligations.find((obligation) => obligation.id === highlight) : undefined
  const highlightClauseId = highlightObligation?.clause_id
  const visibleClauses =
    highlightClauseId && !changedClauses.some((clause) => clause.id === highlightClauseId)
      ? [...row.clauses.filter((clause) => clause.id === highlightClauseId), ...changedClauses]
      : changedClauses

  return (
    <div className="grid gap-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/#repository" />}
          className="-ml-1.5 mb-2 h-7 text-muted-foreground"
        >
          <ArrowLeftIcon aria-hidden />
          Back to dashboard
        </Button>

        <div className="flex flex-wrap items-center gap-1.5">
          <RegionBadge region={row.region} />
          <Chip
            chip={{ label: row.authority, short: row.authority, className: "border-border bg-card text-foreground" }}
          />
          <Tag className="font-mono">{source.ref}</Tag>
          <Tag>{row.docType}</Tag>
          <Chip chip={DASHBOARD_STATE[dashboardState]} />
          {row.changeClass ? <ChangeClassBadge value={row.changeClass} /> : null}
        </div>

        <h1 className="mt-2 font-heading text-xl font-semibold leading-tight tracking-tight">{source.title}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">{source.summary}</p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">Authority</span> {row.authority}
            {source.jurisdiction ? ` · ${source.jurisdiction}` : null}
          </span>
          <span>
            <span className="font-semibold text-foreground">Published</span> {formatDate(source.published)}
          </span>
          <span>
            <span className="font-semibold text-foreground">Effective</span>{" "}
            <span className={cn(!source.effective && "italic")}>{effectiveLabel(source)}</span>
          </span>
          {source.first_seen ? (
            <span>
              <span className="font-semibold text-foreground">First seen</span> {formatDateTime(source.first_seen)}
            </span>
          ) : null}
          {source.processed_at ? (
            <span>
              <span className="font-semibold text-foreground">Processed</span> {formatDateTime(source.processed_at)}
            </span>
          ) : null}
          <span>
            <span className="font-semibold text-foreground">Review</span> {reviewStateLabel(source)}
          </span>
          {source.url ? (
            <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
              Source document <ExternalLinkIcon className="size-3" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid gap-2">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Obligations" value={row.obligations.length} hint={`${aiObligations.length} AI-tagged`} />
            <Stat label="Changed clauses" value={row.changedClauses.length} hint={`of ${row.clauses.length} total`} />
            <Stat
              label="Business areas"
              value={row.areas.length ? row.areas.map(areaLabel).join(" · ") : "not extracted"}
            />
            <Stat label="Deadline" value={typeof source.days_left === "number" ? `${source.days_left} days` : "—"} />
          </dl>
          <RelationshipPanel detail={detail} />
        </div>

        <div className="grid content-start gap-2 rounded-lg bg-card px-3 py-2.5 ring-1 ring-foreground/10">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Review state</div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Chip chip={reviewStateChip(source)} />
              <Tag>{titleCase(String(source.status ?? ""))}</Tag>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Human review records an audit event against this publication. This dashboard is read-only; the review
              action lands with the monitoring workflow.
            </p>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Source references ({citedReferences.length})
            </div>
            {citedReferences.length ? (
              <ul className="mt-1 grid gap-1">
                {citedReferences.map((reference) => (
                  <li key={reference.value} className="flex items-center gap-1 text-[11px]">
                    <Tag className="font-mono">{reference.value}</Tag>
                    {reference.source ? (
                      <Link
                        href={`/publications/${encodeURIComponent(reference.source.id)}`}
                        className="truncate font-medium text-primary hover:underline"
                      >
                        {reference.source.short_title}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">not in repository</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                No earlier regulations were cited in the extracted obligations.
              </p>
            )}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tags</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {source.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          </div>
        </div>
      </div>

      <section className="grid gap-2" aria-labelledby="clauses-heading">
        <SectionHeading
          title={<span id="clauses-heading">Clause comparison</span>}
          hint={
            prior
              ? `Previous text from ${prior.ref} vs this publication. ${plural(changedClauses.length, "clause")} changed.`
              : "No prior regulation is linked, so each clause is shown as published without a comparison."
          }
        />
        {changedClauses.length === 0 ? (
          <EmptyState title="No clauses were extracted for this publication" description="The document may still be queued for extraction." />
        ) : (
          <div className="grid gap-2">
            {visibleClauses.map((clause) => (
              <div key={clause.id} id={clause.id} className="scroll-mt-20">
                <ClauseDiff
                  clause={clause}
                  priorLabel={prior?.ref}
                  priorHref={prior ? `/publications/${encodeURIComponent(prior.id)}#${clause.prior_clause_id ?? ""}` : undefined}
                  highlightQuote={highlightObligation?.clause_id === clause.id ? highlightObligation.quote : undefined}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-2" aria-labelledby="obligations-heading">
        <SectionHeading
          title={<span id="obligations-heading">Extracted obligations</span>}
          hint={
            row.obligations.length
              ? "Structured requirements with clause reference, verbatim quote, applicability, deadline and confidence."
              : "No obligations have been extracted for this publication yet."
          }
        />
        {row.obligations.length ? (
          <div className="grid gap-2">
            {row.obligations.map((obligation, index) => (
              <ObligationCard
                key={obligation.id}
                obligation={obligation}
                index={index}
                anchor={`obl-${obligation.id}`}
                sources={state.sources}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Awaiting extraction"
            description="This publication has been ingested but its obligations have not been extracted yet. Run the analysis to populate clause references and applicability."
          />
        )}
      </section>

      <section className="grid gap-2">
        <SectionHeading title="Related publications" hint={`Other ${row.region === "OTHER" ? "" : row.region} publications in the repository`} />
        {detail.related.length ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-1">Publication</TableHead>
                <TableHead>Regulator</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead className="pr-1">State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.related.map((related) => (
                <TableRow key={related.id}>
                  <TableCell className="whitespace-normal pl-1">
                    <Link href={`/publications/${encodeURIComponent(related.id)}`} className="font-medium hover:text-primary hover:underline">
                      {related.title}
                    </Link>
                    <div className="font-mono text-[10px] text-muted-foreground">{related.ref}</div>
                  </TableCell>
                  <TableCell>{related.authority ?? related.regulator}</TableCell>
                  <TableCell className="tabular-nums">{formatDate(related.published)}</TableCell>
                  <TableCell>{related.change_class ? <ChangeClassBadge value={related.change_class} /> : <span className="text-[10px] italic text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="pr-1">
                    <Chip chip={DASHBOARD_STATE[dashboardStateOf(related)]} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState title="No other publications in this region" />
        )}
      </section>
    </div>
  )
}
