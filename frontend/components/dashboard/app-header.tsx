import { ScaleIcon } from "lucide-react"
import Link from "next/link"

import { cn } from "@/lib/utils"

import { NavLinks, type Section } from "./nav-links"

/** Top bar shared by every page: product name, page navigation and data-source status. */
export function AppHeader({ active, origin, degraded }: { active?: Section; origin?: "api" | "fixture"; degraded?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2 font-heading text-sm font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ScaleIcon className="size-4" aria-hidden />
          </span>
          <span className="hidden sm:inline">Regula</span>
        </Link>
        <NavLinks active={active} />
        {origin ? (
          <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
            <span className={cn("size-2 rounded-full", degraded ? "bg-amber-500" : "bg-emerald-500")} aria-hidden />
            {origin === "api" && !degraded ? "Live" : "Offline copy"}
          </span>
        ) : null}
      </div>
    </header>
  )
}
