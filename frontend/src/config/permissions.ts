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

/** True if user should use the healthcare frontend (our UI); else they go to Frappe desk (/app). */
export function hasHealthcareRole(roles: string[]): boolean {
  if (!roles || roles.length === 0) return false
  if (isAdmin(roles)) return true
  const r = roles.map(x => x.trim().toLowerCase())
  return (
    r.some(x => x.includes('doctor') || x.includes('physician') || x.includes('practitioner')) ||
    r.some(x => x.includes('nurse') || x.includes('nursing')) ||
    r.some(x => x.includes('laboratory') || x.includes('lab')) ||
    r.some(x => x.includes('pharmacist') || x.includes('pharmacy') || x === 'pharmacy user') ||
    r.some(x => x.includes('reception')) ||
    r.some(x => x.includes('psychologist')) ||
    r.some(x => x.includes('anesthesiologist') || x.includes('anaesthesiologist')) ||
    r.some(x => x.includes('insurance'))
  )
}

export function canAccessRoute(pathname: string, roles: string[]): boolean {
  if (!roles || roles.length === 0) return false

  if (isAdmin(roles)) return true

  // Exact match or prefix for public paths
  if (PUBLIC_PATHS.some(p => p === pathname || (p.endsWith('/') && pathname.startsWith(p)))) {
    return true
  }

  // Role-specific pages
  const normalizedRoles = roles.map(r => r.trim().toLowerCase())
  if (pathname === '/doctor') return normalizedRoles.some(r => r.includes('doctor') || r.includes('physician') || r.includes('practitioner'))
  if (pathname === '/nurse') return normalizedRoles.some(r => r.includes('nurse') || r.includes('nursing'))
  if (pathname === '/lab') return normalizedRoles.some(r => r.includes('laboratory') || r.includes('lab'))
  if (pathname === '/pharmacy') return normalizedRoles.some(r => r.includes('pharmacist') || r.includes('pharmacy') || r === 'pharmacy user')
  if (pathname === '/reception') return normalizedRoles.some(r => r.includes('reception'))
  if (pathname === '/psychologist') return normalizedRoles.some(r => r.includes('psychologist'))
  if (pathname === '/anesthesiologist') return normalizedRoles.some(r => r.includes('anesthesiologist') || r.includes('anaesthesiologist'))
  if (pathname === '/insurance') return normalizedRoles.some(r => r.includes('insurance') || r.includes('reception'))

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

  if (isAdmin(roles)) return links

  return links.filter(link => canAccessRoute(link.to, roles))
}

/** Default route after login or when user has no access to current page */
export function getDefaultRouteForUser(roles: string[]): string {
  if (isAdmin(roles)) return '/doctor'
  const r = roles.map(x => x.trim().toLowerCase())
  if (r.some(x => x.includes('doctor') || x.includes('physician') || x.includes('practitioner'))) return '/doctor'
  if (r.some(x => x.includes('nurse') || x.includes('nursing'))) return '/nurse'
  if (r.some(x => x.includes('laboratory') || x.includes('lab'))) return '/lab'
  if (r.some(x => x.includes('pharmacist') || x.includes('pharmacy') || x === 'pharmacy user')) return '/pharmacy'
  if (r.some(x => x.includes('reception'))) return '/reception'
  if (r.some(x => x.includes('psychologist'))) return '/psychologist'
  if (r.some(x => x.includes('anesthesiologist') || x.includes('anaesthesiologist'))) return '/anesthesiologist'
  return '/patient'
}
