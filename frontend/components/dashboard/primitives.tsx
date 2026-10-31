import type { ComponentProps } from "react"

import { Badge } from "@/components/ui/badge"
import { changeClassChip, regionChipClass } from "@/lib/domain"
import type { Chip as ChipToken } from "@/lib/domain"
import type { Region } from "@/lib/types"
import { cn } from "@/lib/utils"

/** A shadcn Badge carrying a domain chip (label + tone). Neutral fallback for unknown enums. */
export function Chip({ chip, className, ...props }: { chip: ChipToken } & Omit<ComponentProps<typeof Badge>, "variant">) {
  return (
    <Badge variant="outline" className={cn("h-6 px-2.5 text-xs", chip.className, "font-medium", className)} {...props}>
      {chip.label}
    </Badge>
  )
}

export function ChangeClassBadge({
  value,
  short,
  className,
}: {
  value?: string | null
  /** Use the short label ("Modified") instead of the full one. */
  short?: boolean
  className?: string
}) {
  if (!value) {
    return (
      <Badge variant="outline" className="h-6 border-dashed border-border bg-transparent px-2.5 text-xs text-muted-foreground">
        Unclassified
      </Badge>
    )
  }
  const chip = changeClassChip(value)
  return <Chip chip={short ? { ...chip, label: chip.short } : chip} className={className} />
}

export function RegionBadge({ region, className }: { region: Region | "OTHER"; className?: string }) {
  return (
    <Badge variant="outline" className={cn(regionChipClass(region), "font-semibold tracking-wide", className)}>
      {region === "OTHER" ? "Other" : region}
    </Badge>
  )
}

const KIND_TONE: Record<string, string> = {
  requirement: "text-foreground",
  prohibition: "text-rose-600 dark:text-rose-300",
  periodic: "text-sky-700 dark:text-sky-300",
  threshold: "text-amber-700 dark:text-amber-300",
  reporting: "text-violet-700 dark:text-violet-300",
  recordkeeping: "text-teal-700 dark:text-teal-300",
  consent: "text-indigo-700 dark:text-indigo-300",
  governance: "text-fuchsia-700 dark:text-fuchsia-300",
  verification: "text-emerald-700 dark:text-emerald-300",
  removal: "text-rose-700 dark:text-rose-300",
}

/** Obligation kind / modality / applicability pill — small, neutral by default. */
export function Tag({
  children,
  className,
  title,
}: {
  children: React.ReactNode
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  )
}

export function kindClass(kind: string): string {
  return KIND_TONE[kind] ?? "text-foreground"
}

export function SectionHeading({
  title,
  hint,
  action,
  className,
}: {
  title: React.ReactNode
  hint?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="font-heading text-lg font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
