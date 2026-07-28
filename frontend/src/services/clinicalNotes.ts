// clinicalNotes.ts

export interface ClinicalNote {
  name: string
  patient: string
  patient_name?: string
  posting_date?: string
  practitioner?: string
  practitioner_name?: string
  user?: string
  username?: string
  clinical_note_type?: string
  clinical_note_type_name?: string
  note_type?: string
  medical_role?: string
  medical_role_name?: string
  note?: string
  reference_doctype?: string
  reference_document?: string
  inpatient_admission?: string
  branch?: string
  trans_no?: string
  note_locked?: number | boolean
  locked_by?: string
  locked_on?: string
  creation?: string
  modified?: string
}

export interface CreateClinicalNoteData {
  patient: string
  note: string
  clinical_note_type?: string
  note_type?: string
  medical_role?: string
  practitioner?: string
  posting_date?: string
  admission_no?: string
  patient_visit?: string
  cost_center?: string
}

export interface PendingDoctorProgressEncounter {
  patient: string
  patient_name?: string
  reference_doctype: string
  reference_document: string
  context_label: string
  context_status?: string
  encounter_date?: string
}

export interface ClinicalNoteListResponse {
  data: ClinicalNote[]
  total_count: number
}

function normalizeClinicalNoteList(message: unknown): ClinicalNoteListResponse {
  if (Array.isArray(message)) {
    return { data: message as ClinicalNote[], total_count: message.length }
  }
  if (message && typeof message === 'object' && Array.isArray((message as { data?: unknown }).data)) {
    const payload = message as { data: ClinicalNote[]; total_count?: number }
    return {
      data: payload.data,
      total_count: Number(payload.total_count ?? payload.data.length),
    }
  }
  return { data: [], total_count: 0 }
}

export async function fetchClinicalNotes(
  limit: number = 50,
  offset: number = 0,
  patient?: string,
  medical_role?: string,
  clinical_note_type?: string,
  note_type?: string,
  reference_doctype?: string,
  reference_document?: string,
  inpatient_admission?: string,
  mine_only?: boolean,
  practitioner?: string,
  postingDateFrom?: string,
  postingDateTo?: string,
): Promise<ClinicalNoteListResponse> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (medical_role) params.append('medical_role', medical_role)
  if (clinical_note_type) params.append('clinical_note_type', clinical_note_type)
  if (note_type) params.append('note_type', note_type)
  if (reference_doctype) params.append('ref_doctype', reference_doctype)
  if (reference_document) params.append('ref_document', reference_document)
  if (inpatient_admission) params.append('inpatient_admission', inpatient_admission)
  if (mine_only) params.append('mine_only', '1')
  if (practitioner) params.append('practitioner', practitioner)
  if (postingDateFrom) params.append('posting_date_from', postingDateFrom)
  if (postingDateTo) params.append('posting_date_to', postingDateTo)
  const url = `/api/method/healthcare.api.clinical_note.get_clinical_notes?${params.toString()}`
  
  try {
    const response = await fetch(url)
    const resData = await response.json()
    
    if (!response.ok) {
      throw new Error(resData.message || 'Failed to fetch clinical notes')
    }
    
    return normalizeClinicalNoteList(resData?.message)
  } catch (error) {
    console.error('Error fetching clinical notes:', error)
    throw error
  }
}

export async function fetchClinicalNote(name: string): Promise<Record<string, unknown>> {
  if (!name) {
    throw new Error('Clinical note name is required')
  }

  const response = await fetch(
    `/api/method/healthcare.api.clinical_note.get_clinical_note?name=${encodeURIComponent(name)}`,
  )
  const resData = await response.json()

  if (!response.ok || resData.exc) {
    const message =
      resData?._error_message ||
      resData?.message?.message ||
      resData?.message ||
      'Failed to fetch clinical note'
    throw new Error(typeof message === 'string' ? message : 'Failed to fetch clinical note')
  }

  if (resData?.message && typeof resData.message === 'object') {
    return resData.message as Record<string, unknown>
  }

  throw new Error('Invalid response format')
}

export async function fetchPendingDoctorProgressEncounters(
  clinicalNoteType: string = 'Doctor Progress Note',
): Promise<PendingDoctorProgressEncounter[]> {
  const params = new URLSearchParams()
  params.append('clinical_note_type', clinicalNoteType)
  const response = await fetch(
    `/api/method/healthcare.api.clinical_note.get_encounters_pending_doctor_progress_note?${params.toString()}`,
  )
  const resData = await response.json()
  if (!response.ok) {
    throw new Error(resData.message || 'Failed to fetch pending encounters')
  }
  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as PendingDoctorProgressEncounter[]
  }
  return []
}

export async function createClinicalNote(data: CreateClinicalNoteData) {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  
  const response = await fetch('/api/method/healthcare.api.clinical_note.create_clinical_note', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ data }),
  })
  
  const resData = await response.json()

  if (!response.ok || resData.exc) {
    const message =
      resData?.message?.message ||
      resData?.message ||
      resData?.exc ||
      'Failed to create clinical note'
    throw new Error(message)
  }

  return resData.message
}

export interface UpdateClinicalNoteData {
  name: string
  note?: string
  posting_date?: string
}

export async function updateClinicalNote(data: UpdateClinicalNoteData) {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()

  const response = await fetch('/api/method/healthcare.api.clinical_note.update_clinical_note', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ data }),
  })

  const resData = await response.json()
  if (!response.ok || resData.exc) {
    const message =
      resData?._error_message ||
      resData?.message?.message ||
      resData?.message ||
      resData?.exc ||
      'Failed to update clinical note'
    throw new Error(typeof message === 'string' ? message : 'Failed to update clinical note')
  }

  return resData.message as {
    success: boolean
    name: string
    note?: string
    posting_date?: string | null
  }
}