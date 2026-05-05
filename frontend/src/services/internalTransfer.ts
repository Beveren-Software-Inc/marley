import { apiRequest } from './apiClient'

export interface InternalTransferRow {
  name: string
  inpatient_admission: string
  patient: string
  patient_name?: string
  transfer_datetime: string
  from_cost_center: string
  to_cost_center: string
  from_service_unit?: string
  to_service_unit?: string
  transferred_by?: string
  reason?: string
  company?: string
}

export async function getInternalTransfers(params?: {
  patient?: string
  admission?: string
  search?: string
  limit?: number
  offset?: number
}): Promise<InternalTransferRow[]> {
  const qs = new URLSearchParams()
  if (params?.patient) qs.set('patient', params.patient)
  if (params?.admission) qs.set('admission', params.admission)
  if (params?.search) qs.set('search', params.search)
  qs.set('limit', String(params?.limit ?? 50))
  qs.set('offset', String(params?.offset ?? 0))

  const out = await apiRequest<InternalTransferRow[]>(
    `/api/method/healthcare.api.inpatient_admission.get_internal_transfers?${qs.toString()}`
  )
  return Array.isArray(out) ? out : []
}
