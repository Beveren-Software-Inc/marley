import { ensureCSRF } from './apiClient'

export interface ECTProcedureEnergyRow {
  energy?: string
  duration?: string
  strength?: string
  gtcs_for?: string
}

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
  energies?: ECTProcedureEnergyRow[]
  propofol_detail?: string
  strength?: string
  succinylcholine_detail?: string
  bp_after?: string
  hr_after?: string
  resp_rate_after?: string
  spo2_after?: string
  progress_plan?: string
  other_complications?: string
  sign_date?: string
  consultant_sign_date?: string
  doctor_signature?: string
  consultant_signature?: string
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
  file_no?: string
  bp?: string
  bp_after?: string
  hr?: string
  resp_rate?: string
  spo2?: string
  energy?: string
  gtcs_for?: string
  energies?: ECTProcedureEnergyRow[]
  propofol_detail?: string
  strength?: string
  succinylcholine_detail?: string
  ecg?: string
  consultant_doctor?: string
  assistant_doctor?: string
  anaesthetist?: string
  nurse_name?: string
  ect_nurse_notes?: string
  n_date_and_time?: string
  next_plan_date?: string
  psych_doctor_label?: string
  assist_doctor_label?: string
  anaes_doctor_label?: string
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
  patientOrOpts?:
    | string
    | {
        patient?: string
        from_date?: string
        to_date?: string
        month?: string
        anaesthetist?: string
        file_no?: string
      }
): Promise<ECTProcedure[]> {
  const opts =
    typeof patientOrOpts === 'string' || patientOrOpts == null
      ? { patient: patientOrOpts || undefined }
      : patientOrOpts

  const params = new URLSearchParams()
  params.append('limit', String(limit))
  params.append('offset', String(offset))
  if (opts.patient) params.append('patient', opts.patient)
  if (opts.from_date) params.append('from_date', opts.from_date)
  if (opts.to_date) params.append('to_date', opts.to_date)
  if (opts.month) params.append('month', opts.month)
  if (opts.anaesthetist) params.append('anaesthetist', opts.anaesthetist)
  if (opts.file_no) params.append('file_no', opts.file_no)

  const response = await fetch(
    `/api/method/healthcare.api.ect_details.get_ect_procedures?${params.toString()}`
  )
  const resData = await response.json().catch(() => ({}))

  if (Array.isArray(resData?.message)) {
    return resData.message as ECTProcedure[]
  }

  return []
}

export async function fetchNextECTSessionNo(patient: string): Promise<number> {
  if (!patient) return 1

  const params = new URLSearchParams()
  params.append('patient', patient)

  const response = await fetch(
    `/api/method/healthcare.api.ect_details.get_next_ect_procedure_session?${params.toString()}`
  )
  const resData = await response.json().catch(() => ({}))
  const value = resData?.message
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) && num > 0 ? num : 1
}
