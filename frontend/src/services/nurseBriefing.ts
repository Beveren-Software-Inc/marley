import { apiRequest } from './apiClient'

export interface NurseBriefingWarning {
  name: string
  patient?: string
  warning?: string
  type_of_warning?: string
  warning_message_type?: string
  warning_message_class?: string
  posting_date?: string
  practitioner?: string
  practitioner_name?: string
  high_risk_text?: string
}

export interface NurseBriefingAdmission {
  name: string
  patient: string
  patient_name?: string
  status?: string
  admitted_datetime?: string
  scheduled_date?: string
  medical_department?: string
  primary_practitioner?: string
  primary_practitioner_name?: string
  bed?: string | null
  allergy_summary?: string
  warnings: NurseBriefingWarning[]
  cost_center?: string
}

export interface NurseBriefingLabTest {
  name: string
  patient: string
  patient_name?: string
  lab_test_name?: string
  template?: string
  status?: string
  date?: string
  practitioner?: string
  practitioner_name?: string
  inpatient_record?: string
  department?: string
  creation?: string
  is_group_lab_test?: number
  lab_test_group?: string
  lab_test_group_name?: string
  service_request?: string
}

export interface NurseBriefingLowStockItem {
  item_code: string
  item_name?: string
  current_stock: number
  reorder_level: number
  uom?: string
  status: 'low_stock' | 'out_of_stock'
}

export interface NurseShiftBriefing {
  cost_center?: string | null
  active_admissions: NurseBriefingAdmission[]
  pending_sample_lab_tests: NurseBriefingLabTest[]
  low_stock_items: NurseBriefingLowStockItem[]
}

export type NurseBriefingSection = 'admissions' | 'lab_tests' | 'low_stock'

function briefingUrl(costCenter: string | undefined, section: NurseBriefingSection): string {
  const params = new URLSearchParams({ section })
  if (costCenter) params.set('cost_center', costCenter)
  return `/api/method/healthcare.api.nurse_briefing.get_nurse_shift_briefing?${params}`
}

export async function fetchNurseBriefingAdmissions(costCenter?: string): Promise<{
  cost_center?: string | null
  active_admissions: NurseBriefingAdmission[]
}> {
  const data = await apiRequest<{
    cost_center?: string | null
    active_admissions?: NurseBriefingAdmission[]
  }>(briefingUrl(costCenter, 'admissions'))
  return {
    cost_center: data.cost_center ?? null,
    active_admissions: data.active_admissions ?? [],
  }
}

export async function fetchNurseBriefingLabTests(costCenter?: string): Promise<{
  pending_sample_lab_tests: NurseBriefingLabTest[]
}> {
  const data = await apiRequest<{ pending_sample_lab_tests?: NurseBriefingLabTest[] }>(
    briefingUrl(costCenter, 'lab_tests'),
  )
  return { pending_sample_lab_tests: data.pending_sample_lab_tests ?? [] }
}

export async function fetchNurseBriefingLowStock(costCenter?: string): Promise<{
  low_stock_items: NurseBriefingLowStockItem[]
}> {
  const data = await apiRequest<{ low_stock_items?: NurseBriefingLowStockItem[] }>(
    briefingUrl(costCenter, 'low_stock'),
  )
  return { low_stock_items: data.low_stock_items ?? [] }
}
