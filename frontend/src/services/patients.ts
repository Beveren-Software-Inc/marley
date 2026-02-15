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
}

export type CreatePatientResult = { name: string; patient_name: string; file_no: string; server_message?: string }

export async function createPatient(data: CreatePatientData): Promise<CreatePatientResult> {
  const csrf = (window as any).csrf_token

  const response = await fetch('/api/method/healthcare.api.patient.create_patient', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': csrf
    },
    body: JSON.stringify({ data }),
    credentials: 'include'
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

/** Full Patient doc for edit form (from Frappe REST). */
export interface PatientDoc {
  name: string
  patient_name?: string
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
