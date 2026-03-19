import type { PatientDocumentRow } from './patients'

export interface PatientVisit {
  name: string
  patient: string
  patient_name: string
  status: 'Open' | 'Ordered' | 'Completed' | 'Cancelled'
  encounter_date: string
  encounter_time?: string
  practitioner: string
  practitioner_name?: string
  medical_department?: string
  visit_type?: string
  file_number?: string
  inpatient_record?: string
  inpatient_status?: string
  appointment?: string
  company?: string
  /** Optional uploaded documents from Patient Visit.documents child table */
  documents?: (PatientDocumentRow & { name?: string })[]
}

export async function fetchPatientVisits(status?: string, search?: string, patient?: string) {
  const params = new URLSearchParams()
  if (status) params.append('status', status)
  if (search) params.append('search', search)
  if (patient) params.append('patient', patient)
  
  const url = `/api/method/healthcare.api.patient_visit.get_patient_visits${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as PatientVisit[]
  } else {
    throw new Error('Invalid response format')
  }
}

/** Row shape returned by fetchPatientVisitsFull (value/label for list UI). */
export interface PatientVisitListRow {
  value: string
  label: string
  patient: string
  patient_name: string
  encounter_date: string | null
  practitioner_name: string
  status: string
}

/**
 * Fetch patient visits with full filter support:
 * - patient
 * - search (visit name)
 * - practitioner
 * - fromDate / toDate
 */
export async function fetchPatientVisitsFull(
  patient?: string,
  search?: string,
  practitioner?: string,
  fromDate?: string,
  toDate?: string,
  status?: string
): Promise<PatientVisitListRow[]> {
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  if (search) params.append('search', search)
  if (practitioner) params.append('practitioner', practitioner)
  if (fromDate) params.append('from_date', fromDate)
  if (toDate) params.append('to_date', toDate)
  if (status) params.append('status', status)
  try {
    const res = await fetch(
      `/api/method/healthcare.api.patient_visit.get_patient_visits_full?${params}`
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    if (!Array.isArray(data?.message)) return []

    return data.message.map((m: any) => ({
      value: m.name,
      label: m.label,
      patient: m.patient ?? '',
      patient_name: m.patient_name ?? '',
      encounter_date: m.encounter_date ?? null,
      practitioner_name: m.practitioner_name ?? '',
      status: m.status ?? '',
    }))
  } catch (err) {
    console.error('fetchPatientVisitsFull error:', err)
    return []
  }
}

export async function fetchPatientVisit(name: string) {
  const response = await fetch(
    `/api/method/healthcare.api.patient_visit.get_patient_visit?name=${encodeURIComponent(name)}`
  )
  const resData = await response.json()

  if (resData?.message) {
    return resData.message as PatientVisit
  } else {
    throw new Error('Invalid response format')
  }
}

export interface PatientVisitTypeOption {
  name: string
  visit_type: string
}

/** Fetch Patient Visit Type list for dropdown (ECG, ECT, IOP, follow-up, etc.) */
export async function fetchPatientVisitTypes(): Promise<PatientVisitTypeOption[]> {
  const response = await fetch(
    '/api/resource/Patient%20Visit%20Type?fields=["name","visit_type"]&limit_page_length=100'
  )
  const resData = await response.json()
  if (resData?.data && Array.isArray(resData.data)) {
    return resData.data as PatientVisitTypeOption[]
  }
  return []
}





export async function cancelVisit(visitName: string, reason: string): Promise<void> {
  const response = await fetch(`/api/method/healthcare.api.patient_visit.cancel_patient_visit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visit_name: visitName, reason_for_cancel: reason })
  })

  const resData = await response.json()
  if (resData?.message !== 'success') {
    throw new Error(resData?.message || 'Failed to cancel visit')
  }
}


// Create an invoice for a visit
export async function createInvoice(visitName: string): Promise<string> {
  const response = await fetch(`/api/method/healthcare.api.patient_visit.create_invoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visit_name: visitName })
  })
  const resData = await response.json()
  if (!resData?.message) {
    throw new Error('Failed to create invoice')
  }
  return resData.message as string // return invoice name/id
}