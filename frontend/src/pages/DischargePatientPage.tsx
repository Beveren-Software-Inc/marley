import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { DOCTOR_DISCHARGE_SCREEN_ID, NURSE_DISCHARGE_SCREEN_ID } from '../utils/inpatientDischargeRoute'

function resolveDischargePortal(roles: string[]): { path: string; screen: string } {
  const normalized = roles.map((r) => r.trim().toLowerCase())
  const isNurse = normalized.some((r) => r.includes('nurse') || r.includes('nursing'))
  const isDoctor = normalized.some(
    (r) => r.includes('doctor') || r.includes('physician') || r.includes('practitioner')
  )
  if (isNurse) {
    return { path: '/nurse', screen: NURSE_DISCHARGE_SCREEN_ID }
  }
  if (isDoctor) {
    return { path: '/doctor', screen: DOCTOR_DISCHARGE_SCREEN_ID }
  }
  return { path: '/nurse', screen: NURSE_DISCHARGE_SCREEN_ID }
}

/** Legacy route — redirects into doctor/nurse portal with ?discharge= so the top navbar stays visible. */
export const DischargePatientPage = () => {
  const { admissionName } = useParams<{ admissionName: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()

  useEffect(() => {
    const roles =
      user?.roles?.length
        ? user.roles
        : ([user?.role, user?.role_profile_name].filter(Boolean) as string[])

    const { path, screen } = resolveDischargePortal(roles)

    if (!admissionName) {
      navigate(`${path}?screen=${screen}`, { replace: true })
      return
    }

    const params = new URLSearchParams()
    params.set('screen', screen)
    params.set('discharge', admissionName)
    const patient = searchParams.get('patient')
    if (patient) params.set('patient', patient)
    navigate(`${path}?${params.toString()}`, { replace: true })
  }, [admissionName, navigate, searchParams, user])

  return (
    <div className="flex items-center justify-center min-h-[200px] text-slate-600 text-sm">
      Opening discharge…
    </div>
  )
}
