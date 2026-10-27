export interface AdmissionDateFields {
  admitted_datetime?: string | null
  admission_date?: string | null
  admission_time?: string | null
  scheduled_date?: string | null
}

function parseDate(value: string): Date | null {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Prefer admitted_datetime; fall back to Oracle import admission_date + admission_time. */
export function resolveAdmissionDateTime(record: AdmissionDateFields): Date | null {
  if (record.admitted_datetime) {
    const dt = parseDate(record.admitted_datetime)
    if (dt) return dt
  }

  const date = (record.admission_date || '').trim()
  if (!date) return null

  const time = (record.admission_time || '').trim()
  if (time) {
    const withSpace = parseDate(`${date} ${time}`)
    if (withSpace) return withSpace
    const withT = parseDate(`${date}T${time}`)
    if (withT) return withT
  }

  return parseDate(date)
}

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
}

const DATE_TIME_OPTS: Intl.DateTimeFormatOptions = {
  ...DATE_OPTS,
  hour: '2-digit',
  minute: '2-digit',
}

function hasTimeComponent(value: string): boolean {
  return /[T\s]\d{1,2}:\d{2}/.test(value) || /:\d{2}/.test(value)
}

/** Format a date/datetime string for display — no seconds. */
export function formatDateTimeDisplay(value?: string | null, fallback = '—'): string {
  const raw = (value || '').trim()
  if (!raw) return fallback

  const dt = parseDate(raw)
  if (!dt) return raw

  if (!hasTimeComponent(raw)) {
    return dt.toLocaleDateString('en-GB')
  }

  return dt.toLocaleString(undefined, DATE_TIME_OPTS)
}

export interface AdmissionSpanFields extends AdmissionDateFields {
  discharge_datetime?: string | null
  /** Planned discharge date from a draft Discharge (Discharge in Progress). */
  draft_discharge_date?: string | null
  status?: string | null
  /** Legacy Oracle SPEND_DAYS — inclusive of the admission and discharge day. */
  spend_daysduration?: string | number | null
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Inclusive calendar day count: the first and the last day both count (end − start + 1).
 * Same-day admission → discharge is 1 day.
 */
export function inclusiveCalendarDaysBetween(start: Date, end: Date): number {
  const ms = startOfLocalDay(end).getTime() - startOfLocalDay(start).getTime()
  return Math.max(Math.round(ms / 86_400_000) + 1, 1)
}

/** Legacy SPEND_DAYS when present and positive; null when missing / not a number. */
function storedSpendDays(record: AdmissionSpanFields): number | null {
  const raw = record.spend_daysduration
  if (raw === null || raw === undefined) return null
  const days = typeof raw === 'number' ? raw : Number.parseInt(String(raw).trim(), 10)
  return Number.isFinite(days) && days > 0 ? days : null
}

/**
 * Stay days for the admission list Days column.
 * - Legacy rows: display the imported SPEND_DAYS exactly as stored — never recalculated
 * - No stored days → calculate, counting the admission day and the last day (+1)
 *   - Draft discharge with a discharge date → discharge date − admission date + 1
 *   - Completed stay → discharge datetime − admission date + 1
 *   - Still Admitted (no planned discharge date) → today − admission date + 1
 * - No admission date → null
 */
export function resolveAdmissionStayDays(record: AdmissionSpanFields): number | null {
  // Legacy Oracle imports carry the authoritative inclusive SPEND_DAYS: show it as-is.
  const stored = storedSpendDays(record)
  if (stored !== null) return stored

  const start = resolveAdmissionDateTime(record)
  if (!start) return null

  const draftEnd = (record.draft_discharge_date || '').trim()
  if (draftEnd) {
    const end = parseDate(draftEnd)
    if (end) return inclusiveCalendarDaysBetween(start, end)
  }

  const dischargedEnd = (record.discharge_datetime || '').trim()
  if (dischargedEnd) {
    const end = parseDate(dischargedEnd)
    if (end) return inclusiveCalendarDaysBetween(start, end)
  }

  const status = (record.status || '').trim()
  const isLive = status === 'Admitted' || status === 'Discharge Scheduled'
  if (isLive) return inclusiveCalendarDaysBetween(start, new Date())

  return null
}

/** Format date only (no time) for display. */
export function formatDateOnlyDisplay(value?: string | null, fallback = '—'): string {
  const raw = (value || '').trim()
  if (!raw) return fallback
  const dt = parseDate(raw)
  if (!dt) return raw
  return dt.toLocaleDateString('en-GB')
}

/** Admission date, or admission → discharge when discharged / discharge in progress (dates only). */
export function formatAdmissionDateSpan(record: AdmissionSpanFields): string {
  const start = formatAdmissionDate(record, { includeTime: false, fallback: '' })
  if (!start) return ''

  const discharge = (record.discharge_datetime || record.draft_discharge_date || '').trim()
  if (discharge) {
    const end = formatDateOnlyDisplay(discharge, '')
    if (end) return `${start} → ${end}`
  }

  return start
}

export function formatAdmissionDate(
  record: AdmissionDateFields,
  opts?: { includeTime?: boolean; fallback?: string }
): string {
  const dt = resolveAdmissionDateTime(record)
  if (!dt) return opts?.fallback ?? '—'

  if (opts?.includeTime === false) {
    return dt.toLocaleDateString('en-GB')
  }

  const hasTime =
    dt.getHours() !== 0 ||
    dt.getMinutes() !== 0 ||
    dt.getSeconds() !== 0 ||
    Boolean((record.admission_time || '').trim()) ||
    Boolean(record.admitted_datetime?.includes(':'))

  if (!hasTime) {
    return dt.toLocaleDateString('en-GB')
  }

  return dt.toLocaleString(undefined, DATE_TIME_OPTS)
}
