import type { NavigateFunction } from 'react-router-dom'

export interface DischargeAdmissionRef {
  name: string
  patient?: string
  patient_name?: string
}

/** Open discharge on the doctor/nurse portal so the top navbar stays visible. */
export function navigateToDischarge(
  admission: DischargeAdmissionRef,
  navigate: NavigateFunction,
  returnTo?: string
): void {
  const currentPath = window.location.pathname
  const currentSearch = window.location.search
  const onDoctor = currentPath.startsWith('/doctor')
  const onNurse = currentPath.startsWith('/nurse')

  const cleanReturn = new URL(returnTo || `${currentPath}${currentSearch}`, window.location.origin)
  cleanReturn.searchParams.delete('discharge')

  const basePath = onNurse ? currentPath : onDoctor ? currentPath : '/doctor'
  const baseSearch = onNurse || onDoctor ? currentSearch : '?screen=df'

  const target = new URL(`${basePath}${baseSearch}`, window.location.origin)
  target.searchParams.set('discharge', admission.name)
  if (admission.patient) {
    target.searchParams.set('patient', admission.patient)
  }

  navigate(`${target.pathname}${target.search}`, {
    state: {
      returnTo: `${cleanReturn.pathname}${cleanReturn.search}`,
      patient: admission.patient,
      patient_name: admission.patient_name,
    },
  })
}
