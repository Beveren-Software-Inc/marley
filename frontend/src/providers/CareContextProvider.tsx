import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type CareMode = 'OP' | 'IP'

// Re-use the same localStorage key that PatientSearch already writes so they
// stay in sync without double-writing.
const PATIENT_STORAGE_KEY = 'patientSearch_selectedPatient'

interface CareContextValue {
  mode: CareMode
  setMode: (mode: CareMode) => void
  /** Currently focused patient visit (OP) or admission (IP), if any. */
  activeVisit?: string
  setActiveVisit: (visitName: string | undefined) => void
  activeAdmission?: string
  setActiveAdmission: (admissionName: string | undefined) => void
  /**
   * Globally selected patient — persists across page/screen navigation.
   * Initialised synchronously from localStorage so every page gets the
   * correct patient on the very first render (no flash, no waiting).
   */
  selectedPatient: string | undefined
  setSelectedPatient: (patient: string | undefined) => void
}

const CareContext = createContext<CareContextValue | undefined>(undefined)

const readStorage = (key: string): string | undefined => {
  if (typeof window === 'undefined') return undefined
  try { return localStorage.getItem(key) || undefined } catch { return undefined }
}

const writeStorage = (key: string, value: string | undefined) => {
  if (typeof window === 'undefined') return
  try {
    if (value) { localStorage.setItem(key, value) } else { localStorage.removeItem(key) }
  } catch { /* ignore */ }
}

export const CareContextProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<CareMode>(() => {
    if (typeof window === 'undefined') return 'OP'
    const stored = window.localStorage.getItem('care_mode')
    return stored === 'IP' ? 'IP' : 'OP'
  })
  const [activeVisit, setActiveVisitState] = useState<string | undefined>(undefined)
  const [activeAdmission, setActiveAdmissionState] = useState<string | undefined>(undefined)

  // Initialise synchronously from localStorage so pages get the patient immediately.
  const [selectedPatient, setSelectedPatientState] = useState<string | undefined>(
    () => readStorage(PATIENT_STORAGE_KEY)
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem('care_mode', mode) } catch { /* ignore */ }
  }, [mode])

  const setActiveVisit = (v: string | undefined) => setActiveVisitState(v || undefined)
  const setActiveAdmission = (a: string | undefined) => setActiveAdmissionState(a || undefined)

  const setSelectedPatient = (patient: string | undefined) => {
    setSelectedPatientState(patient)
    writeStorage(PATIENT_STORAGE_KEY, patient)
  }

  return (
    <CareContext.Provider value={{
      mode, setMode,
      activeVisit, setActiveVisit,
      activeAdmission, setActiveAdmission,
      selectedPatient, setSelectedPatient,
    }}>
      {children}
    </CareContext.Provider>
  )
}

export const useCareContext = (): CareContextValue => {
  const ctx = useContext(CareContext)
  if (!ctx) throw new Error('useCareContext must be used within CareContextProvider')
  return ctx
}
