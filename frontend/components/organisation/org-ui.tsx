"use client"

import { ChevronDownIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"

import { addOrgRecords, deleteOrgRecord } from "@/app/actions"
import { cn } from "@/lib/utils"

export const INPUT =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("grid content-start gap-1.5", className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

/** Free text with suggestions, e.g. owners from the people directory. */
export function SuggestInput({ name, options, ...props }: { name: string; options: string[] } & React.ComponentProps<"input">) {
  const id = `${name}-options`
  return (
    <>
      <input name={name} list={id} autoComplete="off" className={INPUT} {...props} />
      <datalist id={id}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  )
}

export function Notice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg px-3 py-2 text-sm",
        tone === "error"
          ? "bg-destructive/10 text-destructive"
          : "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200",
      )}
    >
      {children}
    </p>
  )
}

export function Panel({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-5 shadow-xs", className)}>
      <h2 className="font-heading font-semibold">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** Pill filter: "All" plus one option per value, with counts. */
export function FilterPills({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; count: number }[]
}) {
  return (
    <div role="group" aria-label="Filter" className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
            value === option.value
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
          <span className="tabular-nums opacity-70">{option.count}</span>
        </button>
      ))}
    </div>
  )
}

/** Reads a CSV file in the browser and sends its text; the backend validates every row. */
export function CsvImport({ kind, columns }: { kind: "assets" | "people"; columns: string }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null)

  function onFile(file: File | undefined) {
    if (!file) return
    startTransition(async () => {
      setNotice(null)
      const result = await addOrgRecords(kind, { csv: await file.text() })
      setNotice(result.ok ? { tone: "success", text: `Imported ${result.added} from ${file.name}.` } : { tone: "error", text: result.message ?? "Import failed." })
      if (input.current) input.current.value = ""
      if (result.ok) router.refresh()
    })
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Columns: <code className="font-mono text-xs text-foreground">{columns}</code>. The first row is the header. If any
        row is invalid, nothing is imported.
      </p>
      <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => onFile(event.target.files?.[0])} />
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-medium shadow-xs hover:bg-muted disabled:opacity-50"
      >
        <UploadIcon className="size-4" aria-hidden />
        {pending ? "Importing…" : "Choose CSV file"}
      </button>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
    </div>
  )
}

export function DeleteButton({ kind, id, label }: { kind: "documents" | "assets" | "people"; id: string; label: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Delete ${label}`}
      title={`Delete ${label}`}
      onClick={() => {
        if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
        startTransition(async () => {
          const result = await deleteOrgRecord(kind, id)
          if (!result.ok) window.alert(result.message ?? "Delete failed.")
          else router.refresh()
        })
      }}
      className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
    >
      <Trash2Icon className="size-4" aria-hidden />
    </button>
  )
}

export function EmptyRows({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">{children}</p>
}

/** Two-way switch between adding one record and importing a CSV. */
export function ModeSwitch({ mode, onChange }: { mode: "form" | "csv"; onChange: (mode: "form" | "csv") => void }) {
  return (
    <div role="tablist" className="inline-flex rounded-lg bg-muted p-1">
      {(["form", "csv"] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium transition-colors",
            mode === value ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value === "form" ? "Add one" : "Import CSV"}
        </button>
      ))}
    </div>
  )
}

/** Native select (works without JS, good on mobile) with our own chevron instead of the OS one. */
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select className={cn(INPUT, "cursor-pointer appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </span>
  )
}
