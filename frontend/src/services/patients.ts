import { apiRequest } from './apiClient'

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
}

export async function fetchPatient(id: string) {
  return apiRequest<Patient>(`/api/resource/Patient/${id}`)
}

export async function createPatient(data: Partial<Patient>) {
  const csrf = (window as any).csrf_token
  
  const resp = await fetch('/api/resource/Patient', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
    },
    body: JSON.stringify(data)
  })

  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}))
    throw new Error(errorData.message || errorData.exc || `Request failed with status ${resp.status}`)
  }

  const result = await resp.json()
  return result.data || result
}


