import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton"

/** Route-level fallback; same skeleton the page uses for its Suspense boundary. */
export default function Loading() {
  return <DashboardSkeleton />
}
