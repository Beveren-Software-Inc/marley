import { apiRequest, ensureCSRF } from './apiClient'

export interface PractitionerUnavailabilityRow {
  name: string
  tran_num: string
  posting_date?: string
  start_date: string
  end_date: string
  doctor_id: string
  practitioner_name?: string
  is_cancel: number
  any_remarks?: string
  branch?: string
  cr_date?: string
  up_date?: string
}

export interface CreatePractitionerUnavailabilityInput {
  doctor_id: string
  start_date: string
  end_date: string
  branch?: string
  any_remarks?: string
  is_cancel?: number
}

export async function fetchPractitionerUnavailabilities(params?: {
  limit?: number
  offset?: number
  doctor_id?: string
  branch?: string
  include_cancelled?: boolean
}): Promise<PractitionerUnavailabilityRow[]> {
  const search = new URLSearchParams()
  if (params?.limit != null) search.set('limit', String(params.limit))
  if (params?.offset != null) search.set('offset', String(params.offset))
  if (params?.doctor_id) search.set('doctor_id', params.doctor_id)
  if (params?.branch) search.set('branch', params.branch)
  search.set('include_cancelled', params?.include_cancelled === false ? '0' : '1')
  const qs = search.toString()
  return apiRequest<PractitionerUnavailabilityRow[]>(
    `/api/method/healthcare.api.practitioner_unavailability.get_practitioner_unavailabilities${qs ? `?${qs}` : ''}`
  )
}

export async function createPractitionerUnavailability(
  data: CreatePractitionerUnavailabilityInput
): Promise<PractitionerUnavailabilityRow> {
  const csrf = await ensureCSRF()
  const res = await fetch('/api/method/healthcare.api.practitioner_unavailability.create_practitioner_unavailability', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify(data),
  })
  const json = await res.json()
  if (json?.exc) {
    throw new Error(typeof json.message === 'string' ? json.message : 'Failed to create practitioner unavailability')
  }
  return json.message as PractitionerUnavailabilityRow
}

export async function updatePractitionerUnavailability(
  name: string,
  data: Partial<Pick<PractitionerUnavailabilityRow, 'is_cancel' | 'any_remarks' | 'start_date' | 'end_date' | 'branch'>>
): Promise<PractitionerUnavailabilityRow> {
  const csrf = await ensureCSRF()
  const res = await fetch('/api/method/healthcare.api.practitioner_unavailability.update_practitioner_unavailability', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ name, ...data }),
  })
  const json = await res.json()
  if (json?.exc) {
    throw new Error(typeof json.message === 'string' ? json.message : 'Failed to update practitioner unavailability')
  }
  return json.message as PractitionerUnavailabilityRow
}
