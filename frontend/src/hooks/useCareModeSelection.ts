import { useCareContext } from '../providers/CareContextProvider'

const VISIT_KEY = 'patientSearch_activeVisit'
const VISIT_LABEL_KEY = 'patientSearch_activeVisitLabel'
const ADMISSION_KEY = 'patientSearch_activeAdmission'
const ADMISSION_LABEL_KEY = 'patientSearch_activeAdmissionLabel'

function clearStored(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** OP / IP mode toggles shared by PatientSearch and the mobile sidebar picker. */
export function useCareModeSelection() {
  const {
    mode,
    setMode,
    setActiveVisit,
    setActiveAdmission,
    costCenterCareScope,
  } = useCareContext()

  const clearIpContext = () => {
    setActiveAdmission(undefined)
    clearStored(ADMISSION_KEY)
    clearStored(ADMISSION_LABEL_KEY)
  }

  const clearOpContext = () => {
    setActiveVisit(undefined)
    clearStored(VISIT_KEY)
    clearStored(VISIT_LABEL_KEY)
  }

  const selectOp = () => {
    if (mode === 'OP') {
      setMode(null)
      clearOpContext()
      return
    }
    setMode('OP')
    clearIpContext()
  }

  const selectIp = () => {
    if (mode === 'IP') {
      setMode(null)
      clearIpContext()
      return
    }
    setMode('IP')
    clearOpContext()
  }

  const clearMode = () => {
    setMode(null)
    clearOpContext()
    clearIpContext()
  }

  return {
    mode,
    costCenterCareScope,
    selectOp,
    selectIp,
    clearMode,
    clearOpContext,
    clearIpContext,
  }
}
