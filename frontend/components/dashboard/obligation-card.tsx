import { ExternalLinkIcon, QuoteIcon } from "lucide-react"
import Link from "next/link"

import { applicabilityLabel } from "@/lib/domain"
import type { Obligation, Source } from "@/lib/types"
import { cn } from "@/lib/utils"

import { ChangeClassBadge, Chip, Tag } from "./primitives"

const AI_TONE =
  "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"

function Confidence({ value }: { value: number }) {
  const pct = Math.round((Number.isFinite(value) ? value : 0) * 100)
  const tone = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-rose-500"
  return (
    <span className="inline-flex items-center gap-1" title={`Extraction confidence ${pct}%`}>
      <span className="h-1 w-8 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full", tone)} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums text-[10px] text-muted-foreground">{pct}%</span>
    </span>
  )
}

/**
 * One extracted obligation as a structured card — never a free-text summary.
 * Always shows the clause/section reference and the verbatim quote (R8), plus
 * applicability, deadline, kind, modality and confidence.
 */
export function ObligationCard({
  obligation,
  index,
  anchor,
  sources,
}: {
  obligation: Obligation
  index: number
  anchor?: string
  sources: Source[]
}) {
  const applicability = obligation.applicability ?? []
  const appliesTo = obligation.applies_to ?? []
  const references = obligation.references ?? []
  const params = Object.entries(obligation.params ?? {})
  const quote = obligation.quote?.trim()

  return (
    <article id={anchor} className="scroll-mt-20 rounded-lg bg-card ring-1 ring-foreground/10">
      <header className="flex flex-wrap items-start gap-2 border-b border-border px-3 py-2">
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm bg-muted font-mono text-[10px] font-semibold text-muted-foreground">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-snug">{obligation.subject}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
            <a
              href={`?highlight=${encodeURIComponent(obligation.id)}#${obligation.clause_id}`}
              className="font-semibold text-primary hover:underline"
              title="Highlight this quote in the source clause"
            >
              {obligation.section_ref}
            </a>
            <span aria-hidden>·</span>
            <span>{obligation.clause_id}</span>
            {obligation.clause_num ? (
              <>
                <span aria-hidden>·</span>
                <span>clause {obligation.clause_num}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <ChangeClassBadge value={obligation.change_class ?? obligation.change_type} />
          <Chip
            chip={{
              label: obligation.kind || "requirement",
              short: obligation.kind,
              className: "border-border bg-card text-foreground",
            }}
            className="font-mono"
          />
          {obligation.modality ? (
            <Tag className={obligation.modality === "prohibited" ? "border-rose-200 text-rose-700 dark:border-rose-500/30 dark:text-rose-300" : undefined}>
              {obligation.modality}
            </Tag>
          ) : null}
        </div>
      </header>

      <div className="grid gap-2 px-3 py-2">
        <p className="text-xs leading-relaxed">{obligation.statement}</p>

        {quote ? (
          <blockquote className="rounded-md border-l-2 border-primary/60 bg-muted/40 px-2.5 py-1.5">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <QuoteIcon className="size-3" aria-hidden />
              Verbatim source text · {obligation.section_ref}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed italic">“{quote}”</p>
          </blockquote>
        ) : (
          <p className="rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground">
            No verbatim quote was captured for this obligation — treat the statement as unverified.
          </p>
        )}

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-3">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Deadline</dt>
            <dd className="font-medium">{obligation.deadline || "not stated"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Threshold</dt>
            <dd className="font-medium">{obligation.threshold || "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Confidence</dt>
            <dd>
              <Confidence value={obligation.confidence} />
              {obligation.enrichment ? (
                <span className="ml-1 text-[10px] text-muted-foreground">· {obligation.enrichment}</span>
              ) : null}
            </dd>
          </div>
        </dl>

        {applicability.length || appliesTo.length ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Applies to</span>
            {applicability.map((area) => (
              <Tag key={`area-${area}`} className={area === "ai" ? AI_TONE : "border-primary/30 bg-primary/5 text-primary dark:bg-primary/15"}>
                {applicabilityLabel(area)}
              </Tag>
            ))}
            {appliesTo.map((unit) => (
              <Tag key={`unit-${unit}`}>{unit}</Tag>
            ))}
          </div>
        ) : null}

        {params.length ? (
          <div className="flex flex-wrap items-center gap-1 font-mono text-[10px]">
            <span className="font-sans font-semibold uppercase tracking-wide text-muted-foreground">Params</span>
            {params.map(([key, value]) => (
              <Tag key={key} className="font-mono">
                {key}: <span className="font-semibold text-foreground">{String(value)}</span>
              </Tag>
            ))}
          </div>
        ) : null}

        {references.length ? (
          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            <span className="font-semibold uppercase tracking-wide text-muted-foreground">Cites</span>
            {references.map((reference) => {
              const match = sources.find((source) => source.ref && reference.includes(source.ref))
              return match ? (
                <Link
                  key={reference}
                  href={`/publications/${encodeURIComponent(match.id)}`}
                  className="inline-flex items-center gap-0.5 rounded-sm border border-primary/40 bg-primary/5 px-1.5 py-px font-mono text-primary hover:underline"
                >
                  {reference}
                  <ExternalLinkIcon className="size-2.5" aria-hidden />
                </Link>
              ) : (
                <Tag key={reference} className="font-mono">
                  {reference}
                </Tag>
              )
            })}
          </div>
        ) : null}
      </div>
    </article>
  )
}
