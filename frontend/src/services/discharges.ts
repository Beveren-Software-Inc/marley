import { apiRequest } from './apiClient'

export interface Discharge {
  name: string
  admission: string
  admission_date?: string
  file_no: string
  patient_name: string
  discharge_date: string
  discharge_type: string
  discharged_by_user: string
  discharged_by_user_name?: string
  final_discharge_user_id?: string
  final_discharge_user_name?: string
  receiving_doctors?: string
  receiving_doctor_name?: string
  discharge_template?: string
  template_name?: string
  docstatus: number
  cost_center?: string
}

export interface DischargesPaginatedResponse {
  data: Discharge[]
  total_count: number
}

export async function fetchDischarges(
  limit: number = 20,
  offset: number = 0,
  patient?: string,
  admission?: string,
  search?: string,
  fromDate?: string,
  toDate?: string,
  status?: string,
  dischargeType?: string
): Promise<DischargesPaginatedResponse> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (admission) params.append('admission', admission)
  if (search && search.trim()) params.append('search', search.trim())
  if (fromDate) params.append('from_date', fromDate)
  if (toDate) params.append('to_date', toDate)
  if (status) params.append('status', status)
  if (dischargeType) params.append('discharge_type', dischargeType)

  const result = await apiRequest<any>(
    `/api/method/healthcare.api.discharge.get_discharges?${params.toString()}`
  )

  if (result && typeof result === 'object' && 'data' in result) {
    return { data: result.data as Discharge[], total_count: result.total_count ?? 0 }
  }
  if (Array.isArray(result)) {
    return { data: result as Discharge[], total_count: result.length }
  }
  return { data: [], total_count: 0 }
}





