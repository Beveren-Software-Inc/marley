import { ensureCSRF } from './apiClient'
import { frappeErrorMessage } from '../utils/frappeErrorMessage'

export interface MedicalSupervisionStatus {
  admission: string
  patient?: string
  patient_name?: string
  status?: string
  is_med_supr_required?: number
  med_supr_service_code?: string | null
  continuous_active: boolean
  active_service_request?: string | null
  active_template?: string | null
  active_amount?: number | null
  continuous_service_requests?: Array<{
    name: string
    template_dn?: string
    cost?: number
    grand_total?: number
  }>
  message?: string
  created?: unknown
  stopped?: string[]
  skipped?: unknown[]
  from_date?: string
  to_date?: string
}

async function postMethod(method: string, body: Record<string, unknown>): Promise<MedicalSupervisionStatus> {
  const csrf = await ensureCSRF()
  const response = await fetch(`/api/method/${method}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify(body),
  })
  const resData = await response.json()
  if (!response.ok || resData?.exc) {
    throw new Error(
      frappeErrorMessage(resData as Record<string, unknown>, 'Medical Supervision request failed'),
    )
  }
  return (resData?.message || resData) as MedicalSupervisionStatus
}

export async function fetchAdmissionMedicalSupervision(
  admission: string,
): Promise<MedicalSupervisionStatus> {
  const params = new URLSearchParams({ admission })
  const response = await fetch(
    `/api/method/healthcare.api.medical_supervision.get_admission_medical_supervision?${params}`,
  )
  const resData = await response.json()
  if (!response.ok || resData?.exc) {
    throw new Error(
      frappeErrorMessage(resData as Record<string, unknown>, 'Failed to load Medical Supervision'),
    )
  }
  return resData.message as MedicalSupervisionStatus
}

export async function createMedicalSupervision(opts: {
  admission: string
  template: string
  amount?: number
  continuous?: boolean
  billToday?: boolean
}): Promise<MedicalSupervisionStatus> {
  return postMethod('healthcare.api.medical_supervision.create_medical_supervision', {
    admission: opts.admission,
    template: opts.template,
    amount: opts.amount ?? null,
    continuous: opts.continuous === false ? 0 : 1,
    bill_today: opts.billToday === false ? 0 : 1,
  })
}

export async function activateMedicalSupervision(opts: {
  admission: string
  serviceRequest?: string
  template?: string
  amount?: number
}): Promise<MedicalSupervisionStatus> {
  return postMethod('healthcare.api.medical_supervision.activate_medical_supervision', {
    admission: opts.admission,
    service_request: opts.serviceRequest || null,
    template: opts.template || null,
    amount: opts.amount ?? null,
  })
}

export async function stopMedicalSupervision(opts: {
  admission: string
  serviceRequest?: string
}): Promise<MedicalSupervisionStatus> {
  return postMethod('healthcare.api.medical_supervision.stop_medical_supervision', {
    admission: opts.admission,
    service_request: opts.serviceRequest || null,
  })
}

export async function generateMedicalSupervisionCharges(opts: {
  admission: string
  fromDate?: string
  toDate?: string
  days?: number
  template?: string
  amount?: number
}): Promise<MedicalSupervisionStatus> {
  return postMethod('healthcare.api.medical_supervision.generate_medical_supervision_charges', {
    admission: opts.admission,
    from_date: opts.fromDate || null,
    to_date: opts.toDate || null,
    days: opts.days ?? null,
    template: opts.template || null,
    amount: opts.amount ?? null,
  })
}
