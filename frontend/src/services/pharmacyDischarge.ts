import { apiRequest } from './apiClient'

const BASE = '/api/method/healthcare.api.pharmacy'

export interface PharmacyDischargeChecklistItem {
  name: string
  action_required?: string
  department?: string
  department_label?: string
  department_2?: string
  department_2_label?: string
  user?: string
  name1?: string
  date_time?: string
  click?: boolean | number
  description?: string
  sr_num?: string
}

export interface PharmacyDischargeChecklistResponse {
  admission: string
  patient?: string
  patient_name?: string
  admission_status?: string
  discharge_name?: string
  checklist_items: PharmacyDischargeChecklistItem[]
  pending_count: number
  completed_count: number
}

export interface PharmacyDischargePendingRow {
  admission: string
  discharge_name: string
  patient?: string
  patient_name?: string
  pending_count: number
  total_count: number
}

export async function fetchPharmacyDischargePending(
  limit = 25
): Promise<PharmacyDischargePendingRow[]> {
  const rows = await apiRequest<PharmacyDischargePendingRow[]>(
    `${BASE}.list_pharmacy_discharge_pending?limit=${limit}`
  )
  return Array.isArray(rows) ? rows : []
}

export async function fetchPharmacyDischargeChecklist(
  admissionName: string
): Promise<PharmacyDischargeChecklistResponse> {
  const params = new URLSearchParams({ admission_name: admissionName })
  return apiRequest<PharmacyDischargeChecklistResponse>(
    `${BASE}.get_pharmacy_discharge_checklist?${params}`
  )
}

export async function savePharmacyDischargeChecklist(
  admissionName: string,
  checklist: PharmacyDischargeChecklistItem[]
): Promise<PharmacyDischargeChecklistResponse> {
  return apiRequest<PharmacyDischargeChecklistResponse>(
    `${BASE}.save_pharmacy_discharge_checklist`,
    {
      method: 'POST',
      body: JSON.stringify({
        admission_name: admissionName,
        checklist,
      }),
    }
  )
}
