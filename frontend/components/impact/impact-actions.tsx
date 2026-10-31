"use client"

import { PlayIcon, UsersRoundIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { matchOwners, runImpactAnalysis } from "@/app/actions"
import { Button } from "@/components/ui/button"

import { Notice, Select } from "../organisation/org-ui"

/** Pick a publication (or all of them) and run the mapping + gap analysis. */
export function RunAnalysis({ sources }: { sources: { id: string; title: string; obligations: string[] }[] }) {
  const router = useRouter()
  const [choice, setChoice] = useState(sources[0]?.id ?? "")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!sources.length) {
    return <p className="text-sm text-muted-foreground">No publication has extracted obligations yet.</p>
  }
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-72 max-w-full">
          <Select value={choice} onChange={(event) => setChoice(event.target.value)} aria-label="Publication to analyse">
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.obligations.length})
              </option>
            ))}
            {sources.length > 1 ? <option value="__all__">All publications</option> : null}
          </Select>
        </span>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const scope =
                choice === "__all__" ? { obligation_ids: sources.flatMap((s) => s.obligations) } : { regulatory_source_id: choice }
              const result = await runImpactAnalysis(scope)
              if (!result.ok) {
                setError(result.message ?? "Analysis failed.")
                return
              }
              router.push(result.id ? `/impact?analysis=${result.id}` : "/impact")
              router.refresh()
            })
          }
        >
          <PlayIcon aria-hidden />
          {pending ? "Analysing…" : "Run analysis"}
        </Button>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  )
}

/** Re-run the ownership register lookup, e.g. after adding people. */
export function MatchOwners({ analysisId }: { analysisId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="inline-flex items-center gap-2">
      {error ? <span className="text-sm text-destructive">{error}</span> : null}
      <Button
        variant="outline"
        disabled={pending}
        title="Fill unconfirmed owners from the people directory. Confirmed owners are never changed."
        onClick={() =>
          startTransition(async () => {
            const result = await matchOwners(analysisId)
            setError(result.ok ? null : (result.message ?? "Matching failed."))
            if (result.ok) router.refresh()
          })
        }
      >
        <UsersRoundIcon aria-hidden />
        {pending ? "Matching…" : "Match owners"}
      </Button>
    </span>
  )
}
