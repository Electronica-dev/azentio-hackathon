import Link from "next/link"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { areaLabel, CHANGE_CLASS, DASHBOARD_STATE, effectiveLabel, reviewStateChip } from "@/lib/domain"
import type { SourceRow } from "@/lib/domain"
import type { ChangeClass } from "@/lib/types"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"

import { ChangeClassBadge, Chip, RegionBadge, Tag } from "./primitives"

function Deadline({ row }: { row: SourceRow }) {
  const days = row.source.days_left
  if (typeof days !== "number") return <span className="text-muted-foreground">–</span>
  const urgent = days >= 0 && days < 45
  const overdue = days < 0
  return (
    <span className="inline-flex flex-col">
      <span className={cn("font-semibold tabular-nums", overdue && "text-destructive", urgent && "text-amber-700 dark:text-amber-300")}>
        {overdue ? `${Math.abs(days)} days overdue` : `${days} days`}
      </span>
      <span className="text-[10px] text-muted-foreground">{overdue ? "deadline passed" : "to comply"}</span>
    </span>
  )
}

function RelationshipCell({ row }: { row: SourceRow }) {
  const relationship = row.relationship
  const unresolved = row.state === "unresolved"
  const confidence =
    typeof relationship.confidence === "number" ? `${Math.round(relationship.confidence * 100)}% match` : null

  if (unresolved) {
    return (
      <span className="inline-flex flex-col">
        <span className="font-medium text-fuchsia-700 dark:text-fuchsia-300">Unresolved</span>
        <span className="text-[10px] text-muted-foreground">
          {confidence ?? "no prior"} {relationship.prior_source_id ? "· candidate only" : "· no prior found"}
        </span>
      </span>
    )
  }
  if (relationship.status === "linked") {
    return (
      <span className="inline-flex flex-col">
        <span className="font-medium">Linked to prior</span>
        <span className="text-[10px] text-muted-foreground">{confidence ?? "confidence not reported"}</span>
      </span>
    )
  }
  if (relationship.status === "standalone") {
    return (
      <span className="inline-flex flex-col">
        <span className="font-medium">Standalone</span>
        <span className="text-[10px] text-muted-foreground">no prior regulation</span>
      </span>
    )
  }
  return (
    <span className="inline-flex flex-col">
      <span className="font-medium">{relationship.status}</span>
      {relationship.rationale ? (
        <span className="line-clamp-1 max-w-[180px] text-[10px] text-muted-foreground">{relationship.rationale}</span>
      ) : null}
    </span>
  )
}

/**
 * The searchable repository (R6) as a sortable table: one row per publication
 * with all five dashboard facets plus the four document states (R17/R18).
 * Every row opens the publication (R19).
 */
export function RepositoryTable({ rows }: { rows: SourceRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
        <p className="text-sm font-medium">No publications match these filters</p>
        <p className="mt-1 text-xs text-muted-foreground">Clear a filter or search term to widen the view.</p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-1">Publication</TableHead>
          <TableHead>Country</TableHead>
          <TableHead>Regulator</TableHead>
          <TableHead>Published</TableHead>
          <TableHead>Effective</TableHead>
          <TableHead>Business area</TableHead>
          <TableHead>Change classification</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Prior regulation</TableHead>
          <TableHead className="text-right">Obligations</TableHead>
          <TableHead className="pr-1">Deadline</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const { source } = row
          const href = `/publications/${encodeURIComponent(source.id)}`
          const state = DASHBOARD_STATE[row.state]
          const aiTagged = row.obligations.some((obligation) => (obligation.applicability ?? []).includes("ai"))
          return (
            <TableRow key={source.id} className="align-top">
              <TableCell className="w-[26%] max-w-[340px] whitespace-normal pl-1">
                <Link href={href} className="group block">
                  <span className="block font-medium leading-snug group-hover:text-primary group-hover:underline">
                    {source.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="font-mono">{source.ref}</span>
                    <span aria-hidden>·</span>
                    <span>{row.docType}</span>
                    {aiTagged ? (
                      <Tag className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                        AI
                      </Tag>
                    ) : null}
                  </span>
                </Link>
              </TableCell>
              <TableCell>
                <RegionBadge region={row.region} />
              </TableCell>
              <TableCell className="font-medium">{row.authority}</TableCell>
              <TableCell className="tabular-nums">{formatDate(source.published)}</TableCell>
              <TableCell className="tabular-nums">
                <span className={cn(!source.effective && "italic text-muted-foreground")}>{effectiveLabel(source)}</span>
              </TableCell>
              <TableCell className="max-w-[170px] whitespace-normal">
                {row.areas.length ? (
                  <span className="flex flex-wrap gap-1">
                    {row.areas.map((area) => (
                      <Tag key={area} className={area === "ai" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" : undefined}>
                        {areaLabel(area)}
                      </Tag>
                    ))}
                  </span>
                ) : (
                  <span className="text-[10px] italic text-muted-foreground">not extracted</span>
                )}
              </TableCell>
              <TableCell>
                {row.changeClass ? (
                  <ChangeClassBadge value={row.changeClass} />
                ) : row.state === "amendment" ? (
                  <span className="text-[10px] italic text-muted-foreground">class not set</span>
                ) : (
                  <ChangeClassBadge value={null} />
                )}
              </TableCell>
              <TableCell>
                <span className="flex flex-col gap-1">
                  <Chip chip={state} />
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Chip chip={reviewStateChip(source)} className="h-4 px-1.5 text-[9px]" />
                  </span>
                </span>
              </TableCell>
              <TableCell className="max-w-[190px] whitespace-normal">
                <RelationshipCell row={row} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <Link href={href} className="font-semibold hover:text-primary hover:underline">
                  {row.obligations.length}
                </Link>
                <div className="text-[10px] text-muted-foreground">{row.changedClauses.length} changed clauses</div>
              </TableCell>
              <TableCell className="pr-1">
                <Deadline row={row} />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

/** Legend tying each change-class swatch to its meaning (R15). */
export function ChangeClassLegend({ classes }: { classes: ChangeClass[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
      <span className="font-semibold uppercase tracking-wide">Classifications</span>
      {classes.map((value) => (
        <Link
          key={value}
          href={`/?changeClass=${value}#repository`}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ChangeClassBadge value={value} className="h-4 px-1.5 text-[9px]" />
          <span className="max-w-[150px] truncate">{CHANGE_CLASS[value]?.label ?? value}</span>
        </Link>
      ))}
    </div>
  )
}
