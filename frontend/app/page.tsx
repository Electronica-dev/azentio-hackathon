import type { Metadata } from "next"
import { CircleAlertIcon } from "lucide-react"
import { Suspense } from "react"

import { AppHeader } from "@/components/dashboard/app-header"
import { Home } from "@/components/home/home"
import { getOverview } from "@/lib/org"

export const metadata: Metadata = {
  title: "Compliance overview · Regula",
  description: "Compliance score, open regulatory gaps, deadlines and missing internal documents at a glance.",
}

export default function Page() {
  return (
    <>
      <AppHeader active="home" />
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Compliance overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Regulatory change, internal documents and ownership in one place.
          </p>
        </div>
        <Suspense fallback={<HomeSkeleton />}>
          <HomeView />
        </Suspense>
      </main>
    </>
  )
}

async function HomeView() {
  const overview = await getOverview()
  if (!overview.ok) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          The overview needs the backend, which is unreachable ({overview.error}). Start it with{" "}
          <code className="font-mono">python backend/serve.py</code> and reload.
        </span>
      </div>
    )
  }
  return <Home overview={overview.data} />
}

function HomeSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" aria-busy="true">
      <div className="h-112 animate-pulse rounded-xl bg-muted" />
      <div className="grid content-start gap-6">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  )
}
