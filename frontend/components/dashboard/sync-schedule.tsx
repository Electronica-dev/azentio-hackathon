"use client"

import { TimerIcon } from "lucide-react"
import { useEffect, useState, useTransition } from "react"

import { getSyncSchedule, setSyncSchedule, type SyncSchedule } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDateTime } from "@/lib/format"

const OFF = "off"
const CUSTOM = "custom"

const PRESETS = [
  { value: OFF, label: "Manual only" },
  { value: "*/15 * * * *", label: "Every 15 minutes" },
  { value: "*/30 * * * *", label: "Every 30 minutes" },
  { value: "0 * * * *", label: "Hourly" },
  { value: "0 */6 * * *", label: "Every 6 hours" },
  { value: "0 9 * * *", label: "Daily at 09:00" },
  { value: "0 9 * * 1-5", label: "Weekdays at 09:00" },
  { value: CUSTOM, label: "Custom cron…" },
]

function presetFor(cron: string | null | undefined): string {
  if (!cron) return OFF
  return PRESETS.some((p) => p.value === cron) ? cron : CUSTOM
}

/**
 * Auto-sync schedule. Reads and sets the backend's cron expression
 * (GET/POST /api/sync/schedule). A runtime change lasts until the backend
 * restarts; REGULA_SYNC_CRON in .env is the persistent default.
 */
export function SyncScheduleControl() {
  const [schedule, setSchedule] = useState<SyncSchedule | null>(null)
  const [choice, setChoice] = useState<string>(OFF)
  const [custom, setCustom] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function apply(next: SyncSchedule) {
    setSchedule(next)
    if (!next.ok) return
    setChoice(presetFor(next.cron))
    setCustom(next.cron ?? "")
  }

  useEffect(() => {
    getSyncSchedule().then(apply)
  }, [])

  const cron = choice === CUSTOM ? custom.trim() : choice
  const dirty = schedule?.ok && cron !== (schedule.cron ?? OFF)

  function save() {
    startTransition(async () => {
      setError(null)
      const result = await setSyncSchedule(cron || OFF)
      if (!result.ok) {
        setError(result.message ?? "could not save schedule")
        return
      }
      apply(result)
    })
  }

  if (!schedule) {
    return <span className="text-xs text-muted-foreground">Loading auto-sync…</span>
  }
  if (!schedule.ok) {
    return (
      <span className="text-xs text-muted-foreground" title={schedule.message}>
        Auto-sync unavailable
      </span>
    )
  }

  const last = schedule.last_run
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <TimerIcon className="size-3.5" aria-hidden />
        Auto-sync
      </span>
      <Select
        value={choice}
        items={PRESETS}
        onValueChange={(value) => {
          setError(null)
          setChoice(value ?? OFF)
        }}
      >
        <SelectTrigger size="sm" className="h-8 w-44 bg-card" aria-label="Auto-sync schedule">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((preset) => (
            <SelectItem key={preset.value} value={preset.value}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {choice === CUSTOM ? (
        <Input
          value={custom}
          onChange={(event) => {
            setError(null)
            setCustom(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && dirty) save()
          }}
          placeholder="min hour day month weekday"
          aria-label="Custom cron expression"
          aria-invalid={error ? true : undefined}
          className="h-8 w-48 bg-card font-mono"
        />
      ) : null}
      {dirty ? (
        <Button type="button" size="sm" variant="outline" disabled={pending || !cron} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </Button>
      ) : null}
      <span className="text-xs text-muted-foreground">
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : schedule.enabled && schedule.next_run ? (
          <>next {formatDateTime(schedule.next_run)}</>
        ) : null}
        {!error && last ? (
          <span title={last.error}>
            {schedule.enabled && schedule.next_run ? " · " : ""}
            last {last.ok ? `${last.new ?? 0} new · ${last.ingested ?? 0} ingested` : "failed"}
          </span>
        ) : null}
      </span>
    </span>
  )
}
