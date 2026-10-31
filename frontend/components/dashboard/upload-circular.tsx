"use client"

import { CheckIcon, FileUpIcon, Loader2Icon, UploadIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState, useTransition } from "react"

import {
  confirmRelationship,
  uploadCircular,
  type RelationshipOutcome,
  type UploadOutcome,
} from "@/app/actions"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const MAX_BYTES = 8 * 1024 * 1024
const ACCEPT = ".txt,.md,.docx,.pdf,.html,.htm"

const STATUS_COPY: Record<string, { label: string; hint: string; tone: string }> = {
  linked: {
    label: "Linked",
    hint: "A predecessor was found with enough evidence, so the diff ran automatically.",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  proposed: {
    label: "Needs your decision",
    hint: "The evidence is inconclusive. Pick the earlier document below, or leave it unlinked.",
    tone: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  },
  standalone: {
    label: "Standalone",
    hint: "No earlier publication in the repository looks like this instrument, so nothing was diffed.",
    tone: "border-border bg-muted text-muted-foreground",
  },
  unresolved: {
    label: "Unresolved",
    hint: "No reliable predecessor was found. It is queued for manual linkage.",
    tone: "border-border bg-muted text-muted-foreground",
  },
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result ?? "")
      const comma = value.indexOf(",")
      resolve(comma >= 0 ? value.slice(comma + 1) : value)
    }
    reader.onerror = () => reject(reader.error ?? new Error("could not read that file"))
    reader.readAsDataURL(file)
  })
}

function percent(value: number | undefined): string {
  return `${Math.round((value ?? 0) * 100)}%`
}

function StatusBadge({ relationship }: { relationship: RelationshipOutcome | null | undefined }) {
  const status = relationship?.status ?? "standalone"
  const copy = STATUS_COPY[status] ?? STATUS_COPY.standalone
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", copy.tone)}>
      {status === "linked" ? <CheckIcon className="size-3" aria-hidden /> : null}
      {copy.label}
    </span>
  )
}

function ResultPanel({
  result,
  pending,
  onConfirm,
}: {
  result: UploadOutcome
  pending: boolean
  onConfirm: (priorSourceId: string) => void
}) {
  const relationship = result.relationship
  const status = relationship?.status ?? "standalone"
  const copy = STATUS_COPY[status] ?? STATUS_COPY.standalone
  const stats = result.run?.stats
  const alternatives = relationship?.alternatives ?? []

  return (
    <div className="grid gap-3">
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge relationship={relationship} />
          {relationship?.confidence ? (
            <span className="text-[10px] text-muted-foreground">
              confidence <b className="font-semibold text-foreground">{percent(relationship.confidence)}</b>
            </span>
          ) : null}
          {result.quality && result.quality !== "text" ? (
            <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
              {result.quality}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{copy.hint}</p>
        {relationship?.rationale ? (
          <p className="mt-1 text-[11px] leading-relaxed text-foreground">{relationship.rationale}</p>
        ) : null}
        {relationship?.prior_title || relationship?.prior_source_id ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Compared against{" "}
            <b className="font-semibold text-foreground">{relationship.prior_title ?? relationship.prior_source_id}</b>
          </p>
        ) : null}
      </div>

      {stats ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["clauses", stats.clauses],
            ["obligations", stats.obligations],
            ["impacts", stats.impacts],
            ["tasks", stats.tasks],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-md border border-border bg-card px-2 py-1.5">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="font-heading text-lg font-semibold tabular-nums">{value ?? 0}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {status === "proposed" ? (
        <div className="grid gap-2">
          <p className="text-[11px] font-semibold">Did this document amend one of these?</p>
          {alternatives.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No candidate cleared the gates. It will stay standalone until someone links it manually.
            </p>
          ) : (
            <ul className="grid gap-1.5">
              {alternatives.map((candidate) => (
                <li
                  key={candidate.document_id}
                  className="rounded-md border border-border bg-card px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium">{candidate.title}</span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">{percent(candidate.confidence)}</span>
                  </div>
                  {candidate.rationale ? (
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{candidate.rationale}</p>
                  ) : null}
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="mt-1.5"
                    disabled={pending}
                    onClick={() => onConfirm(candidate.document_id)}
                  >
                    Diff against this
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {relationship?.model_opinion ? (
            <p className="rounded-md border border-dashed border-border px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
              <b className="font-semibold text-foreground">Model opinion.</b>{" "}
              {relationship.model_opinion.prior_document_id
                ? `Suggests ${relationship.model_opinion.prior_document_id} (${percent(relationship.model_opinion.confidence)}). `
                : "Suggests no predecessor. "}
              {relationship.model_opinion.rationale}
              {relationship.model_opinion.evidence ? (
                <span className="mt-1 block italic">“{relationship.model_opinion.evidence}”</span>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}

      {result.backfilled?.length ? (
        <p className="rounded-md border border-border bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground">
          <b className="font-semibold text-foreground">Backfilled {result.backfilled.length}.</b> This upload is older
          than {result.backfilled.map((edge) => edge.title).join(", ")}, so that comparison was re-pointed at it.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-border pt-3">
        {result.source ? (
          <Link
            href={`/publications/${result.source.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Open publication
          </Link>
        ) : null}
        <Button type="button" size="sm" onClick={() => window.location.reload()}>
          Refresh repository
        </Button>
      </div>
    </div>
  )
}

/**
 * Manual upload. One button, one file, then the same selection ladder the
 * monitor runs: gates → identity → chain → decisive evidence → score band.
 * The result stays on screen so the reviewer can accept a grey-band candidate.
 */
export function UploadCircular() {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [authority, setAuthority] = useState("")
  const [result, setResult] = useState<UploadOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) close()
    }
    window.addEventListener("keydown", onKey)
    inputRef.current?.focus()
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pending])

  function close() {
    if (pending) return
    setOpen(false)
    setFile(null)
    setResult(null)
    setError(null)
    setAuthority("")
  }

  function submit() {
    if (!file) {
      setError("Choose a file first.")
      return
    }
    if (file.size > MAX_BYTES) {
      setError("That file is larger than 8 MB.")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const content_base64 = await fileToBase64(file)
        const outcome = await uploadCircular({ filename: file.name, content_base64, authority: authority || undefined })
        if (!outcome.ok) {
          setError(outcome.message ?? "Upload failed.")
          return
        }
        setResult(outcome)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Upload failed.")
      }
    })
  }

  function confirm(priorSourceId: string) {
    if (!result?.source) return
    startTransition(async () => {
      const outcome = await confirmRelationship(result.source!.id, priorSourceId)
      if (!outcome.ok) {
        setError(outcome.message ?? "Could not link that publication.")
        return
      }
      window.location.reload()
    })
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UploadIcon aria-hidden />
        Upload circular
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 px-4 py-10"
          role="presentation"
          onMouseDown={() => close()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-title"
            className="w-full max-w-2xl rounded-lg bg-card p-4 shadow-2xl ring-1 ring-foreground/15"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 id="upload-title" className="font-heading text-base font-semibold">
                  Upload a regulatory document
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  TXT, DOCX, HTML or PDF. The file is stored, related to what we already hold, then diffed.
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={close} aria-label="Close" disabled={pending}>
                <XIcon aria-hidden />
              </Button>
            </header>

            {result ? (
              <ResultPanel result={result} pending={pending} onConfirm={confirm} />
            ) : (
              <div className="grid gap-3">
                <label className="grid gap-1">
                  <span className="text-[11px] font-medium">Document</span>
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPT}
                    disabled={pending}
                    onChange={(event) => {
                      setFile(event.target.files?.[0] ?? null)
                      setError(null)
                    }}
                    className="block w-full cursor-pointer rounded-md border border-border bg-card px-2 py-1.5 text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-[10px] file:font-medium"
                  />
                  {file ? (
                    <span className="text-[10px] text-muted-foreground">
                      {file.name} · {(file.size / 1024).toFixed(0)} KB
                    </span>
                  ) : null}
                </label>

                <label className="grid gap-1">
                  <span className="text-[11px] font-medium">Regulator</span>
                  <select
                    value={authority}
                    onChange={(event) => setAuthority(event.target.value)}
                    disabled={pending}
                    className="h-7 w-full rounded-md border border-border bg-card px-2 text-xs"
                  >
                    <option value="">Detect from the document</option>
                    <option value="RBI">RBI — India</option>
                    <option value="SEBI">SEBI — India</option>
                    <option value="SAMA">SAMA — Saudi Arabia</option>
                    <option value="CBUAE">CBUAE — UAE</option>
                    <option value="SARB">SARB — South Africa</option>
                  </select>
                </label>

                <p className="rounded-md border border-dashed border-border px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
                  <b className="font-semibold text-foreground">What happens next.</b> The engine gates on authority,
                  date order, language and duplicates, identifies the instrument, walks the version chain, looks for
                  decisive evidence, then scores the survivors. A confident match diffs immediately; an inconclusive
                  one comes back for your decision rather than guessing.
                </p>

                {error ? (
                  <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
                    {error}
                  </p>
                ) : null}

                <div className="flex items-center justify-end gap-1.5 border-t border-border pt-3">
                  <Button type="button" variant="ghost" size="sm" onClick={close} disabled={pending}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={submit} disabled={pending || !file}>
                    {pending ? (
                      <>
                        <Loader2Icon className="animate-spin" aria-hidden />
                        Analysing…
                      </>
                    ) : (
                      <>
                        <FileUpIcon aria-hidden />
                        Upload &amp; analyse
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
