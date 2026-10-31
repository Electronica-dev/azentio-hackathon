import { CHANGE_CLASS, CHANGE_CLASS_ORDER, type Dashboard } from "@/lib/domain"
import type { ChangeClass } from "@/lib/types"
import { cn } from "@/lib/utils"

import { ChangeClassBadge } from "./primitives"

/**
 * Region × change-class cross-tab. "Developments by country ... and change
 * classification" read as one view: an empty cell is a genuine finding (no
 * development of that class in that region this cycle).
 */
export function RegionMatrix({ dashboard }: { dashboard: Dashboard }) {
  const regions = dashboard.regions
  const classes: ChangeClass[] = dashboard.changeClasses.length ? dashboard.changeClasses : CHANGE_CLASS_ORDER
  const cell = (region: string, changeClass: string) =>
    dashboard.rows.filter((row) => row.region === region && row.changeClass === changeClass).length

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 bg-card px-2 py-1.5 text-left font-medium text-muted-foreground">
              Region
            </th>
            {classes.map((changeClass) => (
              <th key={changeClass} scope="col" className="px-1.5 py-1.5 text-center font-medium text-muted-foreground">
                <span className="inline-block max-w-[86px] text-[10px] leading-tight">
                  {CHANGE_CLASS[changeClass].short}
                </span>
              </th>
            ))}
            <th scope="col" className="px-2 py-1.5 text-right font-medium text-muted-foreground">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {regions.map((region) => {
            const total = dashboard.counts.byRegion[region] ?? 0
            return (
              <tr key={region} className="border-t border-border/60">
                <th scope="row" className="sticky left-0 bg-card px-2 py-1.5 text-left font-semibold">
                  {region === "OTHER" ? "Other" : region}
                </th>
                {classes.map((changeClass) => {
                  const count = cell(region, changeClass)
                  return (
                    <td key={changeClass} className="px-1.5 py-1.5 text-center">
                      <span
                        className={cn(
                          "inline-flex size-5 items-center justify-center rounded-sm tabular-nums",
                          count === 0
                            ? "text-muted-foreground/40"
                            : "bg-primary/10 font-semibold text-primary dark:bg-primary/20",
                        )}
                        aria-label={`${count} ${CHANGE_CLASS[changeClass].label} in ${region}`}
                      >
                        {count || "–"}
                      </span>
                    </td>
                  )
                })}
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap gap-1">
        {classes.map((changeClass) => (
          <ChangeClassBadge key={changeClass} value={changeClass} />
        ))}
      </div>
    </div>
  )
}
