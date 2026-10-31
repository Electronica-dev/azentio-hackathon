"use client"

import { RadioTowerIcon } from "lucide-react"
import { useState, useTransition } from "react"

import { runDiscovery } from "@/app/actions"
import { Button } from "@/components/ui/button"

/**
 * Triggers one monitoring cycle through the server action, reports what the
 * cycle found, and reloads so the dashboard shows the newly discovered items.
 */
export function RunDiscovery() {
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  function run() {
    startTransition(async () => {
      setNote(null)
      const result = await runDiscovery()
      if (!result.ok) {
        setNote(`failed: ${result.message}`)
        return
      }
      setNote(`${result.new} new · ${result.ingested} ingested · ${result.errors} feed errors`)
      window.location.reload()
    })
  }

  return (
    <span className="inline-flex items-center gap-2">
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
      <Button type="button" disabled={pending} onClick={run}>
        <RadioTowerIcon aria-hidden />
        {pending ? "Running…" : "Run monitoring"}
      </Button>
    </span>
  )
}
