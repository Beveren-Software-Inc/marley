import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { careScopeFromCostCenterField, type CostCenterCareScope } from '../config/costCenterCareScope'
import { fetchDefaultCompanyCurrency } from '../services/common'

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
  /**
   * Cost Center.custom_patient_care_type — "IP Only" | "OP Only" | "Both IP & OP" or empty when unset / N/A.
   * Drives OP vs IP UI (sidebar, header toggles). Exempt users with no mapped cost center get "" (both).
   */
  costCenterPatientCareType?: string
  /** Normalized scope derived from {@link costCenterPatientCareType} */
  costCenterCareScope: CostCenterCareScope
  /** Current user's roles */
  userRole?: string[]
  /** Current user object */
  user?: any
  /** Default company currency (ISO), from ERPNext Company.default_currency */
  companyCurrency?: string
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
  const [costCenterPatientCareType, setCostCenterPatientCareType] = useState<string | undefined>(undefined)

  const costCenterCareScope = careScopeFromCostCenterField(costCenterPatientCareType)
  const [userRole, setUserRole] = useState<string[] | undefined>(undefined)
  const [user, setUser] = useState<any>(undefined)
  const [companyCurrency, setCompanyCurrency] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem('care_mode', mode) } catch { /* ignore */ }
  }, [mode])

  // Load user cost center and roles when component mounts
  useEffect(() => {
    const loadUserContext = async () => {
      try {
        // Load cost center
        const response = await fetch('/api/method/healthcare.api.nursing_inventory.get_default_warehouse_and_cost_center')
        if (response.ok) {
          const data = await response.json()
          const msg = data.message || {}
          setUserCostCenter(msg.cost_center || undefined)
          setCostCenterPatientCareType(
            typeof msg.cost_center_patient_care_type === 'string'
              ? msg.cost_center_patient_care_type
              : ''
          )
        }

        // Load user info including roles (GET avoids CSRF; POST to frappe user.get_roles fails without X-Frappe-CSRF-Token)
        const userResponse = await fetch('/api/method/frappe.auth.get_logged_user', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        })
        if (userResponse.ok) {
          const userData = await userResponse.json()
          if (userData.message) {
            setUser({ name: userData.message })
            const rolesResponse = await fetch('/api/method/healthcare.api.common.get_current_user_roles', {
              method: 'GET',
              credentials: 'include',
              headers: { Accept: 'application/json' },
            })
            if (rolesResponse.ok) {
              const rolesData = await rolesResponse.json()
              setUserRole(Array.isArray(rolesData.message) ? rolesData.message : [])
            }
          }
        }
      } catch (error) {
        console.warn('Failed to load user context:', error)
      }
    }

    loadUserContext()
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchDefaultCompanyCurrency()
      .then((msg) => {
        if (!cancelled && msg.currency) setCompanyCurrency(msg.currency.toUpperCase())
      })
      .catch(() => {
        if (!cancelled) setCompanyCurrency(undefined)
      })
    return () => {
      cancelled = true
    }
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

  useEffect(() => {
    if (costCenterCareScope === 'op_only') {
      setMode('OP')
      setActiveAdmission(undefined)
      try {
        localStorage.removeItem('patientSearch_activeAdmissionLabel')
      } catch {
        /* ignore */
      }
    } else if (costCenterCareScope === 'ip_only') {
      setMode('IP')
      setActiveVisit(undefined)
      try {
        localStorage.removeItem('patientSearch_activeVisitLabel')
      } catch {
        /* ignore */
      }
    }
  }, [costCenterCareScope])

  return (
    <CareContext.Provider value={{
      mode, setMode,
      activeVisit, setActiveVisit,
      activeAdmission, setActiveAdmission,
      selectedPatient, setSelectedPatient,
      userCostCenter,
      costCenterPatientCareType,
      costCenterCareScope,
      userRole,
      user,
      companyCurrency,
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
