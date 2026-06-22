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
    return dt.toLocaleDateString(undefined, DATE_OPTS)
  }

  return dt.toLocaleString(undefined, DATE_TIME_OPTS)
}

export interface AdmissionSpanFields extends AdmissionDateFields {
  discharge_datetime?: string | null
}

/** Format date only (no time) for display. */
export function formatDateOnlyDisplay(value?: string | null, fallback = '—'): string {
  const raw = (value || '').trim()
  if (!raw) return fallback
  const dt = parseDate(raw)
  if (!dt) return raw
  return dt.toLocaleDateString(undefined, DATE_OPTS)
}

/** Admission date, or admission → discharge when discharged (dates only, no time). */
export function formatAdmissionDateSpan(record: AdmissionSpanFields): string {
  const start = formatAdmissionDate(record, { includeTime: false, fallback: '' })
  if (!start) return ''

  const discharge = (record.discharge_datetime || '').trim()
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
    return dt.toLocaleDateString(undefined, DATE_OPTS)
  }

  const hasTime =
    dt.getHours() !== 0 ||
    dt.getMinutes() !== 0 ||
    dt.getSeconds() !== 0 ||
    Boolean((record.admission_time || '').trim()) ||
    Boolean(record.admitted_datetime?.includes(':'))

  if (!hasTime) {
    return dt.toLocaleDateString(undefined, DATE_OPTS)
  }

  return dt.toLocaleString(undefined, DATE_TIME_OPTS)
}
