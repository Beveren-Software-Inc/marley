export interface PatientListItem {
  name: string
  patient_name: string
  file_number?: string
  mobile?: string
  email?: string
  sex?: string
  id_number?: string
  category?: string
}

export interface PatientMedicalHistory {
  allergies?: string
  medication?: string
  medical_history?: string
  surgical_history?: string
  occupation?: string
  marital_status?: string
  tobacco_past_use?: string
  tobacco_current_use?: string
  alcohol_past_use?: string
  alcohol_current_use?: string
  surrounding_factors?: string
  other_risk_factors?: string
  patient_name?: string
  file_no?: string
}

export interface PatientSummary {
  name: string
  patient_name: string
  file_no: string
  dob?: string
  sex?: string
  marital_status?: string
  mobile?: string
  category?: string
  is_blacklist?: number
  remarks?: string
  /** Patient Upload Document child table on Patient */
  documents?: (PatientDocumentRow & { name?: string; document_name?: string })[]
}

export async function searchPatients(query: string, limit?: number): Promise<PatientListItem[]> {
  const params = new URLSearchParams()
  params.append('search', query)
  if (limit) params.append('limit', limit.toString())
  
  const response = await fetch(
    `/api/method/healthcare.api.patient.search_patients?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as PatientListItem[]
  } else {
    return []
  }
}

export async function fetchPatients(
  limit: number = 50,
  offset: number = 0,
  search?: string
): Promise<PatientListItem[]> {
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


export interface PatientDocumentRow {
  file_name?: string
  document_type?: string
  transaction_no?: string
  upload_remarks?: string
  document?: string
}

export interface CreatePatientData {
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
  is_black_list?: boolean
  remarks?: string
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  country?: string
  pincode?: string
  patient_document?: PatientDocumentRow[]
}

/** Ensure we have a CSRF token (e.g. when page was cached or token missing on /health). */
async function ensureUploadCSRFToken(): Promise<string | null> {
  let token = (window as any).csrf_token
  if (token) return token
  const base = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : ''
  try {
    const resp = await fetch(`${base}/api/method/frappe.sessions.get_csrf_token`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    if (!resp.ok) return null
    const data = await resp.json().catch(() => ({} as any))
    token = data?.message ?? data?.data ?? null
    if (token) (window as any).csrf_token = token
    return token
  } catch {
    return null
  }
}

/** Upload a file for Patient (e.g. for Patient Upload Document). Returns file_url to store in document field. */
export async function uploadPatientFile(file: File): Promise<string> {
  const csrf = await ensureUploadCSRFToken()
  const form = new FormData()
  form.append('file', file)
  form.append('is_private', '0')
  form.append('folder', 'Home/Attachments')
  // Do NOT append doctype/docname — Frappe rejects upload_file when docname is
  // an empty string. For pre-save patient docs we upload as a standalone file
  // and attach the returned file_url to the document row instead.
  if (csrf) form.append('csrf_token', csrf)

  // Use current origin so upload works on 127.0.0.1 and live (not only localhost)
  const base = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : ''
  const uploadUrl = `${base}/api/method/upload_file`

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: csrf ? { 'X-Frappe-CSRF-Token': csrf } : {},
    body: form,
    credentials: 'include',
  })

  let data: any = {}
  try {
    data = await res.json()
  } catch {
    throw new Error(`Upload failed: server returned non-JSON (status ${res.status})`)
  }

  // Frappe surfaces exceptions as data.exc (stringified traceback).
  // data._server_messages or data.message may hold the user-facing reason.
  if (data?.exc) {
    let reason = 'Upload failed'
    try {
      // _server_messages is a JSON-encoded array of JSON-encoded objects
      const msgs = JSON.parse(data._server_messages || '[]')
      const first = JSON.parse(msgs[0] || '{}')
      reason = first?.message || data?.message || reason
    } catch {
      reason = data?.message || reason
    }
    throw new Error(reason)
  }

  if (!res.ok) {
    throw new Error(`Upload failed: HTTP ${res.status}`)
  }

  const doc = data?.message
  if (doc && typeof doc === 'object' && doc.file_url) return doc.file_url
  if (typeof doc === 'string' && doc.startsWith('/')) return doc

  throw new Error('Upload failed: no file URL in response')
}

export type CreatePatientResult = { name: string; patient_name: string; file_no: string; server_message?: string }

export async function createPatient(data: CreatePatientData): Promise<CreatePatientResult> {
  const csrf = (window as any).csrf_token

  const csrfForCreate = csrf || (await (await import('./apiClient')).ensureCSRF())
  const response = await fetch('/api/method/healthcare.api.patient.create_patient', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(csrfForCreate ? { 'X-Frappe-CSRF-Token': csrfForCreate } : {})
    },
    body: JSON.stringify({ data }),
  })
  const resData = await response.json().catch(() => ({}))

  if (!response.ok || resData?.exc) {
    const msg = messageFromFrappeResponse(resData as Record<string, unknown>)
    throw new Error(msg || `Failed to create patient (${response.status})`)
  }

  const msg = resData?.message
  if (msg && typeof msg === 'object' && (msg as { name?: string }).name) {
    return msg as CreatePatientResult
  }
  if (msg && typeof msg === 'string' && msg.trim()) {
    return { name: '', patient_name: '', file_no: '', server_message: msg.trim() }
  }
  throw new Error(messageFromFrappeResponse(resData as Record<string, unknown>) || 'Invalid response format')
}

export async function fetchPatientMedicalHistory(patient: string): Promise<PatientMedicalHistory> {
  const response = await fetch(
    `/api/method/healthcare.api.patient.get_patient_medical_history?patient=${encodeURIComponent(patient)}`
  )
 
  const resData = await response.json()
  if (resData?.message) {
    return resData.message as PatientMedicalHistory
  } else {
    throw new Error('Invalid response format')
  }
}

export async function fetchPatientSummary(patient: string): Promise<PatientSummary> {
  const response = await fetch(
    `/api/method/healthcare.api.patient.get_patient_summary?patient=${encodeURIComponent(patient)}`
  )
  const resData = await response.json()

  if (resData?.message) {
    return resData.message as PatientSummary
  } else {
    throw new Error('Invalid response format')
  }
}

/** Summary stats for Patient History page: visits, admissions, invoices, unbilled, amount to pay */
export interface PatientHistorySummary {
  visit_count: number
  admission_count: number
  paid_invoice_count: number
  paid_invoice_total: number
  unbilled_count: number
  amount_to_pay: number
}

export async function fetchPatientHistorySummary(patient: string): Promise<PatientHistorySummary> {
  const response = await fetch(
    `/api/method/healthcare.api.patient.get_patient_history_summary?patient=${encodeURIComponent(patient)}`
  )
  const resData = await response.json()

  if (resData?.message) {
    return resData.message as PatientHistorySummary
  }
  throw new Error(resData?.exc || 'Invalid response format')
}

/** Full Patient doc for edit form (from Frappe REST). */
export interface PatientDoc {
  name: string
  patient_name?: string
  file_no?: string
  first_name?: string
  middle_name?: string
  last_name?: string
  sex?: string
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
  is_black_list?: number
  remarks?: string
  patient_primary_address?: string
}

/** Address doc (for edit form). */
export interface AddressDoc {
  name: string
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  country?: string
  pincode?: string
}

export async function fetchPatientDoc(name: string): Promise<PatientDoc> {
  const res = await fetch(`/api/resource/Patient/${encodeURIComponent(name)}`)
  const data = await res.json()
  if (data?.data) return data.data as PatientDoc
  throw new Error(data?.message?.message || data?.message || 'Failed to load patient')
}

export async function fetchAddressDoc(name: string): Promise<AddressDoc | null> {
  const res = await fetch(`/api/resource/Address/${encodeURIComponent(name)}`)
  const data = await res.json()
  if (data?.data) return data.data as AddressDoc
  return null
}

export interface UpdatePatientData {
  first_name?: string
  middle_name?: string
  last_name?: string
  sex?: string
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
  is_black_list?: number
  remarks?: string
}

/** Extract user-facing message from Frappe error response (REST / method). */
function messageFromFrappeResponse(out: Record<string, unknown>): string {
  try {
    if (out._server_messages && typeof out._server_messages === 'string') {
      const arr = JSON.parse(out._server_messages) as string[]
      if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'string') {
        const msg = arr[0].trim()
        if (msg) return msg
      }
    }
  } catch {
    // ignore parse error
  }
  const msg = out.message
  if (typeof msg === 'string' && msg.trim()) return msg.trim()
  if (msg && typeof msg === 'object' && typeof (msg as { message?: string }).message === 'string') {
    const m = (msg as { message: string }).message.trim()
    if (m) return m
  }
  const exc = out.exc
  if (typeof exc === 'string' && exc.trim()) {
    const trimmed = exc.trim()
    const match = trimmed.match(/(?:ValidationError|PermissionError|ValueError):\s*(.+?)(?:\n|$)/s)
    if (match && match[1]) return match[1].trim()
    const lastLine = trimmed.split('\n').filter(Boolean).pop()
    if (lastLine && lastLine.length < 300) return lastLine
    if (lastLine) return lastLine.slice(0, 200) + '…'
  }
  if (out.exc_type && typeof out.exc_type === 'string') return out.exc_type
  return ''
}

/** On success, may return the server message (e.g. "Customer X updated"). */
export async function updatePatientDoc(patientName: string, data: UpdatePatientData): Promise<{ message?: string }> {
  const csrf = (window as any).csrf_token
  const res = await fetch(`/api/resource/Patient/${encodeURIComponent(patientName)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
    },
    body: JSON.stringify(data),
    credentials: 'include'
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok || out?.exc) {
    const msg = messageFromFrappeResponse(out as Record<string, unknown>)
    throw new Error(msg || `Failed to update patient (${res.status})`)
  }
  const message = typeof (out as { message?: string }).message === 'string' ? (out as { message: string }).message : undefined
  return { message }
}

export async function updateAddressDoc(addressName: string, data: Partial<AddressDoc>): Promise<void> {
  const csrf = (window as any).csrf_token
  const res = await fetch(`/api/resource/Address/${encodeURIComponent(addressName)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
    },
    body: JSON.stringify(data),
    credentials: 'include'
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok || out?.exc) {
    const msg = messageFromFrappeResponse(out as Record<string, unknown>)
    throw new Error(msg || `Failed to update address (${res.status})`)
  }
}
