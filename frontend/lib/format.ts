/**
 * Formatting helpers. Everything here is deterministic on the server and the
 * client so markup never drifts during hydration — no `Intl` locale defaults,
 * no "now" reads, no relative-time strings.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "2026-10-30" → "30 Oct 2026". Unparseable values fall back to "not stated" (R2). */
export function formatDate(value?: string | null): string {
  if (!value) return "not stated"
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return value
  const [, year, month, day] = match
  const monthName = MONTHS[Number(month) - 1]
  if (!monthName) return value
  return `${Number(day)} ${monthName} ${year}`
}

/** "2026-10-31T11:30:00+05:30" → "31 Oct 2026, 11:30". Keeps the source's own offset. */
export function formatDateTime(value?: string | null): string {
  if (!value) return "not stated"
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(value)
  if (!match) return formatDate(value)
  return `${formatDate(match[1])}, ${match[2]}`
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/** Compact integer formatting without locale dependence: 1234 → "1,234". */
export function formatNumber(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}
