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
    return <p className="text-sm text-muted-foreground">No word-level redline was produced for this clause.</p>
  }
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">
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

function highlightInBody(body: string, quote?: string) {
  if (!quote) return body
  const needle = quote.trim()
  if (!needle) return body

  let index = body.indexOf(needle)
  let length = needle.length
  if (index < 0 && needle.length > 40) {
    // Quotes can differ by a trailing space or punctuation; anchor on the start.
    const anchor = needle.slice(0, 40).trimEnd()
    index = body.indexOf(anchor)
    length = needle.length
  }
  if (index < 0) return body

  return (
    <>
      {body.slice(0, index)}
      <mark className="rounded-sm bg-amber-200/80 px-0.5 text-foreground decoration-amber-500/60 underline-offset-2 dark:bg-amber-400/30">
        {body.slice(index, index + length)}
      </mark>
      {body.slice(index + length)}
    </>
  )
}

/**
 * Side-by-side previous vs updated clause (R16): the plain-English
 * significance leads, then before/after columns with the word-level redline.
 * When there is no prior text the left column says so instead of an empty box.
 *
 * `highlightQuote` marks the exact sentence a reviewer arrived from (an
 * obligation card), so the change is traceable to the source text (R19).
 */
export function ClauseDiff({
  clause,
  priorLabel,
  priorHref,
  highlightQuote,
}: {
  clause: Clause
  priorLabel?: string
  priorHref?: string
  highlightQuote?: string
}) {
  const hasPrior = Boolean(clause.previous_text?.trim())
  const hasRedline = Boolean(clause.redline?.length)
  const change = clauseChangeChip(clause.change_type)
  // Show the red/green markup in the "after" column, except when a reviewer
  // arrived from an obligation: then the plain text with that quote marked.
  const showRedline = hasRedline && !highlightQuote

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-4">
        <h3 className="min-w-0 flex-1 font-medium leading-snug">
          {clause.heading}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{clause.section_ref}</span>
        </h3>
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", change.className)}>
          {change.label}
        </span>
      </div>

      <p className="px-4 pt-2 pb-4 text-sm leading-relaxed">
        {clause.significance ?? clause.summary ?? "No summary was produced for this clause."}
      </p>

      <div className="grid border-t border-border md:grid-cols-2">
        <div className="border-b border-border bg-muted/30 px-4 py-3 md:border-r md:border-b-0">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Before{priorLabel ? ` · ${priorLabel}` : ""}
          </div>
          {hasPrior ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{clause.previous_text}</p>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground italic">
              {clause.change_type === "added" ? "New clause — nothing to compare." : "No earlier text on file."}
              {priorHref ? (
                <a href={priorHref} className="ml-1 font-medium text-primary not-italic hover:underline">
                  Open prior publication <ArrowRightIcon className="inline size-3" aria-hidden />
                </a>
              ) : null}
            </p>
          )}
        </div>
        <div className="px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            After · as published
            {showRedline ? (
              <span className="inline-flex gap-1 font-normal">
                <span className="rounded-sm bg-rose-100 px-1 text-rose-800 line-through dark:bg-rose-500/15 dark:text-rose-300">removed</span>
                <span className="rounded-sm bg-emerald-100 px-1 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200">added</span>
              </span>
            ) : null}
          </div>
          {showRedline ? (
            <RedlineText segments={clause.redline} />
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{highlightInBody(clause.body, highlightQuote)}</p>
          )}
        </div>
      </div>
    </div>
  )
}
