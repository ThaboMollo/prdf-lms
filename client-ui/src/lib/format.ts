export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 2
  }).format(value)
}

const LONG_DATE = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
})

const TIME_OF_DAY = new Intl.DateTimeFormat('en-ZA', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * A bare calendar date ("2026-10-24", what a Postgres `date` column returns
 * over the Supabase client) is parsed by Date as UTC midnight, which renders
 * as the previous day in any timezone behind UTC. Build it in local time
 * instead so a due date stays the day the database says it is. Anything with
 * a time component is a real instant and is rendered in the viewer's timezone.
 */
function parseValue(value: string | Date | null | undefined): { date: Date; dateOnly: boolean } | null {
  if (!value) return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : { date: value, dateOnly: false }
  }

  if (DATE_ONLY.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return { date: new Date(year, month - 1, day), dateOnly: true }
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : { date, dateOnly: false }
}

/** "24 October 2026" — the readable form used everywhere a date is shown. */
export function formatDate(value: string | Date | null | undefined): string {
  const parsed = parseValue(value)
  if (!parsed) return '-'
  return LONG_DATE.format(parsed.date)
}

/**
 * "24 October 2026, 22:00" — the readable form for an instant (uploaded,
 * paid, status changed), where the time of day is part of the record. A
 * value carrying no time of day falls back to the date on its own.
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  const parsed = parseValue(value)
  if (!parsed) return '-'
  if (parsed.dateOnly) return LONG_DATE.format(parsed.date)
  return `${LONG_DATE.format(parsed.date)}, ${TIME_OF_DAY.format(parsed.date)}`
}
