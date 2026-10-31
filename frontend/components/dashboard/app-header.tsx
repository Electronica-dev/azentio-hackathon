import { ScaleIcon } from "lucide-react"
import Link from "next/link"

import { cn } from "@/lib/utils"

/** Top bar shared by every page: product name and data-source status. */
export function AppHeader({ origin, degraded }: { origin?: "api" | "fixture"; degraded?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2 font-heading text-sm font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ScaleIcon className="size-4" aria-hidden />
          </span>
          Regula
        </Link>
        {origin ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("size-2 rounded-full", degraded ? "bg-amber-500" : "bg-emerald-500")} aria-hidden />
            {origin === "api" && !degraded ? "Live" : "Offline copy"}
          </span>
        ) : null}
      </div>
    </header>
  )
}
