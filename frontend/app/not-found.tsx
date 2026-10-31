import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-3 px-6 py-24">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Publication not found</h1>
      <p className="text-sm text-muted-foreground">
        No publication in the repository has this identifier. It may have been superseded, or the link may be out of
        date.
      </p>
      <Button className="mt-2" render={<Link href="/#repository" />}>
        Back to all publications
      </Button>
    </div>
  )
}
