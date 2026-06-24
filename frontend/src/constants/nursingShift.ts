export const NURSING_SHIFTS = ['Morning', 'Evening', 'Night'] as const

export type NursingShift = (typeof NURSING_SHIFTS)[number]

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
