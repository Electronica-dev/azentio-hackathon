import type { Metadata } from "next"
import { CircleAlertIcon } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { AppHeader } from "@/components/dashboard/app-header"
import { AssetsTab } from "@/components/organisation/assets-tab"
import { DocumentsTab } from "@/components/organisation/documents-tab"
import { PeopleTab } from "@/components/organisation/people-tab"
import { getOrg, type OrgSnapshot } from "@/lib/org"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Organisation · Regula",
  description: "Internal policy and control repository: documents, assets and the people who own them.",
}

const TABS = [
  { key: "documents", label: "Documents" },
  { key: "assets", label: "Assets" },
  { key: "people", label: "People" },
] as const

type Tab = (typeof TABS)[number]["key"]

export default function Page(props: PageProps<"/organisation">) {
  return (
    <>
      <AppHeader active="organisation" />
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Organisation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your internal policy and control repository: documents, assets and the people who own them.
          </p>
        </div>
        <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
          <OrgView searchParams={props.searchParams} />
        </Suspense>
      </main>
    </>
  )
}

async function OrgView({ searchParams }: Pick<PageProps<"/organisation">, "searchParams">) {
  const [params, org] = await Promise.all([searchParams, getOrg()])
  const raw = Array.isArray(params.tab) ? params.tab[0] : params.tab
  const tab: Tab = TABS.some((t) => t.key === raw) ? (raw as Tab) : "documents"

  if (!org.ok) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          This page needs the backend, which is unreachable ({org.error}). Start it with{" "}
          <code className="font-mono">python backend/serve.py</code> and reload.
        </span>
      </div>
    )
  }

  const data: OrgSnapshot = org.data
  const counts: Record<Tab, number> = { documents: data.documents.length, assets: data.assets.length, people: data.people.length }
  const people = data.people.map((person) => person.name).sort()
  const departments = Array.from(
    new Set([...data.people.map((p) => p.department), ...data.assets.map((a) => a.team), ...data.documents.map((d) => d.department)].filter(Boolean)),
  ).sort()

  return (
    <div className="grid gap-6">
      <nav aria-label="Sections" className="flex gap-6 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/organisation?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors",
              tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{counts[t.key]}</span>
          </Link>
        ))}
      </nav>

      {tab === "documents" ? (
        <DocumentsTab documents={data.documents} categories={data.categories} people={people} departments={departments} />
      ) : tab === "assets" ? (
        <AssetsTab assets={data.assets} types={data.asset_types} people={people} departments={departments} />
      ) : (
        <PeopleTab people={data.people} departments={departments} />
      )}
    </div>
  )
}
