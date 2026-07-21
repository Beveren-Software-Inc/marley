// DOC-009 - unified allergy read across every store that holds allergy data.
// The banner previously read only Patient Medical History, which held a single
// record site-wide, so patients with documented allergies showed a blank panel.

export interface AllergyEntry {
  source: string
  text: string
  recorded_on: string | null
  is_legacy: boolean
  negative: boolean
  category: string | null
  allergen: string | null
  reaction: string | null
  severity: string | null
  is_drug_sensitivity?: number
  also_in?: string[]
}

export interface PatientAllergies {
  patient: string | null
  entries: AllergyEntry[]
  positive: AllergyEntry[]
  has_allergies: boolean
  no_known_allergies: boolean
  /** Somebody has recorded something either way - distinguishes "none" from "never asked". */
  checked: boolean
  sources: string[]
}

const EMPTY: PatientAllergies = {
  patient: null,
  entries: [],
  positive: [],
  has_allergies: false,
  no_known_allergies: false,
  checked: false,
  sources: [],
}

export const fetchPatientAllergies = async (
  patient: string
): Promise<PatientAllergies> => {
  if (!patient) return EMPTY
  const res = await fetch(
    `/api/method/healthcare.api.allergy_registry.get_patient_allergies?patient=${encodeURIComponent(patient)}`,
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  if (!res.ok) throw new Error(`Failed to load allergies (${res.status})`)
  const body = await res.json()
  return (body?.message as PatientAllergies) ?? EMPTY
}
