import { ArrowRightIcon } from "lucide-react"

import type { Clause } from "@/lib/types"
import { cn } from "@/lib/utils"

const CLAUSE_CHANGE: Record<string, { label: string; className: string }> = {
  added: {
    label: "Introduced",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  modified: {
    label: "Amended",
    className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  },
  removed: {
    label: "Withdrawn",
    className: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  },
  unchanged: {
    label: "Unchanged",
    className: "border-border bg-muted text-muted-foreground dark:bg-muted/60",
  },
}

export function clauseChangeChip(changeType: string) {
  return CLAUSE_CHANGE[changeType] ?? { label: changeType || "Unclassified", className: "border-border bg-muted text-muted-foreground" }
}

/**
 * Word-level redline from the contract's `redline` segments:
 * `same` stays plain, `del` is struck through in red, `add` is underlined in green.
 */
export function RedlineText({ segments }: { segments: Clause["redline"] }) {
  if (!segments || segments.length === 0) {
    return <p className="text-xs text-muted-foreground">No word-level redline was produced for this clause.</p>
  }
  return (
    <p className="text-xs leading-relaxed whitespace-pre-wrap">
      {segments.map((segment, index) => {
        if (segment.t === "del") {
          return (
            <del
              key={index}
              className="bg-rose-100 text-rose-800 line-through decoration-rose-500/70 dark:bg-rose-500/15 dark:text-rose-300"
            >
              {segment.v}
            </del>
          )
        }
        if (segment.t === "add") {
          return (
            <ins
              key={index}
              className="bg-emerald-100 font-medium text-emerald-900 no-underline dark:bg-emerald-500/15 dark:text-emerald-200"
            >
              {segment.v}
            </ins>
          )
        }
        return <span key={index}>{segment.v}</span>
      })}
    </p>
  )
}

/**
 * Side-by-side previous vs updated clause with highlights and a plain-English
 * significance sentence (R16). When there is no prior text the left column
 * explains that rather than showing an empty box.
 */
export function ClauseDiff({
  clause,
  priorLabel,
  priorHref,
}: {
  clause: Clause
  priorLabel?: string
  priorHref?: string
}) {
  const hasPrior = Boolean(clause.previous_text?.trim())
  const hasRedline = Boolean(clause.redline?.length)
  const change = clauseChangeChip(clause.change_type)

  return (
    <div className="rounded-lg ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="font-mono text-[10px] text-muted-foreground">{clause.section_ref}</span>
        <h3 className="min-w-0 flex-1 font-heading text-sm font-semibold leading-snug">{clause.heading}</h3>
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", change.className)}>
          {change.label}
        </span>
      </div>

      <div className="grid gap-0 md:grid-cols-2">
        <div className="border-b border-border px-3 py-2 md:border-b-0 md:border-r">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="size-1.5 rounded-full bg-rose-400" aria-hidden />
            Previous {priorLabel ? `· ${priorLabel}` : ""}
          </div>
          {hasPrior ? (
            <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">{clause.previous_text}</p>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground italic">
              No earlier text to compare. {clause.change_type === "added" ? "This clause is new in this publication." : "The prior version was not supplied with this document."}
              {priorHref ? (
                <a href={priorHref} className="ml-1 not-italic font-medium text-primary hover:underline">
                  Open prior publication <ArrowRightIcon className="inline size-3" aria-hidden />
                </a>
              ) : null}
            </p>
          )}
        </div>

        <div className="px-3 py-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
            Updated · as published
          </div>
          <p className="text-xs leading-relaxed whitespace-pre-wrap">{clause.body}</p>
        </div>
      </div>

      {hasRedline ? (
        <div className="border-t border-border bg-muted/30 px-3 py-2">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Word-level changes
            <span className="inline-flex items-center gap-1 font-normal normal-case">
              <span className="rounded-sm bg-rose-100 px-1 text-rose-800 line-through dark:bg-rose-500/15 dark:text-rose-300">removed</span>
              <span className="rounded-sm bg-emerald-100 px-1 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200">inserted</span>
            </span>
          </div>
          <RedlineText segments={clause.redline} />
        </div>
      ) : null}

      <div className="border-t border-border px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">What it means</div>
        <p className="mt-0.5 text-xs leading-relaxed">
          {clause.significance ?? (
            <>
              {clause.summary || "No summary was produced for this clause."}
              <span className="ml-1 text-[10px] italic text-muted-foreground">(rule-based summary; significance not yet generated)</span>
            </>
          )}
        </p>
        {clause.prior_clause_id ? (
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">prior clause: {clause.prior_clause_id}</p>
        ) : null}
      </div>
    </div>
  )
}
