import { apiRequest } from './apiClient'

export type MedicalRecordCheckColumn = {
  key: string
  label: string
}

export type MedicalRecordChecklistRow = {
  sno: number
  admission: string
  patient: string
  patient_name: string
  file_no: string
  doa: string
  status: string
  checks: Record<string, boolean>
  remarks: string
}

export type MedicalRecordChecklistReport = {
  from_date: string | null
  to_date: string | null
  cost_center: string | null
  branch: string
  prepared_by: string
  columns: MedicalRecordCheckColumn[]
  rows: MedicalRecordChecklistRow[]
}

export async function fetchMedicalRecordChecklist(filters: {
  fromDate?: string
  toDate?: string
  costCenter?: string
}): Promise<MedicalRecordChecklistReport> {
  const params = new URLSearchParams()
  if (filters.fromDate) params.set('from_date', filters.fromDate)
  if (filters.toDate) params.set('to_date', filters.toDate)
  if (filters.costCenter) params.set('cost_center', filters.costCenter)
  const qs = params.toString()
  return apiRequest<MedicalRecordChecklistReport>(
    `/api/method/healthcare.api.medical_record_checklist.get_medical_record_checklist${qs ? `?${qs}` : ''}`
  )
}
