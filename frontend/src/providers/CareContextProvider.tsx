import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type CareMode = 'OP' | 'IP'

interface CareContextValue {
  mode: CareMode
  setMode: (mode: CareMode) => void
  /** Currently focused patient visit (OP) or admission (IP), if any. */
  activeVisit?: string
  setActiveVisit: (visitName: string | undefined) => void
  activeAdmission?: string
  setActiveAdmission: (admissionName: string | undefined) => void
}

const CareContext = createContext<CareContextValue | undefined>(undefined)

export const CareContextProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<CareMode>(() => {
    if (typeof window === 'undefined') return 'OP'
    const stored = window.localStorage.getItem('care_mode')
    return stored === 'IP' ? 'IP' : 'OP'
  })
  const [activeVisit, setActiveVisitState] = useState<string | undefined>(undefined)
  const [activeAdmission, setActiveAdmissionState] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem('care_mode', mode)
    } catch {
      // ignore storage errors
    }
  }, [mode])

  const setActiveVisit = (visitName: string | undefined) => {
    setActiveVisitState(visitName || undefined)
  }

  const setActiveAdmission = (admissionName: string | undefined) => {
    setActiveAdmissionState(admissionName || undefined)
  }

  return (
    <CareContext.Provider value={{ mode, setMode, activeVisit, setActiveVisit, activeAdmission, setActiveAdmission }}>
      {children}
    </CareContext.Provider>
  )
}

export const useCareContext = (): CareContextValue => {
  const ctx = useContext(CareContext)
  if (!ctx) {
    throw new Error('useCareContext must be used within CareContextProvider')
  }
  return ctx
}

