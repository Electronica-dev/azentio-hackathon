import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"

import { AppHeader } from "@/components/dashboard/app-header"
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton"
import { PublicationDetail } from "@/components/dashboard/publication-detail"
import { buildDetail } from "@/lib/domain"
import { getRegulaState } from "@/lib/state"

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

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

export default function Page({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <PublicationView params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function PublicationView({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ id }, query, { state, origin, degraded }] = await Promise.all([params, searchParams, getRegulaState()])
  const detail = buildDetail(state, decodeURIComponent(id))
  if (!detail) notFound()

  const rawHighlight = Array.isArray(query.highlight) ? query.highlight[0] : query.highlight
  const highlight = rawHighlight ? decodeURIComponent(rawHighlight) : undefined

  return (
    <>
      <AppHeader active="regulatory" origin={origin} degraded={degraded} />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <PublicationDetail detail={detail} state={state} highlight={highlight} />
      </main>
    </>
  )
}
