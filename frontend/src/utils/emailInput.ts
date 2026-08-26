/** Empty is allowed; otherwise must look like a normal email address. */
export function isValidEmail(value: string | null | undefined): boolean {
  const v = String(value || '').trim()
  if (!v) return true
  // Practical check: local@domain.tld (no spaces)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}
