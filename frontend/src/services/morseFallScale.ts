import { apiRequest } from './apiClient'

export interface MorseFallScaleDetailRow {
  text_message: string
  points: number
}

export interface MorseFallScale {
  name: string
  trans_no?: string
  admission_no: string
  patient_no: string
  patient_name?: string
  orderer_number?: string
  company?: string
  practitioner?: string
  practitioner_name?: string
  cost_center?: string
  date?: string
  total_points?: number
  modified?: string
  morse_fall_scale_detail?: MorseFallScaleDetailRow[]
}

export interface MorseFallScaleListFilters {
  dateFrom?: string
  dateTo?: string
  practitioner?: string
}

export async function fetchMorseFallScales(
  limit: number = 50,
  offset: number = 0,
  patient?: string,
  filters: MorseFallScaleListFilters = {}
): Promise<MorseFallScale[]> {
  // Read through the whitelisted portal endpoint (not /api/resource) so all portal
  // roles — including Nurse — can load the list. REST grants read only to
  // Nursing User / Physician / System Manager, which 403s for a plain Nurse.
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  if (filters.practitioner) params.append('practitioner', filters.practitioner)
  if (filters.dateFrom) params.append('from_date', filters.dateFrom)
  if (filters.dateTo) params.append('to_date', filters.dateTo)
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())

  return apiRequest<MorseFallScale[]>(
    `/api/method/healthcare.api.morse_fall_scale.get_morse_fall_scale_list?${params.toString()}`
  )
}

export async function fetchMorseFallScale(name: string): Promise<MorseFallScale> {
  const params = new URLSearchParams({ name })
  return apiRequest<MorseFallScale>(
    `/api/method/healthcare.api.morse_fall_scale.get_morse_fall_scale?${params.toString()}`
  )
}

export async function createMorseFallScale(
  data: Omit<MorseFallScale, 'name' | 'total_points' | 'modified'>
): Promise<MorseFallScale> {
  return apiRequest<MorseFallScale>(
    '/api/method/healthcare.api.morse_fall_scale.create_morse_fall_scale',
    {
      method: 'POST',
      body: JSON.stringify({ data }),
    }
  )
}
