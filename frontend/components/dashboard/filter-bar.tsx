"use client"

import { ChevronDownIcon, SearchIcon, XIcon } from "lucide-react"
import Link from "next/link"

import { CHANGE_CLASS, REGION_LABEL } from "@/lib/domain"
import type { Dashboard, Filters, SortKey } from "@/lib/domain"

const ALL = ""

const SORTS: { value: SortKey; label: string }[] = [
  { value: "published", label: "Newest first" },
  { value: "effective", label: "Effective date" },
  { value: "obligations", label: "Most obligations" },
  { value: "title", label: "Title A–Z" },
]

const CONTROL =
  "h-9 min-w-0 rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"

function Picker({
  name,
  label,
  value,
  options,
  allLabel,
}: {
  name: string
  label: string
  value?: string
  options: { value: string; label: string }[]
  allLabel?: string
}) {
  return (
    <span className="relative inline-flex">
      <select
        name={name}
        defaultValue={value ?? ALL}
        aria-label={label}
        className={`${CONTROL} w-full cursor-pointer appearance-none truncate pr-9`}
      >
        {allLabel ? <option value={ALL}>{allLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </span>
  )
}

/**
 * Filters compose in the URL (`?q=&region=&authority=&area=&changeClass=&state=&sort=`)
 * so the view is shareable and server-rendered. Picking any option submits the
 * form; search submits on Enter. Without JavaScript it is still a plain GET form.
 */
export function FilterBar({ dashboard, filters }: { dashboard: Dashboard; filters: Filters }) {
  const regions = dashboard.regions
  const active = Boolean(filters.q || filters.region || filters.authority || filters.changeClass || filters.area)

  return (
    <form
      action="/#repository"
      method="get"
      onChange={(event) => {
        if (event.target instanceof HTMLSelectElement) event.currentTarget.requestSubmit()
      }}
      onSubmit={(event) => {
        // keep URLs short: drop empty fields
        for (const field of Array.from(event.currentTarget.elements)) {
          if ((field instanceof HTMLSelectElement || field instanceof HTMLInputElement) && field.name && !field.value) {
            field.disabled = true
          }
        }
      }}
      className="flex flex-wrap items-center gap-2"
    >
      {filters.state ? <input type="hidden" name="state" value={filters.state} /> : null}
      <label className="relative min-w-50 flex-1">
        <span className="sr-only">Search by title, reference or regulator</span>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Search publications"
          className={`${CONTROL} w-full pl-9`}
        />
      </label>

      <Picker
        name="region"
        label="Country"
        value={filters.region}
        allLabel="All countries"
        options={regions.map((region) => ({
          value: region,
          label: region === "OTHER" ? "Other" : (REGION_LABEL[region as keyof typeof REGION_LABEL] ?? region),
        }))}
      />
      <Picker
        name="authority"
        label="Regulator"
        value={filters.authority}
        allLabel="All regulators"
        options={dashboard.authorities.map((authority) => ({ value: authority, label: authority }))}
      />
      <Picker
        name="area"
        label="Business area"
        value={filters.area}
        allLabel="All business areas"
        options={dashboard.businessAreas.map((area) => ({ value: area, label: area }))}
      />
      <Picker
        name="changeClass"
        label="Type of change"
        value={filters.changeClass}
        allLabel="All change types"
        options={dashboard.changeClasses.map((value) => ({ value, label: CHANGE_CLASS[value]?.short ?? value }))}
      />
      <Picker name="sort" label="Sort by" value={filters.sort ?? "published"} options={SORTS} />

      {active ? (
        <Link
          href={filters.state ? `/?state=${filters.state}#repository` : "/#repository"}
          className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-4" aria-hidden />
          Clear
        </Link>
      ) : null}
      <button type="submit" className="sr-only">
        Search
      </button>
    </form>
  )
}
