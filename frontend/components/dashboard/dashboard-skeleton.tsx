/** Static-shell fallback shown while `/api/state` resolves. */
export function DashboardSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-4 px-4 py-4" aria-busy="true" aria-live="polite">
      <div className="grid gap-2">
        <div className="h-3 w-56 animate-pulse rounded bg-muted" />
        <div className="h-7 w-96 max-w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-[28rem] max-w-full animate-pulse rounded bg-muted" />
      </div>
      <div className="h-9 animate-pulse rounded-lg bg-muted/60" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-16 animate-pulse rounded-lg bg-muted/60" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-16 animate-pulse rounded-lg bg-muted/60" />
        ))}
      </div>
      <div className="grid gap-2">
        <div className="h-6 w-72 animate-pulse rounded bg-muted/60" />
        <div className="h-80 animate-pulse rounded-lg bg-muted/40" />
      </div>
      <p className="text-xs text-muted-foreground">Loading regulatory state…</p>
    </div>
  )
}
