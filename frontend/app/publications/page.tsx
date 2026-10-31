import { Dashboard } from "@/components/dashboard/dashboard"
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton"
import { normalizeFilters } from "@/lib/domain"
import { getRegulaState } from "@/lib/state"
import { Suspense } from "react"

/**
 * Index of publications — same dashboard, but the repository opens focused on
 * the queue given in `?state=`, so `/publications?state=unresolved` is a
 * shareable link to a queue.
 */
export default function Page(props: PageProps<"/publications">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <PublicationIndex searchParams={props.searchParams} />
    </Suspense>
  )
}

async function PublicationIndex({ searchParams }: Pick<PageProps<"/publications">, "searchParams">) {
  const [params, envelope] = await Promise.all([searchParams, getRegulaState()])
  return (
    <Dashboard
      state={envelope.state}
      filters={normalizeFilters(params)}
      degraded={envelope.degraded}
      degradedReason={envelope.error}
      origin={envelope.origin}
    />
  )
}
