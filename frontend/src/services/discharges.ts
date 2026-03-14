import { apiRequest } from './apiClient'

export interface Discharge {
  name: string
  admission: string
  file_no?: string
  patient_name?: string
  discharge_date?: string
  discharge_type?: string
  discharged_by_user?: string
  discharged_by_user_name?: string
  final_discharge_user_id?: string
  final_discharge_user_name?: string
  receiving_doctors?: string
  receiving_doctor_name?: string
  discharge_template?: string
  template_name?: string
  docstatus?: number
}

export async function fetchDischarges(
  limit: number = 50,
  offset: number = 0,
  patient?: string,
  admission?: string,
  search?: string
): Promise<Discharge[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (admission) params.append('admission', admission)
  if (search && search.trim()) params.append('search', search.trim())

  const result = await apiRequest<Discharge[]>(
    `/api/method/healthcare.api.discharge.get_discharges?${params.toString()}`
  )

  return Array.isArray(result) ? result : []
}





