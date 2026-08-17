import { apiRequest } from './apiClient'

export interface QualityIndicatorRow {
  indicator: string
  indicator_name: string
  indicator_code?: string
  category: string
  description?: string
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
  frequency?: string
  is_active?: boolean
  owner_role?: string
  numerator_doctype: string
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
    frequency: data.frequency,
    is_active: data.is_active !== false ? 1 : 0,
    owner_role: data.owner_role,
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
  const res = await apiRequest<{ message: QualityIndicatorRow[] }>(
    `${BASE}.get_indicator_dashboard?${qs.toString()}`
  )
  return res?.message ?? []
}

export async function snapshotIndicators(params: {
  period_start?: string
  period_end?: string
  cost_center?: string
}): Promise<number> {
  const res = await apiRequest<{ message: number }>(`${BASE}.snapshot_indicators`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
  return res?.message ?? 0
}