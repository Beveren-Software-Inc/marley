export const NURSING_SHIFTS = ['Morning', 'Evening', 'Night'] as const

export type NursingShift = (typeof NURSING_SHIFTS)[number]

/** 06:00–13:59 Morning, 14:00–21:59 Evening, 22:00–05:59 Night */
const NURSING_SHIFT_WINDOWS: ReadonlyArray<{ label: NursingShift; start: number; end: number }> = [
  { label: 'Morning', start: 6, end: 14 },
  { label: 'Evening', start: 14, end: 22 },
  { label: 'Night', start: 22, end: 6 },
]

function hourInWindow(hour: number, start: number, end: number): boolean {
  if (start < end) return hour >= start && hour < end
  return hour >= start || hour < end
}

function parseHourFromTime(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  let clock = trimmed
  if (clock.includes(' ')) clock = clock.split(' ').pop() || clock
  if (clock.includes('.')) clock = clock.split('.')[0]
  const parts = clock.split(':')
  if (parts.length < 2) return null
  const hour = Number(parts[0])
  return Number.isFinite(hour) ? hour : null
}

/** Infer nursing shift from an HH:MM or HH:MM:SS time string. */
export function getNursingShiftFromTime(time?: string | null, fallbackHour?: number): NursingShift {
  const hour = time ? parseHourFromTime(time) : fallbackHour ?? new Date().getHours()
  const resolvedHour = hour ?? new Date().getHours()
  for (const window of NURSING_SHIFT_WINDOWS) {
    if (hourInWindow(resolvedHour, window.start, window.end)) return window.label
  }
  return 'Morning'
}

/** Infer nursing shift from the current clock time. */
export function getCurrentNursingShift(): NursingShift {
  return getNursingShiftFromTime()
}

export function formatNursingNoteTimestamp(time?: string | null): string {
  if (time) {
    let value = time.trim()
    if (value.includes(' ')) {
      value = value.split(' ').pop() || value
    }
    if (value.includes('.')) {
      value = value.split('.')[0]
    }
    const parts = value.split(':')
    if (parts.length >= 2) {
      const hours = parts[0].padStart(2, '0')
      const minutes = parts[1].padStart(2, '0')
      return `${hours}:${minutes}`
    }
  }
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

export function appendNursingNoteLine(
  existing: string | null | undefined,
  newText: string,
  time?: string | null
): string {
  const trimmed = newText.trim()
  if (!trimmed) return (existing || '').trim()
  const line = `[${formatNursingNoteTimestamp(time)}] ${trimmed}`
  const base = (existing || '').trim()
  return base ? `${base}\n${line}` : line
}

export const NURSING_NOTE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000

export const MAIN_NURSING_NOTE_EDIT_LOCKED_MESSAGE =
  'This nursing note can no longer be edited. Notes are locked 24 hours after the last update.'

/** True when a nursing note is still within the 24-hour edit window. */
export function isMainNursingNoteEditable(modified?: string | null): boolean {
  if (!modified) return true
  const modifiedAt = new Date(modified).getTime()
  if (Number.isNaN(modifiedAt)) return true
  return Date.now() - modifiedAt < NURSING_NOTE_EDIT_WINDOW_MS
}

export const CLINICAL_NOTE_EDIT_LOCKED_MESSAGE =
  'This clinical note can no longer be edited. Notes are locked 24 hours after creation.'

/**
 * True when a clinical/therapy note may still be edited.
 * When `enforce24h` is false (Healthcare Settings unchecked), always editable.
 */
export function isClinicalNoteEditableWithin24h(
  creation?: string | null,
  enforce24h: boolean = true
): boolean {
  if (!enforce24h) return true
  if (!creation) return true
  const createdAt = new Date(creation).getTime()
  if (Number.isNaN(createdAt)) return true
  return Date.now() - createdAt < NURSING_NOTE_EDIT_WINDOW_MS
}
