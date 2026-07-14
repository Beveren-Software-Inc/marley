import { SHOW_EMPLOYEE_PORTAL } from './features'

/**
 * UI permissions: which routes and sidebar links a user can see based on roles.
 *
 * - Patient, Employee (when enabled), Patient History: everyone
 * - Doctor, Nurse, Lab, Pharmacy, Reception: only that role (and admins)
 * - Administrator, System Manager, Healthcare Administrator, Website Manager: can view everything
 */

const ADMIN_ROLES = [
  'Administrator',
  'System Manager',
  'Healthcare Administrator',
  'Website Manager'
]

/** Roles allowed to enter or adjust lab test results (must match healthcare.api.lab_test). */
export const LAB_RESULT_EDIT_ROLES = [
  'Laboratory User',
  'LabTest Approver',
  'System Manager',
  'Healthcare Administrator',
  'Administrator',
] as const

export function canEditLabTestResults(roles: string[] | undefined): boolean {
  if (!roles?.length) return false
  const normalized = roles.map((r) => r.trim().toLowerCase())
  return LAB_RESULT_EDIT_ROLES.some((allowed) =>
    normalized.some((r) => r === allowed.toLowerCase())
  )
}

/** Whether a grouped lab request was explicitly finished (Finish Group). */
export const GROUP_FINISHED_SERVICE_REQUEST_STATUS = 'completed-Request Status'

export function isGroupedLabRequestFinished(
  labTest: { is_group_lab_test?: number; service_request_status?: string }
): boolean {
  return Boolean(labTest.is_group_lab_test) && labTest.service_request_status === GROUP_FINISHED_SERVICE_REQUEST_STATUS
}

/** Lab statuses that are final — after these, only admins may amend a result. */
const FINAL_LAB_STATUSES = ['Approved', 'Completed'] as const

type LabTestRowPerm = {
  docstatus?: number
  status?: string
  is_group_lab_test?: number
  service_request_status?: string
}

/** Whether this lab test row allows inline / batch result editing.
 * F013/F014: lab result editors may correct results up to (but not after) final
 * approval — no longer CEO-only for finished groups, and not keyed on the exact
 * 'Reviewed' string. After a final status (Approved/Completed) or a finished group,
 * only admins/CEO may amend. Use labResultLockReason() to explain a lock in the UI. */
export function canEditLabTestResultForRow(
  labTest: LabTestRowPerm,
  roles: string[] | undefined
): boolean {
  const status = (labTest.status || '').trim()
  if (status === 'Rejected' || status === 'Cancelled') return false

  const isFinal = FINAL_LAB_STATUSES.includes(status as (typeof FINAL_LAB_STATUSES)[number])
    || isGroupedLabRequestFinished(labTest)
  if (isFinal) {
    // After final approval, only admins (incl. CEO) may amend.
    return isAdmin(roles ?? []) || isCEO(roles)
  }

  if (!canEditLabTestResults(roles)) return false
  if (labTest.docstatus === 0) return true
  // Submitted but not yet final: lab result editors may still correct.
  return labTest.docstatus === 1
}

/** Human-readable reason a lab result row is locked for the given user, or null if editable.
 * Lets the UI explain a disabled result field instead of silently hiding it (F014). */
export function labResultLockReason(
  labTest: LabTestRowPerm,
  roles: string[] | undefined
): string | null {
  if (canEditLabTestResultForRow(labTest, roles)) return null
  const status = (labTest.status || '').trim()
  if (status === 'Rejected' || status === 'Cancelled') {
    return `This result is ${status.toLowerCase()} and cannot be edited.`
  }
  const isFinal = FINAL_LAB_STATUSES.includes(status as (typeof FINAL_LAB_STATUSES)[number])
    || isGroupedLabRequestFinished(labTest)
  if (isFinal) {
    return 'This result is finalised — only an administrator can amend it.'
  }
  if (!canEditLabTestResults(roles)) {
    return 'You do not have permission to edit lab results.'
  }
  return 'This result cannot be edited at its current status.'
}

/** Paths that every authenticated user can access */
const PUBLIC_PATHS = [
  '/patient',
  ...(SHOW_EMPLOYEE_PORTAL ? ['/employee'] : []),
  '/patient-history',
  '/settings',
  '/patient-visit/',
]

export function isAdmin(roles: string[]): boolean {
  const normalized = roles.map(r => r.trim())
  return ADMIN_ROLES.some(admin =>
    normalized.some(r => r.toLowerCase() === admin.toLowerCase())
  )
}

/** Matches healthcare.api.user_activity_audit.AUDIT_VIEW_ROLES */
export function isCEO(roles: string[] | undefined): boolean {
  if (!roles?.length) return false
  return roles.some((r) => r.trim().toLowerCase() === 'ceo')
}

/** Matches healthcare.api.patient.DATA_OFFICER_ROLE — full patient directory / list UI. */
export const DATA_OFFICER_ROLE = 'Data Officer'

export function isDataOfficer(roles: string[] | undefined): boolean {
  if (!roles?.length) return false
  return roles.some((r) => r.trim().toLowerCase() === DATA_OFFICER_ROLE.toLowerCase())
}

/** True if user should use the healthcare frontend (our UI); else they go to Frappe desk (/app). */
export function hasHealthcareRole(roles: string[]): boolean {
  if (!roles || roles.length === 0) return false
  if (isAdmin(roles)) return true
  if (isCEO(roles)) return true
  const r = roles.map(x => x.trim().toLowerCase())
  return (
    r.some(x => x.includes('doctor') || x.includes('physician') || x.includes('practitioner')) ||
    r.some(x => x.includes('nurse') || x.includes('nursing')) ||
    r.some(x => x.includes('laboratory') || x.includes('lab')) ||
    r.some(x => x.includes('pharmacist') || x.includes('pharmacy') || x === 'pharmacy user') ||
    r.some(x => x.includes('reception')) ||
    r.some(x => x.includes('psychologist')) ||
    r.some(x => x === 'therapist' || x.includes('therapist')) ||
    r.some(x => x.includes('nutritionist')) ||
    r.some(x => x.includes('anesthesiologist') || x.includes('anaesthesiologist')) ||
    r.some(x => x.includes('insurance'))
  )
}

export function canAccessRoute(pathname: string, roles: string[]): boolean {
  if (!roles || roles.length === 0) return false

  // CEO-only routes (no admin bypass)
  if (pathname === '/staff-activity-audit') return isCEO(roles)
  if (pathname === '/ip-quotation') return isCEO(roles)

  if (isAdmin(roles)) return true

  // Exact match or prefix for public paths
  if (PUBLIC_PATHS.some(p => p === pathname || (p.endsWith('/') && pathname.startsWith(p)))) {
    return true
  }

  if (pathname.startsWith('/discharge/')) {
    return hasHealthcareRole(roles)
  }

  // Role-specific pages
  const normalizedRoles = roles.map(r => r.trim().toLowerCase())
  if (pathname === '/doctor') return normalizedRoles.some(r => r.includes('doctor') || r.includes('physician') || r.includes('practitioner'))
  if (pathname === '/nurse') return normalizedRoles.some(r => r.includes('nurse') || r.includes('nursing'))
  if (pathname === '/lab') return normalizedRoles.some(r => r.includes('laboratory') || r.includes('lab'))
  if (pathname === '/pharmacy') return normalizedRoles.some(r => r.includes('pharmacist') || r.includes('pharmacy') || r === 'pharmacy user')
  if (pathname === '/reception') return normalizedRoles.some(r => r.includes('reception'))
  if (pathname === '/psychologist') return normalizedRoles.some(r => r.includes('psychologist'))
  if (pathname === '/therapy') return normalizedRoles.some(r => r === 'therapist' || r.includes('therapist'))
  if (pathname === '/nutritionist') return normalizedRoles.some(r => r.includes('nutritionist'))
  if (pathname === '/anesthesiologist') return normalizedRoles.some(r => r.includes('anesthesiologist') || r.includes('anaesthesiologist'))
  if (pathname === '/insurance') return normalizedRoles.some(r => r.includes('insurance'))

  return false
}

export interface ScreenItem {
  id: string
  title: string
}

export interface ScreenGroup {
  groupTitle: string
  screens: ScreenItem[]
}

export interface MainLinkItem {
  to: string
  label: string
  screens?: ScreenItem[]
  screenGroups?: ScreenGroup[]
  prefix?: string
}

export function getVisibleMainLinks(links: MainLinkItem[], roles: string[]): MainLinkItem[] {
  if (!roles || roles.length === 0) return []

  const filtered = isAdmin(roles)
    ? links
    : links.filter(link => canAccessRoute(link.to, roles))

  // Staff Activity Audit is CEO-only (even system admins without CEO role)
  if (!isCEO(roles)) {
    return filtered.filter((link) => link.to !== '/staff-activity-audit' && link.to !== '/ip-quotation')
  }

  return filtered
}

/** Discharge patient modal section tabs. */
export const DISCHARGE_TAB_IDS = [
  'details',
  'checklist',
  'nursing',
  'transfer',
  'charges',
  'medicine-sales',
  'reconcile',
  'daily-visit',
  'documents',
  'relatives',
] as const

export type DischargeTabId = (typeof DISCHARGE_TAB_IDS)[number]

const DISCHARGE_TABS_BY_ROLE: Record<'Reception' | 'Doctor' | 'Nurse', readonly DischargeTabId[]> = {
  Reception: ['details', 'checklist', 'charges', 'medicine-sales', 'reconcile', 'daily-visit', 'documents', 'relatives'],
  Doctor: ['details', 'checklist', 'transfer', 'documents'],
  Nurse: ['details', 'checklist', 'nursing', 'reconcile'],
}

function hasExactRole(roles: string[], names: string[]): boolean {
  const normalized = new Set(roles.map((r) => r.trim().toLowerCase()))
  return names.some((n) => normalized.has(n.toLowerCase()))
}

function roleMatches(roles: string[], matcher: (normalized: string) => boolean): boolean {
  return roles.some((r) => matcher(r.trim().toLowerCase()))
}

export function isTherapistRole(roles: string[] | undefined): boolean {
  if (!roles?.length) return false
  return hasExactRole(roles, ['Therapist']) || roleMatches(roles, (r) => r.includes('therapist'))
}

export function isPsychologistRole(roles: string[] | undefined): boolean {
  if (!roles?.length) return false
  return hasExactRole(roles, ['Psychologist']) || roleMatches(roles, (r) => r.includes('psychologist'))
}

export function isReceptionRole(roles: string[] | undefined): boolean {
  if (!roles?.length) return false
  return hasExactRole(roles, ['Reception']) || roleMatches(roles, (r) => r.includes('reception'))
}

export function isDoctorRole(roles: string[] | undefined): boolean {
  if (!roles?.length) return false
  return (
    hasExactRole(roles, ['Doctor']) ||
    roleMatches(roles, (r) => r.includes('doctor') || r.includes('physician') || r.includes('practitioner'))
  )
}

export function isNurseRole(roles: string[] | undefined): boolean {
  if (!roles?.length) return false
  return hasExactRole(roles, ['Nurse']) || roleMatches(roles, (r) => r.includes('nurse') || r.includes('nursing'))
}

/** Clinical staff who may see long-acting medicine details (drug/dose/frequency/notes).
 * Reception and other non-clinical roles get these details masked (they see only due dates). */
export function canSeeLongActingMedDetails(roles: string[] | undefined): boolean {
  if (!roles?.length) return false
  if (isAdmin(roles)) return true
  return roleMatches(
    roles,
    (r) =>
      r.includes('doctor') ||
      r.includes('physician') ||
      r.includes('practitioner') ||
      r.includes('nurse') ||
      r.includes('nursing') ||
      r.includes('psychologist') ||
      r.includes('psychiatrist') ||
      r.includes('anesthesiologist') ||
      r.includes('therapist') ||
      r.includes('nutritionist'),
  )
}

/** Nurse, physician/doctor, or admin — may view clinical summary and clinical history cards. */
export function canViewClinicalPatientHistory(roles: string[] | undefined): boolean {
  if (!roles?.length) return false
  if (isAdmin(roles)) return true
  return isDoctorRole(roles) || isNurseRole(roles)
}

/** Lines without a department on the checklist master (e.g. billing). */
export function canEditUnassignedDischargeChecklistLine(roles: string[] | undefined): boolean {
  if (!roles?.length) return false
  if (isAdmin(roles)) return true
  return isReceptionRole(roles)
}

/** @deprecated Use department-scoped row checks; kept for legacy UI flags. */
export function canEditMainDischargeChecklist(roles: string[] | undefined): boolean {
  return canEditUnassignedDischargeChecklistLine(roles)
}

/** Which discharge modal tabs the user may open (union when multiple roles). */
export function getVisibleDischargeTabIds(roles: string[] | undefined): DischargeTabId[] {
  if (!roles?.length) return ['details']
  if (isAdmin(roles)) return [...DISCHARGE_TAB_IDS]

  const allowed = new Set<DischargeTabId>()
  if (isReceptionRole(roles)) {
    DISCHARGE_TABS_BY_ROLE.Reception.forEach((t) => allowed.add(t))
  }
  if (isDoctorRole(roles)) {
    DISCHARGE_TABS_BY_ROLE.Doctor.forEach((t) => allowed.add(t))
  }
  if (isNurseRole(roles)) {
    DISCHARGE_TABS_BY_ROLE.Nurse.forEach((t) => allowed.add(t))
  }

  if (allowed.size === 0) {
    return ['details', 'checklist']
  }
  // Checklist is viewable by every discharge role; extra charges + observation are reception-only.
  allowed.add('checklist')
  return DISCHARGE_TAB_IDS.filter((t) => allowed.has(t))
}

export function canViewDischargeTab(roles: string[] | undefined, tabId: DischargeTabId): boolean {
  return getVisibleDischargeTabIds(roles).includes(tabId)
}

/** Default route after login or when user has no access to current page */
export function getDefaultRouteForUser(roles: string[]): string {
  if (isAdmin(roles)) return '/doctor'
  if (isCEO(roles)) return '/staff-activity-audit'
  const r = roles.map(x => x.trim().toLowerCase())
  if (r.some(x => x.includes('doctor') || x.includes('physician') || x.includes('practitioner'))) return '/doctor'
  if (r.some(x => x.includes('nurse') || x.includes('nursing'))) return '/nurse'
  if (r.some(x => x.includes('laboratory') || x.includes('lab'))) return '/lab'
  if (r.some(x => x.includes('pharmacist') || x.includes('pharmacy') || x === 'pharmacy user')) return '/pharmacy'
  if (r.some(x => x.includes('reception'))) return '/reception'
  if (r.some(x => x === 'therapist' || x.includes('therapist'))) return '/therapy'
  if (r.some(x => x.includes('nutritionist'))) return '/nutritionist'
  if (r.some(x => x.includes('psychologist'))) return '/psychologist'
  if (r.some(x => x.includes('anesthesiologist') || x.includes('anaesthesiologist'))) return '/anesthesiologist'
  if (r.some(x => x.includes('insurance'))) return '/insurance'
  return '/patient'
}
