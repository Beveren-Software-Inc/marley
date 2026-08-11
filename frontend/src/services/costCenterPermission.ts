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
/** Set on login so the next apply ignores any leftover override and forces IP branch. */
export const IP_BRANCH_FORCE_ON_AUTH_KEY = 'healthcare_force_ip_on_auth'

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

/** Call on login/logout: next authenticated load must follow network IP, not an old branch permission. */
export function markForceIpBranchOnAuth() {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.removeItem(IP_BRANCH_OVERRIDE_KEY)
    sessionStorage.setItem(IP_BRANCH_FORCE_ON_AUTH_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function clearIpBranchSessionFlags() {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.removeItem(IP_BRANCH_OVERRIDE_KEY)
    sessionStorage.removeItem(IP_BRANCH_FORCE_ON_AUTH_KEY)
  } catch {
    /* ignore */
  }
}

function consumeForceIpBranchOnAuth(): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false
    if (sessionStorage.getItem(IP_BRANCH_FORCE_ON_AUTH_KEY) !== '1') return false
    sessionStorage.removeItem(IP_BRANCH_FORCE_ON_AUTH_KEY)
    sessionStorage.removeItem(IP_BRANCH_OVERRIDE_KEY)
    return true
  } catch {
    return false
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
 *
 * On login (`markForceIpBranchOnAuth`), always applies the IP-mapped branch even if the
 * user still has a User Permission for another cost center. Mid-session manual overrides
 * are respected until the next login.
 */
export async function applyBranchFromIpMapper(opts?: {
  skipApply?: boolean
}): Promise<IpMapperBranchResult> {
  const forceOnAuth = consumeForceIpBranchOnAuth()
  const params = new URLSearchParams()
  // Never skip after a fresh login; otherwise skip only for an explicit mid-session override.
  const skipApply = !forceOnAuth && (opts?.skipApply || hasIpBranchOverride())
  if (skipApply) {
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
