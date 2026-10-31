import Link from "next/link"

import { cn } from "@/lib/utils"

export type Section = "home" | "regulatory" | "organisation" | "assessments"

const LINKS: { key: Section; href: string; label: string }[] = [
  { key: "home", href: "/", label: "Home" },
  { key: "regulatory", href: "/regulatory", label: "Regulatory" },
  { key: "organisation", href: "/organisation", label: "Organisation" },
  { key: "assessments", href: "/assessments", label: "Assessments" },
]

/** Main navigation. The page says which section it is in, so this stays static. */
export function NavLinks({ active }: { active?: Section }) {
  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {LINKS.map((link) => (
        <Link
          key={link.key}
          href={link.href}
          aria-current={active === link.key ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            active === link.key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
