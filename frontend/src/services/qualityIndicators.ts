import { apiRequest } from './apiClient'

export interface QualityIndicatorRow {
  indicator: string
  indicator_name: string
  indicator_code?: string
  category: string
  description?: string
  area_monitored?: string
  numerator_description?: string
  denominator_description?: string
  indicator_formula?: string
  source_of_data?: string
  responsible_person?: string
  reported_to?: string
  frequency?: string
  selection_criteria?: string[]
  numerator: number
  denominator: number
  value: number
  unit: string
  target_value?: number
  target_direction?: string
  met: number
  period_start: string
  period_end: string
}

export interface CreateQualityIndicatorInput {
  indicator_name: string
  indicator_code?: string
  category: string
  description?: string
  area_monitored?: string
  numerator_description?: string
  denominator_description?: string
  indicator_formula?: string
  source_of_data?: string
  responsible_person?: string
  reported_to?: string
  frequency?: string
  is_active?: boolean
  owner_role?: string
  criteria_patient_safety_goals?: boolean
  criteria_high_cost?: boolean
  criteria_high_volume?: boolean
  criteria_problem_prone?: boolean
  criteria_study_for_improvement?: boolean
  criteria_hospital_requirement?: boolean
  numerator_doctype?: string
  numerator_filters?: string
  numerator_date_field?: string
  denominator_doctype?: string
  denominator_filters?: string
  denominator_date_field?: string
  unit?: string
  target_value?: number
  target_direction?: string
}

export interface PortalDoctypeOption {
  name: string
  label: string
}

export async function fetchPortalDoctypes(search?: string): Promise<PortalDoctypeOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)

  const res = await fetch(
    `/api/method/healthcare.api.common.get_portal_doctypes${
      params.toString() ? `?${params.toString()}` : ''
    }`
  )
  const data = await res.json()

  if (data?.message && Array.isArray(data.message)) {
    return data.message as PortalDoctypeOption[]
  }
  return []
}

export async function createQualityIndicator(
  data: CreateQualityIndicatorInput
): Promise<{ name: string }> {
  const body = {
    doctype: 'Quality Indicator',
    indicator_name: data.indicator_name,
    indicator_code: data.indicator_code,
    category: data.category,
    description: data.description,
    area_monitored: data.area_monitored,
    numerator_description: data.numerator_description,
    denominator_description: data.denominator_description,
    indicator_formula: data.indicator_formula,
    source_of_data: data.source_of_data,
    responsible_person: data.responsible_person,
    reported_to: data.reported_to,
    frequency: data.frequency,
    is_active: data.is_active !== false ? 1 : 0,
    owner_role: data.owner_role,
    criteria_patient_safety_goals: data.criteria_patient_safety_goals ? 1 : 0,
    criteria_high_cost: data.criteria_high_cost ? 1 : 0,
    criteria_high_volume: data.criteria_high_volume ? 1 : 0,
    criteria_problem_prone: data.criteria_problem_prone ? 1 : 0,
    criteria_study_for_improvement: data.criteria_study_for_improvement ? 1 : 0,
    criteria_hospital_requirement: data.criteria_hospital_requirement ? 1 : 0,
    numerator_doctype: data.numerator_doctype,
    numerator_filters: data.numerator_filters,
    numerator_date_field: data.numerator_date_field,
    denominator_doctype: data.denominator_doctype,
    denominator_filters: data.denominator_filters,
    denominator_date_field: data.denominator_date_field,
    unit: data.unit,
    target_value: data.target_value,
    target_direction: data.target_direction,
  }

  return apiRequest<{ name: string }>('/api/resource/Quality%20Indicator', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const BASE = '/api/method/healthcare.api.quality_indicators'

export async function fetchIndicatorDashboard(params: {
  period_start?: string
  period_end?: string
  cost_center?: string
  category?: string
}): Promise<QualityIndicatorRow[]> {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v) qs.set(k, v)
  })
  const res = await apiRequest<QualityIndicatorRow[] | { message: QualityIndicatorRow[] }>(
    `${BASE}.get_indicator_dashboard?${qs.toString()}`
  )
  if (Array.isArray(res)) return res
  if (res && Array.isArray(res.message)) return res.message
  return []
}

export async function snapshotIndicators(params: {
  period_start?: string
  period_end?: string
  cost_center?: string
}): Promise<number> {
  const res = await apiRequest<number | { message: number }>(`${BASE}.snapshot_indicators`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
  if (typeof res === 'number') return res
  if (res && typeof res.message === 'number') return res.message
  return 0
}