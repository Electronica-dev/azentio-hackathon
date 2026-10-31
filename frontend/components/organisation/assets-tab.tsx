"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { addOrgRecords } from "@/app/actions"
import { Button } from "@/components/ui/button"
import type { OrgAsset } from "@/lib/org"
import { cn } from "@/lib/utils"

import { CsvImport, DeleteButton, EmptyRows, Field, FilterPills, INPUT, ModeSwitch, Notice, Panel, Select, SuggestInput } from "./org-ui"

const TYPE_LABEL: Record<string, string> = {
  system: "System",
  process: "Process",
  control: "Control",
  policy: "Policy",
}

const TYPE_PLURAL: Record<string, string> = {
  system: "Systems",
  process: "Processes",
  control: "Controls",
  policy: "Policies",
}

const CRITICALITY = ["", "Very low", "Low", "Medium", "High", "Critical"]

function Criticality({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-2" title={`Criticality ${value} of 5`}>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={cn(
              "h-3 w-1.5 rounded-full",
              step <= value ? (value >= 4 ? "bg-rose-500" : value === 3 ? "bg-amber-500" : "bg-emerald-500") : "bg-muted",
            )}
          />
        ))}
      </span>
      <span className="text-sm text-muted-foreground">{CRITICALITY[value] ?? value}</span>
    </span>
  )
}

function AddAsset({ types, people, departments }: { types: string[]; people: string[]; departments: string[] }) {
  const router = useRouter()
  const [mode, setMode] = useState<"form" | "csv">("form")
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <Panel title="Add assets" description="Assets you add here are checked against every future regulatory change.">
      <ModeSwitch mode={mode} onChange={setMode} />
      <div className="mt-4">
        {mode === "csv" ? (
          <CsvImport kind="assets" columns="name,type,owner,department,criticality,description,tags" />
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              const form = event.currentTarget
              const item = Object.fromEntries(Array.from(new FormData(form).entries()).map(([k, v]) => [k, String(v)]))
              startTransition(async () => {
                const result = await addOrgRecords("assets", { item })
                setNotice(result.ok ? { tone: "success", text: `Added ${item.name}.` } : { tone: "error", text: result.message ?? "Could not add the asset." })
                if (result.ok) {
                  form.reset()
                  router.refresh()
                }
              })
            }}
          >
            <Field label="Name">
              <input name="name" required placeholder="e.g. Loan Origination System" className={INPUT} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Type">
                <Select name="type" defaultValue="system">
                  {types.map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABEL[type] ?? type}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Criticality">
                <Select name="criticality" defaultValue="3">
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option key={value} value={value}>
                      {value} · {CRITICALITY[value]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Owner">
                <SuggestInput name="owner" options={people} placeholder="Name" />
              </Field>
              <Field label="Department">
                <SuggestInput name="department" options={departments} placeholder="Team" />
              </Field>
            </div>
            <Field label="Description" hint="What it does or records. Used to match it to regulations.">
              <textarea name="description" rows={3} className={cn(INPUT, "h-auto py-2")} />
            </Field>
            <Field label="Tags" hint="Comma separated, e.g. lending, credit, kyc">
              <input name="tags" className={INPUT} />
            </Field>
            {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
            <Button type="submit" disabled={pending} className="justify-self-end">
              {pending ? "Adding…" : "Add asset"}
            </Button>
          </form>
        )}
      </div>
    </Panel>
  )
}

export function AssetsTab({
  assets,
  types,
  people,
  departments,
}: {
  assets: OrgAsset[]
  types: string[]
  people: string[]
  departments: string[]
}) {
  const [filter, setFilter] = useState("all")
  const shown = (filter === "all" ? assets : assets.filter((asset) => asset.type === filter))
    .slice()
    .sort((a, b) => b.criticality - a.criticality || a.name.localeCompare(b.name))
  const known = new Set(people.map((name) => name.toLowerCase()))

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="grid min-w-0 gap-4">
        <FilterPills
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: assets.length },
            ...types.map((type) => ({ value: type, label: TYPE_PLURAL[type] ?? type, count: assets.filter((a) => a.type === type).length })),
          ]}
        />
        {shown.length ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Asset</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium">Criticality</th>
                  <th className="w-12 px-2 py-2.5" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((asset) => (
                  <tr key={asset.id} className="align-top">
                    <td className="max-w-md px-4 py-3">
                      <p className="font-medium">{asset.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {TYPE_LABEL[asset.type] ?? asset.type}
                        {asset.version ? ` · ${asset.version}` : ""}
                      </p>
                      {asset.state ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">{asset.state}</p> : null}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {asset.owner ? (
                        <>
                          <p>{asset.owner}</p>
                          {!known.has(asset.owner.toLowerCase()) ? (
                            <p className="text-xs text-amber-700 dark:text-amber-300">Not in directory</p>
                          ) : null}
                        </>
                      ) : (
                        <p className="text-amber-700 dark:text-amber-300">No owner</p>
                      )}
                      <p className="text-xs text-muted-foreground">{asset.team}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Criticality value={asset.criticality} />
                    </td>
                    <td className="px-2 py-2">
                      <DeleteButton kind="assets" id={asset.id} label={asset.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyRows>No assets of this type yet.</EmptyRows>
        )}
      </div>
      <AddAsset types={types} people={people} departments={departments} />
    </div>
  )
}
