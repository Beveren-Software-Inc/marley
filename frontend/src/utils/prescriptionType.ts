/** Sync checkbox flags from Prescription Type (medication_type) — single source of truth in UI. */

/** Canonical Select options on Inpatient Medication Order Entry / Medicine Given. */
const VALID_PRESCRIPTION_TYPES = new Set([
  'STAT',
  'PRN',
  'Regular - Psy (Active)',
  'Regular - Med (Active)',
  'Regular - Psy (Inactive)',
  'Regular - Med (Inactive)',
  'Long Acting Medicine',
  'Future Plan',
])

/** Map common typos / spacing variants to the doctype Select values. */
const PRESCRIPTION_TYPE_ALIASES: Record<string, string> = {
  'Regular -Med (Active)': 'Regular - Med (Active)',
  'Regular -Med(Active)': 'Regular - Med (Active)',
  'Regular - Med(Active)': 'Regular - Med (Active)',
  'Regular -Psy (Active)': 'Regular - Psy (Active)',
  'Regular -Psy(Active)': 'Regular - Psy (Active)',
  'Regular - Psy(Active)': 'Regular - Psy (Active)',
  'Regular -Med (Inactive)': 'Regular - Med (Inactive)',
  'Regular -Med(Inactive)': 'Regular - Med (Inactive)',
  'Regular - Med(Inactive)': 'Regular - Med (Inactive)',
  'Regular -Psy (Inactive)': 'Regular - Psy (Inactive)',
  'Regular -Psy(Inactive)': 'Regular - Psy (Inactive)',
  'Regular - Psy(Inactive)': 'Regular - Psy (Inactive)',
}

export function normalizePrescriptionType(medicationType?: string | null): string {
  const type = (medicationType || '').trim()
  if (!type) return ''
  if (VALID_PRESCRIPTION_TYPES.has(type)) return type
  return PRESCRIPTION_TYPE_ALIASES[type] || type
}

export function flagsFromPrescriptionType(medicationType?: string | null): {
  is_prn: boolean
  is_long_acting: boolean
} {
  const type = normalizePrescriptionType(medicationType)
  return {
    is_prn: type === 'PRN',
    is_long_acting: type === 'Long Acting Medicine',
  }
}

export function isLongActingPrescriptionType(medicationType?: string | null): boolean {
  return normalizePrescriptionType(medicationType) === 'Long Acting Medicine'
}

export function isPrnPrescriptionType(medicationType?: string | null): boolean {
  return normalizePrescriptionType(medicationType) === 'PRN'
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
): T & {
  medication_type?: string
  is_prn: boolean
  is_long_acting_medicine: boolean
  patient_frequency?: string
  long_acting_frequency?: string
} {
  const medicationType = normalizePrescriptionType(row.medication_type)
  const flags = flagsFromPrescriptionType(medicationType)
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
    medication_type: medicationType || undefined,
    patient_frequency: patientFrequency,
    long_acting_frequency: longActingFrequency,
    is_prn: flags.is_prn,
    is_long_acting_medicine: flags.is_long_acting,
  }
}
