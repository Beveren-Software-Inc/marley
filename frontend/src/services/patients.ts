export interface PatientListItem {
  name: string
  patient_name: string
  file_number?: string
  mobile?: string
  email?: string
  sex?: string
  id_number?: string
  category?: string
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

export interface PatientSummary {
  name: string
  patient_name: string
  file_no: string
  dob?: string
  sex?: string
  marital_status?: string
  mobile?: string
  category?: string
  is_blacklist?: number
}

export async function searchPatients(query: string, limit?: number): Promise<PatientListItem[]> {
  const params = new URLSearchParams()
  params.append('search', query)
  if (limit) params.append('limit', limit.toString())
  
  const response = await fetch(
    `/api/method/healthcare.api.patient.search_patients?${params.toString()}`
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

export interface CreatePatientData {
  first_name: string
  middle_name?: string
  last_name?: string
  sex: string
  dob?: string
  blood_group?: string
  mobile?: string
  phone?: string
  email?: string
  id_number?: string
  nationality?: string
  category?: string
  source?: string
  marital_status?: string
  is_black_list?: boolean
  remarks?: string
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  country?: string
  pincode?: string
}

export async function createPatient(data: CreatePatientData): Promise<{ name: string; patient_name: string; file_no: string }> {
  const csrf = (window as any).csrf_token
  
  const response = await fetch('/api/method/healthcare.api.patient.create_patient', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': csrf
    },
    body: JSON.stringify({ data }),
    credentials: 'include'
  })
  console.log("Huku mana")
  const resData = await response.json()

  if (!response.ok) {
    const errorMessage = resData?.message?.message || resData?.message || 'Failed to create patient'
    throw new Error(errorMessage)
  }

  if (resData?.message) {
    return resData.message as { name: string; patient_name: string; file_no: string }
  } else {
    throw new Error('Invalid response format')
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

export async function fetchPatientSummary(patient: string): Promise<PatientSummary> {
  const response = await fetch(
    `/api/method/healthcare.api.patient.get_patient_summary?patient=${encodeURIComponent(patient)}`
  )
  const resData = await response.json()

  if (resData?.message) {
    return resData.message as PatientSummary
  } else {
    throw new Error('Invalid response format')
  }
}
