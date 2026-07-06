/**
 * Portal-wide date formatting: dd/mm/yyyy.
 *
 * Frappe returns dates as "YYYY-MM-DD" and datetimes as "YYYY-MM-DD HH:MM:SS".
 * For those plain strings we reorder the parts directly to avoid any timezone
 * shift (which `new Date('YYYY-MM-DD')` would introduce). Everything else falls
 * back to the Date object using local time.
 */
export function formatDate(value?: string | number | Date | null): string {
  if (value === null || value === undefined || value === '') return ''

  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[3]}/${m[2]}/${m[1]}`
  }

  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return typeof value === 'string' ? value : ''

  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/** dd/mm/yyyy HH:MM (24h). */
export function formatDateTime(value?: string | number | Date | null): string {
  if (value === null || value === undefined || value === '') return ''

  let datePart = ''
  let timeSource: Date | null = null

  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
    if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`
    const dOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (dOnly) return `${dOnly[3]}/${dOnly[2]}/${dOnly[1]}`
  }

  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return typeof value === 'string' ? value : ''
  timeSource = d
  datePart = formatDate(d)
  const hh = String(timeSource.getHours()).padStart(2, '0')
  const min = String(timeSource.getMinutes()).padStart(2, '0')
  return `${datePart} ${hh}:${min}`
}
