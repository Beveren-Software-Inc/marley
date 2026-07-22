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
