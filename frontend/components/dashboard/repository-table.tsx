import { ChevronRightIcon } from "lucide-react"
import Link from "next/link"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DASHBOARD_STATE, REGION_LABEL } from "@/lib/domain"
import type { SourceRow } from "@/lib/domain"
import { formatDate } from "@/lib/format"
import type { Region } from "@/lib/types"
import { cn } from "@/lib/utils"

import { ChangeClassBadge, Chip } from "./primitives"

function Deadline({ days }: { days?: number | null }) {
  if (typeof days !== "number") return <span className="text-muted-foreground">—</span>
  if (days < 0) return <span className="font-medium text-destructive">{Math.abs(days)}d overdue</span>
  return (
    <span className={cn("tabular-nums", days < 45 && "font-medium text-amber-700 dark:text-amber-300")}>
      {days} days
    </span>
  )
}

/**
 * The searchable repository (R6). One row per publication; the whole row
 * opens the publication (R19). Country and regulator sit under the title,
 * change class and state (R15/R18) get their own columns.
 */
export function RepositoryTable({ rows }: { rows: SourceRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-sm font-medium">No publications match</p>
        <p className="mt-1 text-sm text-muted-foreground">Try a different search or clear the filters.</p>
      </div>
    )
  }

  return (
    <Table className="text-sm">
      <TableHeader className="bg-muted/40">
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-10 pl-4 text-xs font-medium text-muted-foreground">Publication</TableHead>
          <TableHead className="h-10 text-xs font-medium text-muted-foreground">Status</TableHead>
          <TableHead className="h-10 text-xs font-medium text-muted-foreground">Type of change</TableHead>
          <TableHead className="h-10 text-right text-xs font-medium text-muted-foreground">Obligations</TableHead>
          <TableHead className="h-10 text-xs font-medium text-muted-foreground">Deadline</TableHead>
          <TableHead className="h-10 w-8 pr-4" aria-hidden />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const { source } = row
          const country = row.region === "OTHER" ? "Other" : (REGION_LABEL[row.region as Region] ?? row.region)
          return (
            <TableRow key={source.id} className="group relative">
              <TableCell className="max-w-[420px] py-3 pl-4 whitespace-normal">
                <Link
                  href={`/publications/${encodeURIComponent(source.id)}`}
                  className="font-medium leading-snug outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-primary focus-visible:underline"
                >
                  {source.title}
                </Link>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {row.authority} · {country} · {formatDate(source.published)}
                </span>
              </TableCell>
              <TableCell className="py-3">
                <Chip chip={{ ...DASHBOARD_STATE[row.state], label: DASHBOARD_STATE[row.state].short }} />
              </TableCell>
              <TableCell className="py-3">
                {row.changeClass ? (
                  <ChangeClassBadge value={row.changeClass} short />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="py-3 text-right tabular-nums">{row.obligations.length}</TableCell>
              <TableCell className="py-3">
                <Deadline days={source.days_left} />
              </TableCell>
              <TableCell className="py-3 pr-4">
                <ChevronRightIcon className="size-4 text-muted-foreground/50 group-hover:text-foreground" aria-hidden />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
