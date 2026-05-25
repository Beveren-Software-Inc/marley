import type { CostCenterCareScope } from '../config/costCenterCareScope'
import type { CareMode } from '../providers/CareContextProvider'

export const NURSE_DISCHARGE_SCREEN_ID = 'n-discharge'
export const DOCTOR_DISCHARGE_SCREEN_ID = 'df'

type SearchParamsLike = { get: (key: string) => string | null }

/** True when URL is opening inpatient discharge (list or a specific admission). */
export function isInpatientDischargeRoute(
  searchParams: SearchParamsLike,
  dischargeScreenIds: readonly string[]
): boolean {
  const discharge = searchParams.get('discharge')
  const screen = searchParams.get('screen')
  return Boolean(discharge || (screen && dischargeScreenIds.includes(screen)))
}

export function inpatientDischargeAllowed(scope: CostCenterCareScope): boolean {
  return scope !== 'op_only'
}

/** Treat discharge flows as IP so sidebar screens are not stripped in OP mode. */
export function modeForInpatientDischargeScreens(
  mode: CareMode,
  scope: CostCenterCareScope,
  inDischargeRoute: boolean
): CareMode {
  if (!inDischargeRoute || !inpatientDischargeAllowed(scope)) return mode
  return 'IP'
}
