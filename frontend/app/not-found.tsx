import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-3 px-4 py-16">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">404</p>
      <h1 className="font-heading text-xl font-semibold tracking-tight">Publication not found</h1>
      <p className="text-xs text-muted-foreground">
        No publication in the repository has this identifier. It may have been superseded, or the link may be out of
        date.
      </p>
      <Button size="sm" render={<Link href="/#repository" />}>
        Back to the dashboard
      </Button>
    </div>
  )
}
