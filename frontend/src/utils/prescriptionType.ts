/** Sync checkbox flags from Prescription Type (medication_type) — single source of truth in UI. */

export function flagsFromPrescriptionType(medicationType?: string | null): {
  is_prn: boolean
  is_long_acting: boolean
} {
  const type = (medicationType || '').trim()
  return {
    is_prn: type === 'PRN',
    is_long_acting: type === 'Long Acting Medicine',
  }
}

export function isLongActingPrescriptionType(medicationType?: string | null): boolean {
  return (medicationType || '').trim() === 'Long Acting Medicine'
}

export function isPrnPrescriptionType(medicationType?: string | null): boolean {
  return (medicationType || '').trim() === 'PRN'
}

/** Map Prescription Type to API fields (is_prn, is_long_acting_medicine) before save. */
export function normalizeMedicationOrderForSave<T extends Record<string, unknown>>(
  row: T & { medication_type?: string | null; is_prn?: boolean; is_long_acting?: boolean }
): T & { is_prn: boolean; is_long_acting_medicine: boolean } {
  const flags = flagsFromPrescriptionType(row.medication_type)
  const { is_long_acting: _la, is_prn: _prn, ...rest } = row
  return {
    ...(rest as T),
    is_prn: flags.is_prn,
    is_long_acting_medicine: flags.is_long_acting,
  }
}
