import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type CareMode = 'OP' | 'IP'

// Re-use the same localStorage keys that PatientSearch already writes so they
// stay in sync without double-writing.
const PATIENT_STORAGE_KEY = 'patientSearch_selectedPatient'
const VISIT_STORAGE_KEY = 'patientSearch_activeVisit'
const ADMISSION_STORAGE_KEY = 'patientSearch_activeAdmission'

interface CareContextValue {
  mode: CareMode
  setMode: (mode: CareMode) => void
  /** Currently focused patient visit (OP), if any. */
  activeVisit?: string
  setActiveVisit: (visitName: string | undefined) => void
  /** Currently focused inpatient admission (IP), if any. */
  activeAdmission?: string
  setActiveAdmission: (admissionName: string | undefined) => void
  /**
   * Globally selected patient — persists across page/screen navigation.
   * Initialised synchronously from localStorage so every page gets the
   * correct patient on the very first render (no flash, no waiting).
   */
  selectedPatient: string | undefined
  setSelectedPatient: (patient: string | undefined) => void
  /** Current user's cost center */
  userCostCenter?: string
  /** Current user's roles */
  userRole?: string[]
  /** Current user object */
  user?: any
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

  // Initialise synchronously from localStorage so all pages get correct values immediately.
  const [activeVisit, setActiveVisitState] = useState<string | undefined>(
    () => readStorage(VISIT_STORAGE_KEY)
  )
  const [activeAdmission, setActiveAdmissionState] = useState<string | undefined>(
    () => readStorage(ADMISSION_STORAGE_KEY)
  )
  const [selectedPatient, setSelectedPatientState] = useState<string | undefined>(
    () => readStorage(PATIENT_STORAGE_KEY)
  )

  // User context state
  const [userCostCenter, setUserCostCenter] = useState<string | undefined>(undefined)
  const [userRole, setUserRole] = useState<string[] | undefined>(undefined)
  const [user, setUser] = useState<any>(undefined)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem('care_mode', mode) } catch { /* ignore */ }
  }, [mode])

  // Load user cost center and roles when component mounts
  useEffect(() => {
    console.log('CareContextProvider: Loading user context')
    const loadUserContext = async () => {
      try {
        // Load cost center
        console.log('CareContextProvider: Fetching cost center')
        const response = await fetch('/api/method/healthcare.api.nursing_inventory.get_default_warehouse_and_cost_center')
        console.log('CareContextProvider: Cost center response status:', response.status)
        if (response.ok) {
          const data = await response.json()
          console.log('CareContextProvider: Cost center data:', data)
          setUserCostCenter(data.message.cost_center || undefined)
        }

        // Load user info including roles
        console.log('CareContextProvider: Fetching user info')
        const userResponse = await fetch('/api/method/frappe.auth.get_logged_user')
        console.log('CareContextProvider: User response status:', userResponse.status)
        if (userResponse.ok) {
          const userData = await userResponse.json()
          console.log('CareContextProvider: User data:', userData)
          if (userData.message) {
            setUser({ name: userData.message })
            // Get user roles
            const rolesResponse = await fetch('/api/method/frappe.core.doctype.user.user.get_roles', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uid: userData.message })
            })
            console.log('CareContextProvider: Roles response status:', rolesResponse.status)
            if (rolesResponse.ok) {
              const rolesData = await rolesResponse.json()
              console.log('CareContextProvider: Roles data:', rolesData)
              setUserRole(rolesData.message || [])
            }
          }
        }
      } catch (error) {
        console.warn('Failed to load user context:', error)
      }
    }

    loadUserContext()
  }, [])

  const setActiveVisit = (v: string | undefined) => {
    const val = v || undefined
    setActiveVisitState(val)
    writeStorage(VISIT_STORAGE_KEY, val)
  }

  const setActiveAdmission = (a: string | undefined) => {
    const val = a || undefined
    setActiveAdmissionState(val)
    writeStorage(ADMISSION_STORAGE_KEY, val)
  }

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
      userCostCenter,
      userRole,
      user,
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
