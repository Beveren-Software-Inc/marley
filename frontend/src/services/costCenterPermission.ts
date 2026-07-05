import { ensureCSRF } from './apiClient'

export interface CostCenterPermissionState {
  cost_center: string
  is_exempt: boolean
}

export async function getUserCostCenterPermission(): Promise<CostCenterPermissionState> {
  const res = await fetch('/api/method/healthcare.api.common.get_user_cost_center_permission', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = await res.json()
  if (data?.message) return data.message
  throw new Error('Failed to load branch preference')
}

export async function setUserCostCenterPermission(
  cost_center: string,
): Promise<{ status: string; cost_center: string; message?: string }> {
  const csrf = (await ensureCSRF()) ?? ''
  const body = new URLSearchParams()
  body.set('cost_center', cost_center)
  const res = await fetch('/api/method/healthcare.api.common.set_cost_center_permission', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Frappe-CSRF-Token': csrf,
      Accept: 'application/json',
    },
    body: body.toString(),
  })
  const data = await res.json()
  if (data?.message) return data.message
  const exc = data?._server_messages || data?.exc
  throw new Error(
    exc ? JSON.parse(JSON.parse(exc)?.[0])?.message ?? 'Failed to save branch' : 'Failed to save branch',
  )
}
