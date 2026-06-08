/** Format a Date for `<input type="datetime-local">` in the user's local timezone. */
export function toDatetimeLocalValue(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** Normalize Frappe / ISO datetime strings for datetime-local inputs. */
export function parseToDatetimeLocalValue(value?: string | null): string {
  if (!value?.trim()) return toDatetimeLocalValue()
  const normalized = value.trim().replace(' ', 'T')
  if (normalized.length >= 16) return normalized.slice(0, 16)
  return toDatetimeLocalValue()
}

/** Convert datetime-local value to Frappe datetime (`YYYY-MM-DD HH:mm:ss`). */
export function fromDatetimeLocalValue(value?: string): string {
  if (!value?.trim()) {
    const now = toDatetimeLocalValue()
    return `${now.replace('T', ' ')}:00`
  }
  let s = value.trim()
  if (s.includes('T')) s = s.replace('T', ' ')
  if (s.length === 16) s = `${s}:00`
  return s
}
