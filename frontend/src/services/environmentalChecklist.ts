import { apiRequest } from './apiClient'

export interface EnvironmentalChecklistDetail {
  name: string
  item_name: string
  checked: boolean
}

export interface EnvironmentalChecklistRecord {
  name: string
  patient: string
  patient_name?: string
  cost_center?: string
  practitioner?: string
  practitioner_name?: string
  inpatient_admission?: string
  patient_visit?: string
  environmental_checklist_template?: string
  creation?: string
  modified?: string
  completed_count?: number
  total_count?: number
  details?: EnvironmentalChecklistDetail[]
}

export interface EnvironmentalChecklistTemplate {
  name: string
  default?: boolean
  checklist_items: { item_name: string }[]
}

export interface EnvironmentalChecklistListFilters {
  dateFrom?: string
  dateTo?: string
  inpatientAdmission?: string
}

export async function fetchEnvironmentalChecklists(
  patient?: string,
  limit = 50,
  filters: EnvironmentalChecklistListFilters = {}
): Promise<EnvironmentalChecklistRecord[]> {
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  params.append('limit', String(limit))
  if (filters.dateFrom) params.append('date_from', filters.dateFrom)
  if (filters.dateTo) params.append('date_to', filters.dateTo)
  if (filters.inpatientAdmission) params.append('inpatient_admission', filters.inpatientAdmission)

  const res = await fetch(
    `/api/method/healthcare.healthcare.api.environmental_checklist.list_environmental_checklists?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load environmental checklists')
  }
  return data?.message || []
}

export async function fetchEnvironmentalChecklist(checklistName: string): Promise<EnvironmentalChecklistRecord> {
  const params = new URLSearchParams()
  params.append('checklist_name', checklistName)
  const res = await fetch(
    `/api/method/healthcare.healthcare.api.environmental_checklist.get_environmental_checklist?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load environmental checklist')
  }
  return data?.message as EnvironmentalChecklistRecord
}

export async function fetchEnvironmentalChecklistTemplates(): Promise<EnvironmentalChecklistTemplate[]> {
  const res = await fetch(
    '/api/method/healthcare.healthcare.api.environmental_checklist.get_environmental_checklist_templates'
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load templates')
  }
  return data?.message || []
}

export async function fetchDefaultEnvironmentalChecklistTemplate(): Promise<EnvironmentalChecklistTemplate | null> {
  const res = await fetch(
    '/api/method/healthcare.healthcare.api.environmental_checklist.get_default_environmental_checklist_template'
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load default template')
  }
  return data?.message || null
}

export async function createEnvironmentalChecklist(payload: {
  patient: string
  inpatient_admission?: string
  patient_visit?: string
  template_name?: string
  cost_center?: string
  practitioner?: string
}): Promise<EnvironmentalChecklistRecord> {
  return apiRequest<EnvironmentalChecklistRecord>(
    '/api/method/healthcare.healthcare.api.environmental_checklist.create_environmental_checklist',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
}

export async function applyEnvironmentalChecklistTemplate(
  checklistName: string,
  templateName: string
): Promise<EnvironmentalChecklistRecord> {
  return apiRequest<EnvironmentalChecklistRecord>(
    '/api/method/healthcare.healthcare.api.environmental_checklist.apply_environmental_checklist_template',
    {
      method: 'POST',
      body: JSON.stringify({
        checklist_name: checklistName,
        template_name: templateName,
      }),
    }
  )
}

export interface EnvironmentalChecklistUpdateOptions {
  costCenter?: string
  practitioner?: string
}

export async function updateEnvironmentalChecklist(
  checklistName: string,
  details: EnvironmentalChecklistDetail[],
  options: EnvironmentalChecklistUpdateOptions = {}
): Promise<EnvironmentalChecklistRecord> {
  return apiRequest<EnvironmentalChecklistRecord>(
    '/api/method/healthcare.healthcare.api.environmental_checklist.update_environmental_checklist',
    {
      method: 'POST',
      body: JSON.stringify({
        checklist_name: checklistName,
        details: details.map((d) => ({ name: d.name, checked: d.checked })),
        cost_center: options.costCenter,
        practitioner: options.practitioner,
      }),
    }
  )
}
