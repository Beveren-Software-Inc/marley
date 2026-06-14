import type { PatientDocumentRow } from './patients'
import { ensureCSRF } from './apiClient'

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
  lab_amount: number
  service_amount: number
  pharmacy_amount: number
  appointment_amount: number
}

export interface PatientVisitsPaginatedResponse {
  data: PatientVisitListRow[]
  total_count: number
}

/**
 * Fetch patient visits with full filter support and server-side pagination.
 */
export async function fetchPatientVisitsFull(
  patient?: string,
  search?: string,
  practitioner?: string,
  fromDate?: string,
  toDate?: string,
  status?: string,
  visitType?: string,
  limit?: number,
  offset?: number
): Promise<PatientVisitsPaginatedResponse> {
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  if (search) params.append('search', search)
  if (practitioner) params.append('practitioner', practitioner)
  if (fromDate) params.append('from_date', fromDate)
  if (toDate) params.append('to_date', toDate)
  if (status) params.append('status', status)
  if (visitType) params.append('visit_type', visitType)
  if (limit !== undefined) params.append('limit', limit.toString())
  if (offset !== undefined) params.append('offset', offset.toString())
  try {
    const res = await fetch(
      `/api/method/healthcare.api.patient_visit.get_patient_visits_full?${params}`
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()

    const msg = json?.message
    if (!msg) return { data: [], total_count: 0 }

    const rows = Array.isArray(msg.data) ? msg.data : (Array.isArray(msg) ? msg : [])

    return {
      data: rows.map((m: any) => ({
        value: m.name,
        label: m.label,
        patient: m.patient ?? '',
        patient_name: m.patient_name ?? '',
        encounter_date: m.encounter_date ?? null,
        practitioner_name: m.practitioner_name ?? '',
        status: m.status ?? '',
        lab_amount: Number(m.lab_amount ?? 0),
        service_amount: Number(m.service_amount ?? 0),
        pharmacy_amount: Number(m.pharmacy_amount ?? 0),
        appointment_amount: Number(m.appointment_amount ?? 0),
      })),
      total_count: msg.total_count ?? rows.length,
    }
  } catch (err) {
    console.error('fetchPatientVisitsFull error:', err)
    return { data: [], total_count: 0 }
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

/** Fetch Patient Visit Type list for dropdown with optional search query. */
export async function fetchPatientVisitTypes(query?: string): Promise<PatientVisitTypeOption[]> {
  let url = '/api/resource/Patient%20Visit%20Type?fields=["name","visit_type"]&limit_page_length=100'
  if (query && query.trim()) {
    const filters = JSON.stringify([["visit_type", "like", `%${query.trim()}%`]])
    url += `&filters=${encodeURIComponent(filters)}`
  }
  const response = await fetch(url)
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



export async function createInvoiceForVisit(visitName: string): Promise<{
  sales_invoice: string;
  status: string;
  message: string;
}> {

  const csrf = await ensureCSRF()
  const response = await fetch(`/api/method/healthcare.api.patient_visit.create_invoice_from_visit`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
     },
    body: JSON.stringify({ visit_name: visitName })
  });
  
  const resData = await response.json();
  
  if (!resData?.message) {
    throw new Error(resData?.exception || 'Failed to create invoice');
  }
  
  return resData.message;
}

export interface CreatePatientVisitData {
  patient: string
  practitioner: string
  encounter_date: string
  encounter_time: string
  visit_type?: string
  appointment?: string
  iop_enrollment?: string
  documents?: Record<string, unknown>[]
  status?: 'Open' | 'Ordered' | 'Completed' | 'Cancelled'
}


export interface OpenPatientVisitRow {
  name: string
  status?: string
  encounter_date?: string
  practitioner_name?: string
}

export interface CanCreatePatientVisitResult {
  allowed: boolean
  open_visits?: OpenPatientVisitRow[]
}

export async function checkCanCreatePatientVisit(
  patient: string,
): Promise<CanCreatePatientVisitResult> {
  const params = new URLSearchParams({ patient })
  const response = await fetch(
    `/api/method/healthcare.api.patient_visit.check_can_create_patient_visit?${params}`,
    { credentials: 'include' },
  )
  const resData = await response.json().catch(() => ({}))
  if (!response.ok || resData?.exc) {
    throw new Error(
      (resData?.message as string) || resData?.exception || 'Could not check open visits',
    )
  }
  const msg = resData?.message
  if (msg && typeof msg === 'object') {
    return msg as CanCreatePatientVisitResult
  }
  return { allowed: true, open_visits: [] }
}

export async function createPatientVisit(data: CreatePatientVisitData): Promise<PatientVisit> {
  // return await apiRequest<PatientVisit>('/api/method/healthcare.api.patient_visit.create_patient_visit', {
  //   method: 'POST',
  //   body: JSON.stringify({ data }),
  // })
const csrf = await ensureCSRF()
  const response = await fetch(`/api/method/healthcare.api.patient_visit.create_patient_visit`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
     },
    body: JSON.stringify({ data})
  });
  
  const resData = await response.json();
  
  if (!resData?.message) {
    throw new Error(resData?.exception || 'Failed to create invoice');
  }
  
  return resData.message;
}

export async function updatePatientVisitDocuments(
  name: string,
  documents: PatientDocumentRow[]
): Promise<{ success: boolean; name: string }> {
  const csrf = await ensureCSRF()
  const response = await fetch(
    '/api/method/healthcare.api.patient_visit.update_patient_visit_documents',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ name, documents }),
    }
  )
  const resData = await response.json()
  if (!response.ok || resData?.exc) {
    throw new Error(
      typeof resData?.message === 'string' ? resData.message : 'Failed to save documents'
    )
  }
  return resData.message as { success: boolean; name: string }
}

