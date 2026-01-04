export interface Patient {
  name: string
  patient_name: string
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
}

export interface PatientListItem {
  name: string
  patient_name: string
  mobile?: string
  id_number?: string
  sex?: string
  dob?: string
  category?: string
}

export async function fetchPatients(limit: number = 50, offset: number = 0, search?: string): Promise<PatientListItem[]> {
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

export async function fetchPatient(id: string) {
  const response = await fetch(
    `/api/method/healthcare.api.patient.get_patient?name=${encodeURIComponent(id)}`
  )
  const resData = await response.json()

  if (resData?.message) {
    return resData.message as Patient
  } else {
    throw new Error('Invalid response format')
  }
}

export async function createPatient(data: Partial<Patient>) {
  const csrf = (window as any).csrf_token
  
  const response = await fetch('/api/method/healthcare.api.patient.create_patient', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
    },
    body: JSON.stringify(data)
  })

  const resData = await response.json()

  if (!response.ok) {
    throw new Error(resData.message || resData.exc || `Request failed with status ${response.status}`)
  }

  if (resData?.message) {
    return resData.message
  }
  
  return resData
}

export async function searchPatients(query: string, limit: number = 20) {
  const response = await fetch(
    `/api/method/healthcare.api.patient.search_patients?query=${encodeURIComponent(query)}&limit=${limit}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message
  } else {
    return []
  }
}
