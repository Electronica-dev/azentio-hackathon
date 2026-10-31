import type { Metadata } from "next"
import { Suspense } from "react"

import { Dashboard } from "@/components/dashboard/dashboard"
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton"
import { normalizeFilters } from "@/lib/domain"
import { getRegulaState } from "@/lib/state"

export const metadata: Metadata = {
  title: "Regulatory Intelligence Dashboard · Regula",
  description:
    "Regulatory developments across Saudi Arabia, the UAE, India and South Africa — by country, regulator, publication date, business area and change classification.",
}

/**
 * Dashboard shell. `searchParams` is a request-time API under Cache Components,
 * so the filtered view streams behind `<Suspense>` while the static shell
 * renders immediately (see app/getting-started/08-caching).
 */
export default function Page(props: PageProps<"/">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardView searchParams={props.searchParams} />
    </Suspense>
  )
}

async function DashboardView({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
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
