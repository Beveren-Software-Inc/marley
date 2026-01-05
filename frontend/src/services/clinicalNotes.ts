export interface ClinicalNote {
  name: string
  patient: string
  patient_name?: string
  posting_date?: string
  practitioner?: string
  practitioner_name?: string
  user?: string
  clinical_note_type?: string
  clinical_note_type_name?: string
  note_type?: string
  medical_role?: string
  medical_role_name?: string
  note?: string
  reference_doc?: string
  reference_name?: string
  branch?: string
}

export async function fetchClinicalNotes(
  limit: number = 50,
  offset: number = 0,
  patient?: string,
  medical_role?: string,
  clinical_note_type?: string,
  note_type?: string
): Promise<ClinicalNote[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (medical_role) params.append('medical_role', medical_role)
  if (clinical_note_type) params.append('clinical_note_type', clinical_note_type)
  if (note_type) params.append('note_type', note_type)

  const response = await fetch(
    `/api/method/healthcare.api.clinical_note.get_clinical_notes?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as ClinicalNote[]
  } else {
    return []
  }
}

