/**
 * Medical Diagnosis Entry — standalone OP/IP diagnosis records.
 * Replaces Patient Diagnosis child tables on Patient Visit / Inpatient Admission.
 */

import { apiRequest, ensureCSRF } from './apiClient'

export interface MedicalDiagnosisEntryRow {
  name?: string
  diagnosis: string
  disease_no?: string
  diagnosis_name?: string
  diagnosis_label?: string
  diagnosis_group_name?: string
  details?: string
  posting_date?: string
  diagnoses_time?: string
  practitioner?: string
  practitioner_name?: string
  diagnoses_flag?: boolean
  trans_num?: string
  visit_num?: string
  inpatient_admission?: string
  patient?: string
  group_code?: string
  cost_center?: string
}

export interface MedicalDiagnosisContextDefaults {
  cost_center?: string
  practitioner?: string
  practitioner_name?: string
}

export interface MedicalDiagnosisEntryAggRow extends MedicalDiagnosisEntryRow {
  patient_name?: string
  parent: string
  parent_type: 'Patient Visit' | 'Inpatient Admission' | ''
  parent_date?: string
}

export async function getAllMedicalDiagnosisEntries(options?: {
  limit?: number
  offset?: number
  patient?: string
}): Promise<MedicalDiagnosisEntryAggRow[]> {
  const params = new URLSearchParams()
  if (options?.limit != null) params.set('limit', String(options.limit))
  if (options?.offset != null) params.set('offset', String(options.offset))
  if (options?.patient) params.set('patient', options.patient)
  const qs = params.toString()
  const res = await fetch(
    `/api/method/healthcare.api.medical_diagnosis_entry.get_all_entries${qs ? `?${qs}` : ''}`
  )
  const data = await res.json()
  if (data?.exc_type) throw new Error(data?.message || 'Failed to load diagnoses')
  return (Array.isArray(data?.message) ? data.message : []) as MedicalDiagnosisEntryAggRow[]
}

export async function getMedicalDiagnosisContextDefaults(
  parentDoctype: 'Patient Visit' | 'Inpatient Admission',
  parentName: string
): Promise<MedicalDiagnosisContextDefaults> {
  const params = new URLSearchParams({
    parent_doctype: parentDoctype,
    parent_name: parentName,
  })
  const res = await fetch(
    `/api/method/healthcare.api.medical_diagnosis_entry.get_context_defaults?${params}`
  )
  const data = await res.json()
  if (data?.exc_type) throw new Error(data?.message || 'Failed to load defaults')
  return (data?.message || {}) as MedicalDiagnosisContextDefaults
}

export async function getMedicalDiagnosisForContext(
  parentDoctype: 'Patient Visit' | 'Inpatient Admission',
  parentName: string
): Promise<MedicalDiagnosisEntryRow[]> {
  const params = new URLSearchParams({
    parent_doctype: parentDoctype,
    parent_name: parentName,
  })
  const res = await fetch(
    `/api/method/healthcare.api.medical_diagnosis_entry.get_entries_for_context?${params}`
  )
  const data = await res.json()
  if (data?.exc_type) throw new Error(data?.message || 'Failed to load diagnoses')
  return (Array.isArray(data?.message) ? data.message : []) as MedicalDiagnosisEntryRow[]
}

export async function getMedicalDiagnosisForPatient(
  patient: string
): Promise<MedicalDiagnosisEntryAggRow[]> {
  const params = new URLSearchParams({ patient })
  const res = await fetch(
    `/api/method/healthcare.api.medical_diagnosis_entry.get_entries_for_patient?${params}`
  )
  const data = await res.json()
  if (data?.exc_type) throw new Error(data?.message || 'Failed to load diagnoses')
  return (Array.isArray(data?.message) ? data.message : []) as MedicalDiagnosisEntryAggRow[]
}

export async function saveMedicalDiagnosisForContext(
  parentDoctype: 'Patient Visit' | 'Inpatient Admission',
  parentName: string,
  rows: MedicalDiagnosisEntryRow[]
): Promise<void> {
  const csrf = await ensureCSRF()
  const res = await fetch(
    '/api/method/healthcare.api.medical_diagnosis_entry.save_entries_for_context',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({
        parent_doctype: parentDoctype,
        parent_name: parentName,
        rows,
      }),
    }
  )
  const data = await res.json()
  if (data?.exc_type) throw new Error(data?.message || 'Failed to save diagnoses')
}

/** Add new diagnosis rows without replacing or deleting existing entries. */
export async function appendMedicalDiagnosisForContext(
  parentDoctype: 'Patient Visit' | 'Inpatient Admission',
  parentName: string,
  rows: MedicalDiagnosisEntryRow[]
): Promise<void> {
  const csrf = await ensureCSRF()
  const res = await fetch(
    '/api/method/healthcare.api.medical_diagnosis_entry.append_entries_for_context',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({
        parent_doctype: parentDoctype,
        parent_name: parentName,
        rows,
      }),
    }
  )
  const data = await res.json()
  if (data?.exc_type) throw new Error(data?.message || 'Failed to add diagnoses')
}

export async function deleteMedicalDiagnosisEntry(name: string): Promise<void> {
  await apiRequest('/api/method/healthcare.api.medical_diagnosis_entry.delete_medical_diagnosis_entry', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function fetchMedicalDiagnosisEntry(
  name: string
): Promise<MedicalDiagnosisEntryAggRow> {
  const params = new URLSearchParams({ name })
  const res = await fetch(
    `/api/method/healthcare.api.medical_diagnosis_entry.get_medical_diagnosis_entry?${params}`
  )
  const data = await res.json()
  if (data?.exc_type) throw new Error(data?.message || 'Failed to load diagnosis entry')
  return (data?.message || {}) as MedicalDiagnosisEntryAggRow
}
