/** Portal branch is UI-only (localStorage). Do not create Cost Center User Permissions. */

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

export const PORTAL_BRANCH_STORAGE_KEY = 'healthcare_portal_branch'
/** Explicit navbar choice: show every branch (do not auto-fill IP / employee default). */
export const PORTAL_ALL_BRANCHES_KEY = 'healthcare_portal_all_branches'
/** Session flag: user manually picked a branch other than the IP-mapped one. */
export const IP_BRANCH_OVERRIDE_KEY = 'healthcare_ip_branch_override'
/** Set on login so the next resolve ignores override and uses IP branch. */
export const IP_BRANCH_FORCE_ON_AUTH_KEY = 'healthcare_force_ip_on_auth'

export function isAllBranchesSelected(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(PORTAL_ALL_BRANCHES_KEY) === '1'
  } catch {
    return false
  }
}

export function setAllBranchesSelected(active: boolean) {
  try {
    if (typeof localStorage === 'undefined') return
    if (active) {
      localStorage.setItem(PORTAL_ALL_BRANCHES_KEY, '1')
      localStorage.removeItem(PORTAL_BRANCH_STORAGE_KEY)
    } else {
      localStorage.removeItem(PORTAL_ALL_BRANCHES_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function getPortalBranch(): string {
  try {
    if (typeof localStorage === 'undefined') return ''
    if (isAllBranchesSelected()) return ''
    return (localStorage.getItem(PORTAL_BRANCH_STORAGE_KEY) || '').trim()
  } catch {
    return ''
  }
}

export function setPortalBranch(costCenter: string) {
  try {
    if (typeof localStorage === 'undefined') return
    const value = (costCenter || '').trim()
    if (value) {
      localStorage.removeItem(PORTAL_ALL_BRANCHES_KEY)
      localStorage.setItem(PORTAL_BRANCH_STORAGE_KEY, value)
    } else {
      localStorage.removeItem(PORTAL_BRANCH_STORAGE_KEY)
    }
  } catch {
    /* ignore */
  }
}

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

/** Call on login: next resolve must follow network IP, not a mid-session override. */
export function markForceIpBranchOnAuth() {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.removeItem(IP_BRANCH_OVERRIDE_KEY)
    sessionStorage.setItem(IP_BRANCH_FORCE_ON_AUTH_KEY, '1')
    setAllBranchesSelected(false)
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
    setAllBranchesSelected(false)
    return true
  } catch {
    return false
  }
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
 * Resolve IP → branch. Never creates User Permissions.
 * On login force, writes the mapped branch into localStorage (UI filter only).
 */
export async function applyBranchFromIpMapper(opts?: {
  skipApply?: boolean
}): Promise<IpMapperBranchResult> {
  const forceOnAuth = consumeForceIpBranchOnAuth()
  const params = new URLSearchParams()
  const skipApply =
    !forceOnAuth && (opts?.skipApply || hasIpBranchOverride() || isAllBranchesSelected())
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
  if (!data?.message) {
    const exc = data?._server_messages || data?.exc
    throw new Error(
      exc
        ? JSON.parse(JSON.parse(exc)?.[0])?.message ?? 'Failed to resolve branch from IP'
        : 'Failed to resolve branch from IP',
    )
  }

  const result = data.message as IpMapperBranchResult
  const mapped = (result.ip_mapped_cost_center || result.cost_center || '').trim()

  // UI-only: persist portal branch in localStorage when IP applies (not during override).
  if (result.matched && mapped && !skipApply) {
    setPortalBranch(mapped)
  }

  return result
}
