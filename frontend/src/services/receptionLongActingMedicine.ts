import type { LongActingMedicineRow } from './longActingMedicine'
import { apiRequest } from './apiClient'

export interface ReceptionLongActingFilters {
  start_date?: string
  frequency?: string
  patient?: string
  limit?: number
  offset?: number
}

export async function fetchReceptionLongActingMedicineList(
  filters: ReceptionLongActingFilters = {}
): Promise<LongActingMedicineRow[]> {
  const params: Record<string, unknown> = {}
  if (filters.start_date) params.start_date = filters.start_date
  if (filters.frequency) params.frequency = filters.frequency
  if (filters.patient) params.patient = filters.patient
  if (filters.limit != null) params.limit = filters.limit
  if (filters.offset != null) params.offset = filters.offset

  return apiRequest<LongActingMedicineRow[]>(
    '/api/method/healthcare.api.common.get_long_acting_medicine_list_for_reception',
    {
      method: 'POST',
      body: JSON.stringify(params),
    }
  )
}

