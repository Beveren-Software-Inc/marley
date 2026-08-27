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
  cost_center?: string
  encounter_comment?: string
  sales_order?: string
  visit_charge_rate?: number
  visit_charge_error?: string
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
  visit_type?: string
  file_no?: string
  cpr_no?: string
  user?: string
  user_name?: string
  discount?: number
  total_due?: number
  balance?: number
  cost_center?: string
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
  offset?: number,
  costCenter?: string,
  visitOwner?: string,
  visitName?: string,
): Promise<PatientVisitsPaginatedResponse> {
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  if (search) params.append('search', search)
  if (practitioner) params.append('practitioner', practitioner)
  if (fromDate) params.append('from_date', fromDate)
  if (toDate) params.append('to_date', toDate)
  if (status) params.append('status', status)
  if (visitType) params.append('visit_type', visitType)
  if (costCenter) params.append('cost_center', costCenter)
  if (visitOwner) params.append('visit_owner', visitOwner)
  if (visitName) params.append('visit_name', visitName)
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
        visit_type: m.visit_type ?? '',
        file_no: m.file_no ?? '',
        cpr_no: m.cpr_no ?? '',
        user: m.user ?? '',
        user_name: m.user_name ?? m.user ?? '',
        discount: Number(m.discount ?? 0),
        total_due: Number(m.total_due ?? 0),
        balance: Number(m.balance ?? 0),
        cost_center: m.cost_center ?? '',
      })),
      total_count: msg.total_count ?? rows.length,
    }
  } catch (err) {
    console.error('fetchPatientVisitsFull error:', err)
    return { data: [], total_count: 0 }
  }
}

/** Earliest Patient Visit encounter_date (YYYY-MM-DD), or null. */
export async function fetchPatientFirstVisitDate(patient: string): Promise<string | null> {
  const id = (patient || '').trim()
  if (!id) return null
  try {
    const res = await fetch(
      `/api/method/healthcare.api.reception_reports.get_patient_first_visit_date?patient=${encodeURIComponent(id)}`,
      { credentials: 'include', headers: { Accept: 'application/json' } },
    )
    const json = await res.json()
    const d = (json?.message || '').toString().slice(0, 10)
    return d || null
  } catch {
    return null
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

/** Fetch Patient Visit Type list for dropdown with optional search query.
 * Uses a whitelisted endpoint (not /api/resource) so portal roles without
 * Patient Visit Type read permission (e.g. Nurse) still get the options. */
export async function fetchPatientVisitTypes(query?: string): Promise<PatientVisitTypeOption[]> {
  const params = new URLSearchParams()
  if (query && query.trim()) params.append('search', query.trim())
  const url = `/api/method/healthcare.api.common.get_patient_visit_types${params.toString() ? `?${params.toString()}` : ''}`
  const response = await fetch(url)
  const resData = await response.json()
  if (Array.isArray(resData?.message)) {
    return resData.message as PatientVisitTypeOption[]
  }
  return []
}





export async function cancelVisit(visitName: string, reason: string): Promise<void> {
  const csrf = await ensureCSRF()
  const response = await fetch(`/api/method/healthcare.api.patient_visit.cancel_patient_visit`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ visit_name: visitName, reason_for_cancel: reason }),
  })

  const resData = await response.json().catch(() => ({} as any))
  if (!response.ok || resData?.exc || resData?.exception) {
    const msg =
      (typeof resData?.message === 'string' && resData.message) ||
      resData?.exception ||
      resData?._error_message ||
      'Failed to cancel visit'
    throw new Error(String(msg).replace(/<[^>]+>/g, ' ').trim())
  }
  if (resData?.message !== 'success') {
    throw new Error(
      typeof resData?.message === 'string' ? resData.message : 'Failed to cancel visit',
    )
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
  cost_center?: string
  documents?: Record<string, unknown>[]
  status?: 'Open' | 'Ordered' | 'Completed' | 'Cancelled'
  charge_visit?: boolean
  charge_lines?: PatientVisitChargeLineInput[]
}

export interface PatientVisitChargeLineInput {
  template: string
  item_code?: string
  rate?: number
  qty?: number
  discount_type?: 'Percentage' | 'Amount'
  discount_rate?: number
  discount?: number
}

export interface PatientVisitChargePreview {
  configured: boolean
  no_charges?: boolean
  template?: string | null
  service_name?: string | null
  item_code?: string | null
  item_name?: string | null
  rate?: number
  source?: 'visit_type' | 'default' | 'template' | null
  visit_type?: string | null
}

export async function fetchPatientVisitChargePreview(
  visitType?: string,
): Promise<PatientVisitChargePreview> {
  try {
    const params = new URLSearchParams()
    if (visitType) params.append('visit_type', visitType)
    const response = await fetch(
      `/api/method/healthcare.api.patient_visit_charge.get_patient_visit_charge_preview?${params.toString()}`,
      { credentials: 'include' },
    )
    const resData = await response.json()
    if (resData?.message && typeof resData.message === 'object') {
      return resData.message as PatientVisitChargePreview
    }
  } catch {
    /* ignore */
  }
  return { configured: false, rate: 0 }
}

export interface PatientVisitChargeLine {
  configured: boolean
  template?: string | null
  service_name?: string | null
  item_code?: string | null
  item_name?: string | null
  rate?: number
  discount_pct?: number
  discount_amount?: number
  net_rate?: number
  source?: 'visit_type' | 'default' | 'template' | null
}

export interface PatientVisitChargeLines {
  no_charges: boolean
  visit_type?: string | null
  used_default_visit_type?: boolean
  source?: 'visit_type_services' | 'visit_type' | 'default' | null
  configured: boolean
  lines: PatientVisitChargeLine[]
}

export async function fetchPatientVisitChargeLines(
  visitType?: string,
  patient?: string,
): Promise<PatientVisitChargeLines> {
  try {
    const params = new URLSearchParams()
    if (visitType) params.append('visit_type', visitType)
    if (patient) params.append('patient', patient)
    const response = await fetch(
      `/api/method/healthcare.api.patient_visit_charge.get_patient_visit_charge_lines?${params.toString()}`,
      { credentials: 'include' },
    )
    const resData = await response.json()
    if (resData?.message && typeof resData.message === 'object') {
      const msg = resData.message as Partial<PatientVisitChargeLines>
      return {
        no_charges: Boolean(msg.no_charges),
        visit_type: msg.visit_type ?? null,
        source: msg.source ?? null,
        configured: Boolean(msg.configured),
        lines: Array.isArray(msg.lines) ? (msg.lines as PatientVisitChargeLine[]) : [],
      }
    }
  } catch {
    /* ignore */
  }
  return { no_charges: false, configured: false, lines: [] }
}

export interface PatientVisitChargeEditorLine {
  item_code: string
  item_name?: string | null
  rate: number
  qty?: number
  discount: number
  net?: number
}

export interface PatientVisitChargeAvailableService {
  template?: string | null
  item_code: string
  item_name?: string | null
  rate: number
}

export interface PatientVisitChargeEditor {
  editable: boolean
  locked_reason?: string | null
  sales_order?: string | null
  no_charges: boolean
  lines: PatientVisitChargeEditorLine[]
  available_services: PatientVisitChargeAvailableService[]
}

export async function fetchPatientVisitChargeEditor(
  visitName: string,
): Promise<PatientVisitChargeEditor> {
  const params = new URLSearchParams({ visit_name: visitName })
  const response = await fetch(
    `/api/method/healthcare.api.patient_visit_charge.get_patient_visit_charge_editor?${params.toString()}`,
    { credentials: 'include' },
  )
  const resData = await response.json().catch(() => ({}))
  const msg = resData?.message
  if (msg && typeof msg === 'object') {
    return {
      editable: Boolean(msg.editable),
      locked_reason: msg.locked_reason ?? null,
      sales_order: msg.sales_order ?? null,
      no_charges: Boolean(msg.no_charges),
      lines: Array.isArray(msg.lines) ? (msg.lines as PatientVisitChargeEditorLine[]) : [],
      available_services: Array.isArray(msg.available_services)
        ? (msg.available_services as PatientVisitChargeAvailableService[])
        : [],
    }
  }
  return { editable: false, no_charges: false, lines: [], available_services: [] }
}

export async function updatePatientVisitCharge(
  visitName: string,
  lines: Array<{ item_code?: string; template?: string; item_name?: string; rate: number; qty?: number; discount: number }>,
): Promise<{ sales_order: string | null; removed?: boolean }> {
  const csrf = await ensureCSRF()
  const response = await fetch(
    `/api/method/healthcare.api.patient_visit_charge.update_patient_visit_charge`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ visit_name: visitName, lines }),
    },
  )
  const resData = await response.json().catch(() => ({}))
  if (!response.ok || resData?.exc) {
    throw new Error((resData?.message as string) || resData?.exception || 'Failed to update visit charge')
  }
  return (resData?.message as { sales_order: string | null; removed?: boolean }) || { sales_order: null }
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

export interface UpdatePatientVisitData {
  practitioner: string
  encounter_date: string
  encounter_time: string
  visit_type?: string
  cost_center?: string
  encounter_comment?: string
}

export async function updatePatientVisit(
  name: string,
  data: UpdatePatientVisitData,
): Promise<PatientVisit> {
  const csrf = await ensureCSRF()
  const response = await fetch('/api/method/healthcare.api.patient_visit.update_patient_visit', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ name, data }),
  })
  const resData = await response.json()
  if (!response.ok || resData?.exc) {
    throw new Error(
      typeof resData?.message === 'string'
        ? resData.message
        : resData?.exception || 'Failed to update patient visit',
    )
  }
  if (!resData?.message) {
    throw new Error('Failed to update patient visit')
  }
  return resData.message as PatientVisit
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

