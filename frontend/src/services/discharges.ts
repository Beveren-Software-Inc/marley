import { apiRequest } from './apiClient'
import type { DischargeChecklistStatus } from '../utils/dischargeChecklistStatus'

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
  checklist_status?: DischargeChecklistStatus
  checklist_total?: number
  checklist_completed?: number
  checklist_incomplete?: number
}

export interface DischargeChecklistRow {
  name?: string
  action_required?: string
  department?: string
  user?: string
  name1?: string
  date_time?: string
  click?: number | boolean
  description?: string
}

export interface DischargePatientDocument {
  name?: string
  file_name?: string
  document_type?: string
  transaction_no?: string | number
  upload_remarks?: string
  document?: string
}

export interface DischargePatientRelative {
  name?: string
  relationship_with_patient?: string
  relative_name?: string
  relative_phone_no?: string
  relative_alternative_phone_no?: string
  relative_alternative_phone_no_2?: string
  cpr__id_no?: string
  any_remarks?: string
}

export interface DischargeStoppedMedication {
  name?: string
  prescription?: string
  drug?: string
  drug_name: string
  reason_stopped: string
}

export interface DischargeDoc extends Discharge {
  discharge_time?: string
  final_discharge_date?: string
  final_discharge_time?: string
  ama_type?: string
  discharge_treatment_plan?: string
  discharge_reason?: string
  discharge_diagnosis?: string
  discharge_conditions?: string
  discharge_instructions?: string
  discharge_medic_stopped_reason?: string
  final_exam_mental_status_summary?: string
  management_in_hospital?: string
  prognosis?: string
  next_appointment_date?: string
  next_appointment_time?: string
  discharge_receptionist?: string
  discharge_doctor?: string
  discharge_nurse?: string
  nurse_discharge_template?: string
  user_name?: string
  final_discharger_username?: string
  discharge_checklist?: DischargeChecklistRow[]
  nursing_checklist?: DischargeChecklistRow[]
  patient_documents?: DischargePatientDocument[]
  patient_relatives?: DischargePatientRelative[]
  stopped_medications?: DischargeStoppedMedication[]
  creation?: string
  modified?: string
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
  dischargeType?: string,
  excludeCancelled?: boolean
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
  if (excludeCancelled) params.append('exclude_cancelled', '1')

  const result = await apiRequest<DischargesPaginatedResponse | Discharge[]>(
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

export async function fetchDischarge(name: string): Promise<DischargeDoc> {
  return apiRequest<DischargeDoc>(
    `/api/method/healthcare.api.discharge.get_discharge?${new URLSearchParams({ name }).toString()}`
  )
}
