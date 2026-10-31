"use client"

import { FileTextIcon, UploadCloudIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState, useTransition } from "react"

import { uploadOrgDocument } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/format"
import type { OrgDocument } from "@/lib/org"
import { cn } from "@/lib/utils"

import { DeleteButton, EmptyRows, Field, FilterPills, INPUT, Notice, Panel, Select, SuggestInput } from "./org-ui"

const MAX_BYTES = 8 * 1024 * 1024
const ACCEPT = ".txt,.md,.docx,.pdf,.html,.htm,.csv"

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result ?? "")
      resolve(value.slice(value.indexOf(",") + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error("could not read the file"))
    reader.readAsDataURL(file)
  })
}

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function UploadPanel({
  categories,
  people,
  departments,
}: {
  categories: { value: string; label: string }[]
  people: string[]
  departments: string[]
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function addFiles(list: FileList | null) {
    if (!list) return
    setNotice(null)
    const incoming = Array.from(list)
    const tooBig = incoming.filter((file) => file.size > MAX_BYTES)
    if (tooBig.length) setNotice({ tone: "error", text: `Skipped files over 8 MB: ${tooBig.map((f) => f.name).join(", ")}` })
    setFiles((current) => [...current, ...incoming.filter((file) => file.size <= MAX_BYTES && !current.some((c) => c.name === file.name))])
  }

  function submit(form: HTMLFormElement) {
    if (!files.length) {
      setNotice({ tone: "error", text: "Choose at least one file." })
      return
    }
    const data = new FormData(form)
    const meta = {
      category: String(data.get("category")),
      department: String(data.get("department") ?? ""),
      owner: String(data.get("owner") ?? ""),
      version: String(data.get("version") ?? ""),
      review_date: String(data.get("review_date") ?? ""),
    }
    startTransition(async () => {
      setNotice(null)
      const failed: string[] = []
      for (const [index, file] of files.entries()) {
        setProgress(`Uploading ${index + 1} of ${files.length}…`)
        try {
          const result = await uploadOrgDocument({ filename: file.name, content_base64: await fileToBase64(file), ...meta })
          if (!result.ok) failed.push(`${file.name}: ${result.message}`)
        } catch (error) {
          failed.push(`${file.name}: ${error instanceof Error ? error.message : "upload failed"}`)
        }
      }
      setProgress(null)
      const saved = files.length - failed.length
      setFiles((current) => current.filter((file) => failed.some((line) => line.startsWith(`${file.name}:`))))
      setNotice(
        failed.length
          ? { tone: "error", text: `${saved} uploaded. Failed: ${failed.join("; ")}` }
          : { tone: "success", text: `${saved} document${saved === 1 ? "" : "s"} uploaded.` },
      )
      if (saved) router.refresh()
    })
  }

  return (
    <Panel title="Upload documents" description="Add one file or many at once. The details below apply to every file in this batch.">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          submit(event.currentTarget)
        }}
      >
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            addFiles(event.dataTransfer.files)
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border",
          )}
        >
          <UploadCloudIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm">
            Drag files here or{" "}
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => input.current?.click()}>
              browse
            </button>
          </p>
          <p className="text-xs text-muted-foreground">PDF, DOCX, TXT, Markdown, HTML or CSV · up to 8 MB each</p>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = ""
            }}
          />
        </div>

        {files.length ? (
          <ul className="grid gap-1.5">
            {files.map((file) => (
              <li key={file.name} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground">{size(file.size)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  disabled={pending}
                  onClick={() => setFiles((current) => current.filter((f) => f !== file))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <Field label="Document type">
          <Select name="category" defaultValue="policy">
            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Department">
            <SuggestInput name="department" options={departments} placeholder="e.g. Compliance" />
          </Field>
          <Field label="Owner">
            <SuggestInput name="owner" options={people} placeholder="Name" />
          </Field>
        </div>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
          <Field label="Version">
            <input name="version" placeholder="e.g. v2.1" className={INPUT} />
          </Field>
          <Field label="Next review">
            <input name="review_date" type="date" className={INPUT} />
          </Field>
        </div>

        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

        <div className="flex items-center justify-end gap-3">
          {progress ? <span className="text-sm text-muted-foreground">{progress}</span> : null}
          <Button type="submit" disabled={pending || !files.length}>
            {files.length > 1 ? `Upload ${files.length} files` : "Upload"}
          </Button>
        </div>
      </form>
    </Panel>
  )
}

export function DocumentsTab({
  documents,
  categories,
  people,
  departments,
}: {
  documents: OrgDocument[]
  categories: { value: string; label: string }[]
  people: string[]
  departments: string[]
}) {
  const [filter, setFilter] = useState("all")
  const labels = useMemo(() => Object.fromEntries(categories.map((c) => [c.value, c.label])), [categories])
  const today = new Date().toISOString().slice(0, 10)
  const shown = filter === "all" ? documents : documents.filter((doc) => doc.category === filter)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="grid min-w-0 gap-4">
        <FilterPills
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: documents.length },
            ...categories.map((c) => ({ value: c.value, label: c.label, count: documents.filter((d) => d.category === c.value).length })),
          ]}
        />
        {shown.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            {shown.map((doc) => {
              const overdue = Boolean(doc.review_date) && doc.review_date < today
              return (
                <li key={doc.id} className="flex items-start gap-3 px-4 py-3">
                  <FileTextIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {doc.title}
                      {doc.version ? <span className="ml-2 text-xs font-normal text-muted-foreground">{doc.version}</span> : null}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {labels[doc.category] ?? doc.category}
                      {doc.department ? ` · ${doc.department}` : ""}
                      {doc.owner ? ` · ${doc.owner}` : ""}
                    </p>
                    {doc.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground/80">{doc.excerpt}</p> : null}
                    <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>
                        {doc.filename} · {size(doc.bytes)}
                        {doc.words ? ` · ${doc.words.toLocaleString()} words` : " · no text extracted"}
                      </span>
                      {doc.review_date ? (
                        <span className={cn(overdue && "font-medium text-destructive")}>
                          {overdue ? "Review overdue since" : "Review by"} {formatDate(doc.review_date)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <DeleteButton kind="documents" id={doc.id} label={doc.title} />
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyRows>
            {documents.length ? "No documents of this type yet." : "No internal documents yet. Upload your policies, SOPs and registers to get started."}
          </EmptyRows>
        )}
      </div>
      <UploadPanel categories={categories} people={people} departments={departments} />
    </div>
  )
}
