import { ensureCSRF } from './apiClient'
export interface PatientReferralRow {
  name: string
  patient: string
  patient_name: string
  referral_date: string
  referred_from_doctype: string
  referred_from_docname: string
  referred_to_hospital: string
  referred_to_doctor: string
  reason_for_referral: string
  referral_status: 'Pending' | 'Completed' | 'Cancelled'
  notes: string
  company: string
  cost_center: string
}

export interface CreatePatientReferralData {
  patient: string
  referral_date: string
  referred_to_hospital: string
  reason_for_referral: string
  referred_from_doctype?: string
  referred_from_docname?: string
  referred_to_doctor?: string
  referred_to_address?: string
  referred_to_contact?: string
  referral_status?: string
  notes?: string
  company?: string
  cost_center?: string
  referral_doctor?: string
}

export interface ReferralSourceDoc {
  name: string
  patient: string
  patient_name: string
  encounter_date?: string
  admission_date?: string
  status: string
}

export async function createPatientReferral(data: CreatePatientReferralData): Promise<{ name: string }> {
  const csrf = await ensureCSRF()
  const res = await fetch('/api/method/healthcare.api.common.create_patient_referral', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
     },
    body: JSON.stringify(data),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.message ?? 'Failed to create referral')
  return json.message as { name: string }
}

export async function searchReferralSourceDocs(
  doctype: 'Patient Visit' | 'Inpatient Admission',
  patient?: string,
  search?: string
): Promise<ReferralSourceDoc[]> {
  const qs = new URLSearchParams({ doctype })
  if (patient) qs.set('patient', patient)
  if (search) qs.set('search', search)
  const res = await fetch(
    `/api/method/healthcare.api.common.search_referral_source_documents?${qs}`
  )
  const json = await res.json()
  return (json?.message ?? []) as ReferralSourceDoc[]
}

export async function getPatientReferrals(params?: {
  patient?: string
  referral_status?: string
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
}): Promise<PatientReferralRow[]> {
  const qs = new URLSearchParams()
  if (params?.patient) qs.set('patient', params.patient)
  if (params?.referral_status) qs.set('referral_status', params.referral_status)
  if (params?.date_from) qs.set('date_from', params.date_from)
  if (params?.date_to) qs.set('date_to', params.date_to)
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  const res = await fetch(`/api/method/healthcare.api.common.get_patient_referrals?${qs}`)
  const json = await res.json()
  return (json?.message ?? []) as PatientReferralRow[]
}
