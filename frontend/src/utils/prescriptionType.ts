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
  row: T & {
    medication_type?: string | null
    is_prn?: boolean
    is_long_acting?: boolean
    long_acting_frequency?: string | null
    patient_frequency?: string | null
  }
): T & { is_prn: boolean; is_long_acting_medicine: boolean; patient_frequency?: string; long_acting_frequency?: string } {
  const flags = flagsFromPrescriptionType(row.medication_type)
  const { is_long_acting: _la, is_prn: _prn, ...rest } = row
  let patientFrequency: string | undefined =
    rest.patient_frequency != null ? String(rest.patient_frequency).trim() || undefined : undefined
  let longActingFrequency: string | undefined =
    rest.long_acting_frequency != null ? String(rest.long_acting_frequency).trim() || undefined : undefined
  if (flags.is_long_acting) {
    const lf = (longActingFrequency || patientFrequency || 'Weekly').trim()
    longActingFrequency = lf
    patientFrequency = lf
  }
  return {
    ...(rest as T),
    patient_frequency: patientFrequency,
    long_acting_frequency: longActingFrequency,
    is_prn: flags.is_prn,
    is_long_acting_medicine: flags.is_long_acting,
  }
}
