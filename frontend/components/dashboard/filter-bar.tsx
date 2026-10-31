import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CHANGE_CLASS } from "@/lib/domain"
import type { Dashboard, Filters, SortKey } from "@/lib/domain"
import { plural } from "@/lib/format"

const ALL = "__all__"

const SORTS: { value: SortKey; label: string }[] = [
  { value: "published", label: "Newest publication" },
  { value: "effective", label: "Effective date" },
  { value: "obligations", label: "Most obligations" },
  { value: "title", label: "Title A–Z" },
]

/** A labelled native <select> for the server-rendered form. */
function Field({
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
  allLabel: string
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ALL}
        className="h-7 w-full min-w-0 rounded-md border border-input bg-input/20 px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
      >
        <option value={ALL}>{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * Filters compose in the URL (`?q=&region=&authority=&changeClass=&area=&state=&sort=`)
 * so the view is shareable and server-rendered. Change class and sort use the
 * shadcn Select; their value round-trips through a hidden input so the form
 * still works as a plain GET submission without JavaScript.
 */
export function FilterBar({
  dashboard,
  filters,
  stateLabel,
}: {
  dashboard: Dashboard
  filters: Filters
  stateLabel?: string
}) {
  const authorities = dashboard.authorities
  const regions = dashboard.regions.filter((region) => region !== "OTHER")
  const hasRegionOther = dashboard.regions.includes("OTHER")

  const changeClassItems = [
    { value: ALL, label: "All classifications" },
    ...dashboard.changeClasses.map((value) => ({ value, label: CHANGE_CLASS[value]?.label ?? value })),
  ]
  const sortItems = SORTS.map((sort) => ({ value: sort.value, label: sort.label }))

  const active = Boolean(
    filters.q || filters.region || filters.authority || filters.changeClass || filters.area || filters.state,
  )

  return (
    <form action="/" method="get" className="grid gap-2">
      {filters.state ? <input type="hidden" name="state" value={filters.state} /> : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))_auto]">
        <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Search</span>
          <Input
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Title, reference, authority or region"
            className="h-7"
          />
        </label>

        <Field
          name="region"
          label="Country"
          value={filters.region}
          allLabel="All countries"
          options={[
            ...regions.map((region) => ({ value: region, label: region })),
            ...(hasRegionOther ? [{ value: "OTHER", label: "Other" }] : []),
          ]}
        />

        <Field
          name="authority"
          label="Regulator"
          value={filters.authority}
          allLabel="All regulators"
          options={authorities.map((authority) => ({ value: authority, label: authority }))}
        />

        <Field
          name="area"
          label="Business area"
          value={filters.area}
          allLabel="All areas"
          options={dashboard.businessAreas.map((area) => ({ value: area, label: area }))}
        />

        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Change classification
          </span>
          <Select name="changeClass" defaultValue={filters.changeClass ?? ALL} items={changeClassItems}>
            <SelectTrigger size="sm" className="h-7 w-full" aria-label="Change classification">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {changeClassItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sort by</span>
          <div className="flex items-center gap-1">
            <Select name="sort" defaultValue={filters.sort ?? "published"} items={sortItems}>
              <SelectTrigger size="sm" className="h-7 w-full" aria-label="Sort by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" className="shrink-0">
              Apply
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="font-semibold text-foreground">Showing</span>
          <span>{stateLabel ?? "all publications"}</span>
        </span>
        <span aria-hidden>·</span>
        <span>{plural(dashboard.rows.length, "publication")} in repository</span>
        <span aria-hidden>·</span>
        <span>{plural(dashboard.authorities.length, "regulator")}</span>
        <span aria-hidden>·</span>
        <span>{plural(dashboard.regions.length, "region")}</span>
        {active ? (
          <Link
            href={filters.state ? `/?state=${filters.state}#repository` : "/#repository"}
            className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-primary hover:underline"
          >
            Clear filters
          </Link>
        ) : null}
      </div>
    </form>
  )
}
