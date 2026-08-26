/** Strip everything except digits (0–9). */
export function digitsOnlyPhone(value: string): string {
  return String(value || '').replace(/\D/g, '')
}

/** Empty is allowed; otherwise must be digits only. */
export function isNumericPhone(value: string | null | undefined): boolean {
  const v = String(value || '').trim()
  if (!v) return true
  return /^\d+$/.test(v)
}

export const PATIENT_PHONE_FIELD_LABELS: Record<string, string> = {
  mobile: 'Mobile',
  phone: 'Phone',
  alternative_mobile_no_1: 'Alternative Mobile No',
  alternative_mobile_no_2: 'Alternative Mobile No 2',
  emergency_contact_phone: 'Emergency Contact Phone',
  mobile_no: 'Relative Mobile No',
}

/** First invalid filled phone field, or null if all OK. */
export function firstInvalidPatientPhone(
  fields: Record<string, string | null | undefined>
): string | null {
  for (const [key, label] of Object.entries(PATIENT_PHONE_FIELD_LABELS)) {
    if (!(key in fields)) continue
    if (!isNumericPhone(fields[key])) return label
  }
  return null
}
