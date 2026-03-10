import { ensureCSRF } from './apiClient'

export interface CreateECTAdmissionData {
  patient: string
  patient_name?: string
  date?: string
  bp?: string
  hr?: string
  resp_rate?: string
  spo2?: string
  psychiatric_diagnosis?: string
  medical_history?: string
  patient_allergy_history?: string
  other_complications?: string
  instructions?: string
  doctor?: string
  doctors_name?: string
}

export interface ECTAdmissionResult {
  name: string
  patient: string
  patient_name?: string
  date?: string
}

export interface ECTAdmission extends ECTAdmissionResult {
  bp?: string
  hr?: string
  resp_rate?: string
  spo2?: string
  doctor?: string
  doctors_name?: string
}

export async function createECTAdmission(
  data: CreateECTAdmissionData
): Promise<ECTAdmissionResult> {
  const csrf = await ensureCSRF()

  const response = await fetch(
    '/api/method/healthcare.api.ect_details.create_ect_admission',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ data }),
    }
  )

  const resData = await response.json().catch(() => ({}))

  if (!response.ok || resData?.exc) {
    const msg =
      resData?.message?.message ||
      resData?.message ||
      resData?.exc ||
      'Failed to create ECT Admission'
    throw new Error(typeof msg === 'string' ? msg : 'Failed to create ECT Admission')
  }

  if (resData?.message && typeof resData.message === 'object') {
    return resData.message as ECTAdmissionResult
  }

  throw new Error('Invalid response format')
}

export async function fetchECTAdmissions(
  limit: number = 50,
  offset: number = 0,
  patient?: string
): Promise<ECTAdmission[]> {
  const params = new URLSearchParams()
  params.append('limit', String(limit))
  params.append('offset', String(offset))
  if (patient) params.append('patient', patient)

  const response = await fetch(
    `/api/method/healthcare.api.ect_details.get_ect_admissions?${params.toString()}`
  )
  const resData = await response.json().catch(() => ({}))

  if (Array.isArray(resData?.message)) {
    return resData.message as ECTAdmission[]
  }

  return []
}


