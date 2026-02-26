export interface EnvironmentalChecklistDetail {
  name: string
  item_name: string
  checked: boolean
}

export interface EnvironmentalChecklistResponse {
  admission: string
  patient: string
  patient_name?: string
  environmental_checklist_template?: string
  details: EnvironmentalChecklistDetail[]
}

import { apiRequest } from './apiClient'

export async function fetchEnvironmentalChecklist(admissionName: string): Promise<EnvironmentalChecklistResponse> {
  const params = new URLSearchParams()
  params.append('admission_name', admissionName)
  const res = await fetch(`/api/method/healthcare.healthcare.api.environmental_checklist.get_environmental_checklist?${params.toString()}`)
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load environmental checklist')
  }
  return (data?.message || {
    admission: admissionName,
    patient: '',
    patient_name: '',
    environmental_checklist_template: undefined,
    details: [],
  }) as EnvironmentalChecklistResponse
}

export async function applyEnvironmentalChecklistTemplate(
  admissionName: string,
  templateName?: string
): Promise<EnvironmentalChecklistResponse> {
  const body: Record<string, unknown> = { admission_name: admissionName }
  if (templateName) body.template_name = templateName

  const res = await fetch('/api/method/healthcare.healthcare.api.environmental_checklist.apply_environmental_checklist_template', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to apply environmental checklist template')
  }
  return data?.message as EnvironmentalChecklistResponse
}

export async function updateEnvironmentalChecklist(
  admissionName: string,
  details: EnvironmentalChecklistDetail[]
): Promise<EnvironmentalChecklistResponse> {
  return apiRequest<EnvironmentalChecklistResponse>(
    '/api/method/healthcare.healthcare.api.environmental_checklist.update_environmental_checklist',
    {
      method: 'POST',
      body: JSON.stringify({
        admission_name: admissionName,
        details,
      }),
    }
  )
}

