import type { Metadata } from "next"
import { CircleAlertIcon } from "lucide-react"
import { Suspense } from "react"

import { AssessmentWorkspace, EmptyAssessment } from "@/components/assessments/assessment-workspace"
import { AppHeader } from "@/components/dashboard/app-header"
import { getLevel2 } from "@/lib/level2"

export const metadata: Metadata = {
  title: "Impact assessment · Regula",
  description:
    "Maps each regulatory obligation to the internal policy clause that should cover it, states the compliance gap and drafts a reviewable fix.",
}

export default function Page() {
  return (
    <>
      <AppHeader active="assessments" />
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Impact assessment</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Each obligation is mapped to the internal clause that should cover it. The gap states whether the
            requirement is addressed, partially addressed, unsupported or cannot be assessed, and every draft cites the
            clause it changes. Nothing is final until a reviewer approves it.
          </p>
        </div>
        <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
          <AssessmentView />
        </Suspense>
      </main>
    </>
  )
}

async function AssessmentView() {
  const result = await getLevel2()
  if (!result.ok) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          This page needs the backend, which is unreachable ({result.error}). Start it with{" "}
          <code className="font-mono">python backend/serve.py</code> and reload.
        </span>
      </div>
    )
  }

  const { latest, matrix, analyses } = result.data
  if (!latest) return <EmptyAssessment />

  return (
    <div className="grid gap-4">
      {analyses.length > 1 ? (
        <p className="text-[11px] text-muted-foreground">
          {analyses.length} runs on file — showing the latest. Older runs stay available through the API for audit.
        </p>
      ) : null}
      <AssessmentWorkspace analysis={latest} matrix={matrix} />
    </div>
  )
}
