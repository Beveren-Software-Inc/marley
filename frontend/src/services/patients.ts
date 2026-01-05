export interface PatientListItem {
  name: string
  patient_name: string
  file_number?: string
  mobile?: string
  email?: string
}

export interface PatientMedicalHistory {
  allergies?: string
  medication?: string
  medical_history?: string
  surgical_history?: string
  occupation?: string
  marital_status?: string
  tobacco_past_use?: string
  tobacco_current_use?: string
  alcohol_past_use?: string
  alcohol_current_use?: string
  surrounding_factors?: string
  other_risk_factors?: string
  patient_name?: string
  file_no?: string
}

export async function searchPatients(query: string): Promise<PatientListItem[]> {
  const response = await fetch(
    `/api/method/healthcare.api.patient.search_patients?search=${encodeURIComponent(query)}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as PatientListItem[]
  } else {
    return []
  }
}

export async function fetchPatients(
  limit: number = 50,
  offset: number = 0,
  search?: string
): Promise<PatientListItem[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (search) params.append('search', search)

  const response = await fetch(
    `/api/method/healthcare.api.patient.get_patients?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as PatientListItem[]
  } else {
    return []
  }
}

export async function fetchPatientMedicalHistory(patient: string): Promise<PatientMedicalHistory> {
  const response = await fetch(
    `/api/method/healthcare.api.patient.get_patient_medical_history?patient=${encodeURIComponent(patient)}`
  )
  const resData = await response.json()

  if (resData?.message) {
    return resData.message as PatientMedicalHistory
  } else {
    throw new Error('Invalid response format')
  }
}
