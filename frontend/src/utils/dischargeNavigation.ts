import type { NavigateFunction } from 'react-router-dom'
import {
  DOCTOR_DISCHARGE_SCREEN_ID,
  NURSE_DISCHARGE_SCREEN_ID,
} from './inpatientDischargeRoute'

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

  const returnOnNurse = cleanReturn.pathname.startsWith('/nurse')
  const returnOnDoctor = cleanReturn.pathname.startsWith('/doctor')
  const useNursePortal = onNurse || (!onDoctor && returnOnNurse)
  const useDoctorPortal = onDoctor || (!useNursePortal && returnOnDoctor)

  const basePath = useNursePortal
    ? '/nurse'
    : useDoctorPortal
      ? '/doctor'
      : '/doctor'
  const dischargeScreen = useNursePortal ? NURSE_DISCHARGE_SCREEN_ID : DOCTOR_DISCHARGE_SCREEN_ID

  const target = new URL(
    useNursePortal || useDoctorPortal ? `${basePath}${currentSearch}` : `${basePath}?screen=${DOCTOR_DISCHARGE_SCREEN_ID}`,
    window.location.origin
  )
  target.searchParams.set('screen', dischargeScreen)
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
