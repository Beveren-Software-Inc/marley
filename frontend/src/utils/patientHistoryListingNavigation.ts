import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { canAccessRoute, getDefaultRouteForUser } from '../config/permissions'

export type PatientHistoryListingKey =
  | 'warnings'
  | 'diagnosis'
  | 'admissions'
  | 'patient-visits'
  | 'lab'
  | 'discharge'
  | 'service-requests'
  | 'appointments'
  | 'vital-signs'
  | 'observation'
  | 'medical-history'
  | 'package-details'

const LISTING_CANDIDATES: Record<
  PatientHistoryListingKey,
  Array<{ path: string; screen: string }>
> = {
  warnings: [
    { path: '/doctor', screen: 'warn' },
    { path: '/nurse', screen: 'n-first' },
  ],
  diagnosis: [{ path: '/doctor', screen: 'dx' }],
  admissions: [
    { path: '/reception', screen: 'r-reg' },
    { path: '/doctor', screen: 'admission' },
    { path: '/nurse', screen: 'n-reg' },
  ],
  'patient-visits': [
    { path: '/reception', screen: 'r-visit' },
    { path: '/doctor', screen: 'pvh' },
    { path: '/nurse', screen: 'n-op' },
  ],
  lab: [
    { path: '/lab', screen: 'l-results' },
    { path: '/doctor', screen: 'lab' },
    { path: '/nurse', screen: 'n-lab' },
  ],
  discharge: [
    { path: '/reception', screen: 'r-discharge' },
    { path: '/doctor', screen: 'df' },
    { path: '/nurse', screen: 'n-discharge' },
  ],
  'service-requests': [
    { path: '/reception', screen: 'r-service-requests' },
    { path: '/doctor', screen: 'lab-req' },
    { path: '/nurse', screen: 'n-ip-services' },
  ],
  appointments: [
    { path: '/reception', screen: 'r-appointments-freeze' },
    { path: '/doctor', screen: 'appointments' },
    { path: '/nurse', screen: 'n-session' },
  ],
  'vital-signs': [
    { path: '/doctor', screen: 'tpr' },
    { path: '/nurse', screen: 'n-tpr' },
  ],
  observation: [
    { path: '/reception', screen: 'r-observation' },
    { path: '/doctor', screen: 'obs' },
    { path: '/nurse', screen: 'n-ob' },
  ],
  'medical-history': [
    { path: '/doctor', screen: 'mh' },
    { path: '/reception', screen: 'r-medical-history' },
  ],
  'package-details': [
    { path: '/doctor', screen: 'pkg' },
    { path: '/nurse', screen: 'n-package' },
  ],
}

function normalizeRoles(roles: string[] | undefined): string[] {
  return roles?.length ? roles : []
}

export function resolvePatientHistoryListingTarget(
  roles: string[] | undefined,
  key: PatientHistoryListingKey,
): { path: string; screen: string } | null {
  const normalized = normalizeRoles(roles)
  if (!normalized.length) return null

  const candidates = LISTING_CANDIDATES[key]
  if (!candidates?.length) return null

  const home = getDefaultRouteForUser(normalized)
  const homeMatch = candidates.find((c) => c.path === home && canAccessRoute(c.path, normalized))
  if (homeMatch) return homeMatch

  return candidates.find((c) => canAccessRoute(c.path, normalized)) ?? null
}

export function usePatientHistoryListingOpener(patient: string | undefined) {
  const navigate = useNavigate()
  const { user } = useAuth()

  const roles = useMemo(() => {
    if (user?.roles?.length) return user.roles
    return [user?.role, user?.role_profile_name].filter(Boolean) as string[]
  }, [user])

  const hasListing = useCallback(
    (key: PatientHistoryListingKey) => resolvePatientHistoryListingTarget(roles, key) !== null,
    [roles],
  )

  const open = useCallback(
    (key: PatientHistoryListingKey) => {
      const target = resolvePatientHistoryListingTarget(roles, key)
      if (!target) return
      const params = new URLSearchParams()
      params.set('screen', target.screen)
      const patientId = (patient || '').trim()
      if (patientId) params.set('patient', patientId)
      navigate(`${target.path}?${params.toString()}`)
    },
    [navigate, roles, patient],
  )

  const listingProps = useCallback(
    (key: PatientHistoryListingKey) =>
      hasListing(key) ? { onOpenListing: () => open(key) } : {},
    [hasListing, open],
  )

  return { open, hasListing, listingProps }
}
