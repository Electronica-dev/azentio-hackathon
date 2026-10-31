"use client"

import { SearchIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { addOrgRecords } from "@/app/actions"
import { Button } from "@/components/ui/button"
import type { Person } from "@/lib/org"

import { CsvImport, DeleteButton, EmptyRows, Field, FilterPills, INPUT, ModeSwitch, Notice, Panel, SuggestInput } from "./org-ui"

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

function AddPerson({ departments }: { departments: string[] }) {
  const router = useRouter()
  const [mode, setMode] = useState<"form" | "csv">("form")
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <Panel title="Add people" description="Owners named on documents and assets are matched to this directory.">
      <ModeSwitch mode={mode} onChange={setMode} />
      <div className="mt-4">
        {mode === "csv" ? (
          <CsvImport kind="people" columns="name,email,department,designation" />
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              const form = event.currentTarget
              const item = Object.fromEntries(Array.from(new FormData(form).entries()).map(([k, v]) => [k, String(v)]))
              startTransition(async () => {
                const result = await addOrgRecords("people", { item })
                setNotice(result.ok ? { tone: "success", text: `Added ${item.name}.` } : { tone: "error", text: result.message ?? "Could not add the person." })
                if (result.ok) {
                  form.reset()
                  router.refresh()
                }
              })
            }}
          >
            <Field label="Full name">
              <input name="name" required className={INPUT} />
            </Field>
            <Field label="Work email">
              <input name="email" type="email" className={INPUT} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Department">
                <SuggestInput name="department" options={departments} />
              </Field>
              <Field label="Designation">
                <input name="designation" placeholder="e.g. Head of Risk" className={INPUT} />
              </Field>
            </div>
            {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
            <Button type="submit" disabled={pending} className="justify-self-end">
              {pending ? "Adding…" : "Add person"}
            </Button>
          </form>
        )}
      </div>
    </Panel>
  )
}

export function PeopleTab({ people, departments }: { people: Person[]; departments: string[] }) {
  const [department, setDepartment] = useState("all")
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const shown = people
    .filter((person) => department === "all" || person.department === department)
    .filter((person) => !q || [person.name, person.email, person.designation].join(" ").toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
  const teams = Array.from(new Set(people.map((person) => person.department).filter(Boolean))).sort()

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="grid min-w-0 gap-4">
        <label className="relative">
          <span className="sr-only">Search people</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, email or designation" className={`${INPUT} pl-9`} />
        </label>
        <FilterPills
          value={department}
          onChange={setDepartment}
          options={[
            { value: "all", label: "All", count: people.length },
            ...teams.map((team) => ({ value: team, label: team, count: people.filter((p) => p.department === team).length })),
          ]}
        />
        {shown.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            {shown.map((person) => (
              <li key={person.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary" aria-hidden>
                  {initials(person.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{person.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {[person.designation, person.department].filter(Boolean).join(" · ") || "No department or designation"}
                  </p>
                </div>
                {person.email ? (
                  <a href={`mailto:${person.email}`} className="hidden text-sm text-muted-foreground hover:text-primary sm:block">
                    {person.email}
                  </a>
                ) : null}
                <DeleteButton kind="people" id={person.id} label={person.name} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyRows>{people.length ? "Nobody matches that search." : "No people yet."}</EmptyRows>
        )}
      </div>
      <AddPerson departments={departments} />
    </div>
  )
}
