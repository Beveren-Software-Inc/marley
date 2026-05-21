import type { ScreenGroup } from './doctorScreens'
import type { CareMode } from '../providers/CareContextProvider'

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

/** Doctor screens hidden when the active mode is OP (regardless of cost center scope) */
const OP_MODE_DOCTOR_SCREEN_IDS = new Set(['gm', 'admission', 'df', 'obs'])
const OP_MODE_DOCTOR_GROUP_TITLES = new Set(['Admission & Discharge', 'Observation'])

/** Clinical observation — inpatient only (hidden unless mode is IP) */
const IP_ONLY_OBSERVATION_DOCTOR_SCREEN_IDS = new Set(['obs'])
const IP_ONLY_OBSERVATION_DOCTOR_GROUP_TITLES = new Set(['Observation'])
const IP_ONLY_OBSERVATION_NURSE_SCREEN_IDS = new Set(['n-ob'])
const IP_ONLY_OBSERVATION_NURSE_GROUP_TITLES = new Set(['Observation & Monitoring'])

export function observationsAllowedForMode(mode?: CareMode): boolean {
  return mode === 'IP'
}

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

/** Nurse screens hidden when the active mode is OP (regardless of cost center scope) */
const OP_MODE_NURSE_SCREEN_IDS = new Set(['n-given', 'n-reg', 'n-discharge', 'n-package', 'n-ob'])
const OP_MODE_NURSE_GROUP_TITLES = new Set(['Admission & Discharge', 'Observation & Monitoring'])

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
  scope: CostCenterCareScope,
  mode?: CareMode
): ScreenGroup[] {
  let filtered = groups
  if (scope === 'op_only') {
    filtered = filterGroupsByScreenIds(filtered, OP_ONLY_DOCTOR_SCREEN_IDS)
  } else if (scope === 'ip_only') {
    filtered = filterGroupsByScreenIds(filtered, IP_ONLY_DOCTOR_SCREEN_IDS)
  }
  if (mode === 'OP') {
    filtered = filterGroupsByScreenIds(filtered, OP_MODE_DOCTOR_SCREEN_IDS, OP_MODE_DOCTOR_GROUP_TITLES)
  }
  if (!observationsAllowedForMode(mode)) {
    filtered = filterGroupsByScreenIds(
      filtered,
      IP_ONLY_OBSERVATION_DOCTOR_SCREEN_IDS,
      IP_ONLY_OBSERVATION_DOCTOR_GROUP_TITLES
    )
  }
  return filtered
}

export function filterNurseScreenGroups(
  groups: ScreenGroup[],
  scope: CostCenterCareScope,
  mode?: CareMode
): ScreenGroup[] {
  let filtered = groups
  if (scope === 'op_only') {
    filtered = filterGroupsByScreenIds(filtered, OP_ONLY_NURSE_SCREEN_IDS, OP_ONLY_NURSE_GROUP_TITLES)
  } else if (scope === 'ip_only') {
    filtered = filterGroupsByScreenIds(filtered, IP_ONLY_NURSE_SCREEN_IDS)
  }
  if (mode === 'OP') {
    filtered = filterGroupsByScreenIds(filtered, OP_MODE_NURSE_SCREEN_IDS, OP_MODE_NURSE_GROUP_TITLES)
  }
  if (!observationsAllowedForMode(mode)) {
    filtered = filterGroupsByScreenIds(
      filtered,
      IP_ONLY_OBSERVATION_NURSE_SCREEN_IDS,
      IP_ONLY_OBSERVATION_NURSE_GROUP_TITLES
    )
  }
  return filtered
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

/** If current ?screen= is not allowed for this scope/mode, return true so the page can redirect. */
export function isDoctorScreenBlocked(screen: string | null | undefined, scope: CostCenterCareScope, mode?: CareMode): boolean {
  if (!screen) return false
  if (scope === 'op_only' && OP_ONLY_DOCTOR_SCREEN_IDS.has(screen)) return true
  if (scope === 'ip_only' && IP_ONLY_DOCTOR_SCREEN_IDS.has(screen)) return true
  if (mode === 'OP' && OP_MODE_DOCTOR_SCREEN_IDS.has(screen)) return true
  if (!observationsAllowedForMode(mode) && IP_ONLY_OBSERVATION_DOCTOR_SCREEN_IDS.has(screen)) return true
  return false
}

export function isNurseScreenBlocked(screen: string | null | undefined, scope: CostCenterCareScope, mode?: CareMode): boolean {
  if (!screen) return false
  if (scope === 'op_only' && OP_ONLY_NURSE_SCREEN_IDS.has(screen)) return true
  if (scope === 'ip_only' && IP_ONLY_NURSE_SCREEN_IDS.has(screen)) return true
  if (mode === 'OP' && OP_MODE_NURSE_SCREEN_IDS.has(screen)) return true
  if (!observationsAllowedForMode(mode) && IP_ONLY_OBSERVATION_NURSE_SCREEN_IDS.has(screen)) return true
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
