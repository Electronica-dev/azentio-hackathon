import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"

import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton"
import { PublicationDetail } from "@/components/dashboard/publication-detail"
import { buildDetail } from "@/lib/domain"
import { getRegulaState } from "@/lib/state"

type Params = Promise<{ id: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params
  const { state } = await getRegulaState()
  const source = state.sources.find((candidate) => candidate.id === decodeURIComponent(id))
  if (!source) return { title: "Publication not found · Regula" }
  return {
    title: `${source.short_title || source.title} · Regula`,
    description: source.summary,
  }
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <PublicationView params={params} />
    </Suspense>
  )
}

async function PublicationView({ params }: { params: Params }) {
  const [{ id }, { state }] = await Promise.all([params, getRegulaState()])
  const detail = buildDetail(state, decodeURIComponent(id))
  if (!detail) notFound()

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-4">
      <PublicationDetail detail={detail} state={state} />
    </div>
  )
}
