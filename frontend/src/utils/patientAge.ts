/** Match Healthcare desk Patient form age display (years, months, days). */
export function formatPatientAgeFromDob(dob?: string | null): string | null {
  if (!dob?.trim()) return null

  const birthMs = Date.parse(dob.includes('T') ? dob : `${dob}T00:00:00`)
  if (Number.isNaN(birthMs)) return null

  const nowMs = Date.now()
  if (birthMs > nowMs) return null

  const age = new Date(nowMs - birthMs)
  const years = age.getFullYear() - 1970
  const months = age.getMonth()
  const days = age.getDate()

  return `${years} Year(s) ${months} Month(s) ${days} Day(s)`
}
