import type { ScreenGroup } from './doctorScreens'

/** Must match Cost Center Select options (custom field on Cost Center). */
export const CARE_TYPE_OP_ONLY = 'OP Only'
export const CARE_TYPE_IP_ONLY = 'IP Only'
export const CARE_TYPE_BOTH = 'Both IP & OP'

export type CostCenterCareScope = 'both' | 'op_only' | 'ip_only'

export function careScopeFromCostCenterField(v: string | null | undefined): CostCenterCareScope {
  const s = (v || '').trim()
  if (s === CARE_TYPE_OP_ONLY || /^op\s*only$/i.test(s)) return 'op_only'
  if (s === CARE_TYPE_IP_ONLY || /^ip\s*only$/i.test(s)) return 'ip_only'
  return 'both'
}

/** Doctor sidebar / deep links blocked for OP-only sites */
const OP_ONLY_DOCTOR_SCREEN_IDS = new Set([
  'admission',
  'df',
  'gm',
  'single-prescription',
])

/** Doctor sidebar / deep links blocked for IP-only sites */
const IP_ONLY_DOCTOR_SCREEN_IDS = new Set(['iop', 'pvh', 'op'])

const OP_ONLY_NURSE_SCREEN_IDS = new Set([
  'single-prescription',
  'n-given',
  'n-daily-med',
  'n-ref',
  'n-sick',
  'n-reg',
  'admission',
  'n-discharge',
  'n-package',
  // Daily Routine Care folder
  'n-assess',
  'n-groom',
  'n-sleep',
  'n-mental',
  'n-env',
  'n-fall',
  'n-grooming',
])

const OP_ONLY_NURSE_GROUP_TITLES = new Set(['Daily Routine Care', 'Admission & Discharge'])

const IP_ONLY_NURSE_SCREEN_IDS = new Set(['n-op'])

/** Reception sidebar + landing: OP-only hides all IP admission/discharge entry points */
const OP_ONLY_RECEPTION_SCREEN_IDS = new Set(['r-ip-adm', 'r-reg', 'r-discharge'])

const IP_ONLY_RECEPTION_SCREEN_IDS = new Set([
  'r-visit',
  'r-new-visit',
  'r-daily-auto-visit',
])

function filterGroupsByScreenIds(
  groups: ScreenGroup[],
  removeIds: Set<string>,
  removeGroupTitles?: Set<string>
): ScreenGroup[] {
  return groups
    .filter((g) => !(removeGroupTitles?.has(g.groupTitle)))
    .map((g) => ({
      ...g,
      screens: g.screens.filter((s) => !removeIds.has(s.id)),
    }))
    .filter((g) => g.screens.length > 0)
}

export function filterDoctorScreenGroups(
  groups: ScreenGroup[],
  scope: CostCenterCareScope
): ScreenGroup[] {
  if (scope === 'both') return groups
  if (scope === 'op_only') {
    return filterGroupsByScreenIds(groups, OP_ONLY_DOCTOR_SCREEN_IDS)
  }
  return filterGroupsByScreenIds(groups, IP_ONLY_DOCTOR_SCREEN_IDS)
}

export function filterNurseScreenGroups(groups: ScreenGroup[], scope: CostCenterCareScope): ScreenGroup[] {
  if (scope === 'both') return groups
  if (scope === 'op_only') {
    return filterGroupsByScreenIds(groups, OP_ONLY_NURSE_SCREEN_IDS, OP_ONLY_NURSE_GROUP_TITLES)
  }
  return filterGroupsByScreenIds(groups, IP_ONLY_NURSE_SCREEN_IDS)
}

export function filterReceptionScreenGroups(
  groups: ScreenGroup[],
  scope: CostCenterCareScope
): ScreenGroup[] {
  if (scope === 'both') return groups
  if (scope === 'op_only') {
    return filterGroupsByScreenIds(groups, OP_ONLY_RECEPTION_SCREEN_IDS)
  }
  if (scope === 'ip_only') {
    return filterGroupsByScreenIds(groups, IP_ONLY_RECEPTION_SCREEN_IDS)
  }
  return groups
}

/** If current ?screen= is not allowed for this scope, return a safe fallback (omit or use first visible). */
export function isDoctorScreenBlocked(screen: string | null | undefined, scope: CostCenterCareScope): boolean {
  if (!screen || scope === 'both') return false
  if (scope === 'op_only') return OP_ONLY_DOCTOR_SCREEN_IDS.has(screen)
  return IP_ONLY_DOCTOR_SCREEN_IDS.has(screen)
}

export function isNurseScreenBlocked(screen: string | null | undefined, scope: CostCenterCareScope): boolean {
  if (!screen || scope === 'both') return false
  if (scope === 'op_only') return OP_ONLY_NURSE_SCREEN_IDS.has(screen)
  if (scope === 'ip_only') return IP_ONLY_NURSE_SCREEN_IDS.has(screen)
  return false
}

export function isReceptionScreenBlocked(screen: string | null | undefined, scope: CostCenterCareScope): boolean {
  if (!screen || scope === 'both') return false
  if (scope === 'op_only') {
    return OP_ONLY_RECEPTION_SCREEN_IDS.has(screen)
  }
  if (scope === 'ip_only') {
    return IP_ONLY_RECEPTION_SCREEN_IDS.has(screen)
  }
  return false
}
