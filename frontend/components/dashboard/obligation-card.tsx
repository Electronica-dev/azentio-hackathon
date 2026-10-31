import { ExternalLinkIcon } from "lucide-react"
import Link from "next/link"

import { applicabilityLabel } from "@/lib/domain"
import type { Obligation, Source } from "@/lib/types"
import { cn } from "@/lib/utils"

import { ChangeClassBadge, Tag } from "./primitives"

const AI_TONE =
  "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"

/**
 * One extracted obligation as a structured card — never a free-text summary.
 * Always shows the clause/section reference and the verbatim quote (R8), plus
 * applicability, deadline, threshold and confidence on one quiet line.
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
  const confidence = Math.round((Number.isFinite(obligation.confidence) ? obligation.confidence : 0) * 100)
  const facts = [
    obligation.kind && obligation.kind !== "requirement" ? obligation.kind : null,
    obligation.modality,
    obligation.deadline ? `Deadline: ${obligation.deadline}` : null,
    obligation.threshold ? `Threshold: ${obligation.threshold}` : null,
  ].filter(Boolean)

  return (
    <article id={anchor} className="scroll-mt-20 rounded-xl border border-border bg-card p-4 shadow-xs">
      <header className="flex flex-wrap items-start gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground tabular-nums">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium leading-snug">{obligation.subject}</h3>
          <a
            href={`?highlight=${encodeURIComponent(obligation.id)}#${obligation.clause_id}`}
            className="mt-0.5 inline-block text-xs font-medium text-primary hover:underline"
            title="Show this quote in the source clause"
          >
            {obligation.section_ref}
          </a>
        </div>
        <ChangeClassBadge value={obligation.change_class ?? obligation.change_type} short />
      </header>

      <div className="mt-3 grid gap-3 pl-9">
        <p className="text-sm leading-relaxed">{obligation.statement}</p>

        {quote ? (
          <blockquote className="border-l-2 border-primary/50 pl-3 text-sm leading-relaxed text-muted-foreground italic">
            “{quote}”
          </blockquote>
        ) : (
          <p className="text-xs text-muted-foreground">No verbatim quote was captured — treat the statement as unverified.</p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {facts.map((fact) => (
            <span key={String(fact)} className={cn(fact === "prohibited" && "font-medium text-rose-700 dark:text-rose-300")}>
              {fact}
            </span>
          ))}
          <span
            className={cn(confidence < 60 && "font-medium text-amber-700 dark:text-amber-300")}
            title={obligation.enrichment ? `Extraction: ${obligation.enrichment}` : undefined}
          >
            {confidence}% confidence
          </span>
          {applicability.map((area) => (
            <Tag key={`area-${area}`} className={area === "ai" ? AI_TONE : undefined}>
              {applicabilityLabel(area)}
            </Tag>
          ))}
          {appliesTo.map((unit) => (
            <Tag key={`unit-${unit}`}>{unit}</Tag>
          ))}
        </div>

        {params.length || references.length ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {params.map(([key, value]) => (
              <Tag key={key} className="font-mono">
                {key}: <span className="text-foreground">{String(value)}</span>
              </Tag>
            ))}
            {references.map((reference) => {
              const match = sources.find((source) => source.ref && reference.includes(source.ref))
              return match ? (
                <Link
                  key={reference}
                  href={`/publications/${encodeURIComponent(match.id)}`}
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  Cites {reference}
                  <ExternalLinkIcon className="size-3" aria-hidden />
                </Link>
              ) : (
                <span key={reference} className="text-muted-foreground">
                  Cites {reference}
                </span>
              )
            })}
          </div>
        ) : null}
      </div>
    </article>
  )
}
