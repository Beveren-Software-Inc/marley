import { ensureCSRF } from './apiClient'

export interface CostCenterPermissionState {
  cost_center: string
  is_exempt: boolean
}

export interface IpMapperBranchResult {
  activated: boolean
  matched: boolean
  applied: boolean
  overridden?: boolean
  client_ip: string
  matched_ip?: string | null
  /** Cost center suggested by the network IP (may differ from current selection). */
  ip_mapped_cost_center?: string
  cost_center: string
  previous_cost_center: string
}

/** Session flag: user manually picked a branch other than the IP-mapped one. */
export const IP_BRANCH_OVERRIDE_KEY = 'healthcare_ip_branch_override'

export function hasIpBranchOverride(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(IP_BRANCH_OVERRIDE_KEY) === '1'
  } catch {
    return false
  }
}

export function setIpBranchOverride(active: boolean) {
  try {
    if (typeof sessionStorage === 'undefined') return
    if (active) sessionStorage.setItem(IP_BRANCH_OVERRIDE_KEY, '1')
    else sessionStorage.removeItem(IP_BRANCH_OVERRIDE_KEY)
  } catch {
    /* ignore */
  }
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

function isLocalBenchHost(): boolean {
  if (typeof window === 'undefined') return false
  const host = (window.location.hostname || '').toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

/** Best-effort public egress IP (used only when browsing local bench). */
async function detectPublicEgressIp(): Promise<string | null> {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const data = await res.json()
    const ip = typeof data?.ip === 'string' ? data.ip.trim() : ''
    return ip || null
  } catch {
    return null
  }
}

/**
 * Auto-set Cost Center from Healthcare Settings IP Mapper when Activate IP Mapper is on.
 * Uses GET to avoid CSRF races right after login.
 */
export async function applyBranchFromIpMapper(opts?: {
  skipApply?: boolean
}): Promise<IpMapperBranchResult> {
  const params = new URLSearchParams()
  if (opts?.skipApply || hasIpBranchOverride()) {
    params.set('skip_apply', '1')
  }
  if (isLocalBenchHost()) {
    const publicIp = await detectPublicEgressIp()
    if (publicIp) params.set('reported_public_ip', publicIp)
  }
  const qs = params.toString()
  const url =
    '/api/method/healthcare.api.common.apply_branch_from_ip_mapper' + (qs ? `?${qs}` : '')

  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = await res.json()
  if (data?.message) return data.message as IpMapperBranchResult
  const exc = data?._server_messages || data?.exc
  throw new Error(
    exc
      ? JSON.parse(JSON.parse(exc)?.[0])?.message ?? 'Failed to resolve branch from IP'
      : 'Failed to resolve branch from IP',
  )
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
