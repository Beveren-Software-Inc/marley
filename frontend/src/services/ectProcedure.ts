import { ensureCSRF } from './apiClient'

export interface CreateECTProcedureData {
  patient: string
  patient_name?: string
  date?: string
  npo_since?: string
  consultant_doctor?: string
  assistant_doctor?: string
  anaesthetist?: string
  type_of_anaesthesia?: string
  date_of_session?: string
  no_of_session?: number
  bp?: string
  hr?: string
  temp?: string
  resp_rate?: string
  spo2?: string
  energy?: string
  gtcs_for?: string
  bp_after?: string
  hr_after?: string
  resp_rate_after?: string
  spo2_after?: string
  progress_plan?: string
  other_complications?: string
  sign_date?: string
  consultant_sign_date?: string
}

export interface ECTProcedureResult {
  name: string
  patient: string
  patient_name?: string
  date?: string
}

export interface ECTProcedure extends ECTProcedureResult {
  date_of_session?: string
  no_of_session?: number
  bp?: string
  bp_after?: string
  hr?: string
  resp_rate?: string
  spo2?: string
  energy?: string
  consultant_doctor?: string
  assistant_doctor?: string
  anaesthetist?: string
}

export async function createECTProcedure(
  data: CreateECTProcedureData
): Promise<ECTProcedureResult> {
  const csrf = await ensureCSRF()

  const response = await fetch(
    '/api/method/healthcare.api.ect_details.create_ect_procedure',
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
      'Failed to create ECT Procedure'
    throw new Error(typeof msg === 'string' ? msg : 'Failed to create ECT Procedure')
  }

  if (resData?.message && typeof resData.message === 'object') {
    return resData.message as ECTProcedureResult
  }

  throw new Error('Invalid response format')
}

export async function fetchECTProcedures(
  limit: number = 50,
  offset: number = 0,
  patient?: string
): Promise<ECTProcedure[]> {
  const params = new URLSearchParams()
  params.append('limit', String(limit))
  params.append('offset', String(offset))
  if (patient) params.append('patient', patient)

  const response = await fetch(
    `/api/method/healthcare.api.ect_details.get_ect_procedures?${params.toString()}`
  )
  const resData = await response.json().catch(() => ({}))

  if (Array.isArray(resData?.message)) {
    return resData.message as ECTProcedure[]
  }

  return []
}


