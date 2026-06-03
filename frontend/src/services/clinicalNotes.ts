// clinicalNotes.ts

export interface ClinicalNote {
  name: string
  patient: string
  patient_name?: string
  posting_date?: string
  practitioner?: string
  practitioner_name?: string
  user?: string
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
): Promise<ClinicalNote[]> {
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
    
    if (resData?.message && Array.isArray(resData.message)) {
      return resData.message as ClinicalNote[]
    }
    return []
  } catch (error) {
    console.error('Error fetching clinical notes:', error)
    throw error
  }
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