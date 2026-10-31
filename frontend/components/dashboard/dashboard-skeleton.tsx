import { AppHeader } from "./app-header"

/** Static-shell fallback shown while `/api/state` resolves. Mirrors the dashboard layout. */
export function DashboardSkeleton() {
  return (
    <>
      <AppHeader active="regulatory" />
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6" aria-busy="true" aria-live="polite">
        <div className="flex items-end justify-between gap-4">
          <div className="grid gap-2">
            <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
            <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted" />
          </div>
          <div className="h-9 w-56 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-9 animate-pulse rounded-lg bg-muted" />
        <div className="h-96 animate-pulse rounded-xl bg-muted/70" />
        <span className="sr-only">Loading publications…</span>
      </main>
    </>
  )
}
