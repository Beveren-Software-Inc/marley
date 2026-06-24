import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { useCareContext } from './CareContextProvider'
import { isNurseRole } from '../config/permissions'
import {
  fetchNurseBriefingAdmissions,
  fetchNurseBriefingLabTests,
  fetchNurseBriefingLowStock,
  type NurseBriefingAdmission,
  type NurseBriefingLabTest,
  type NurseShiftBriefing,
} from '../services/nurseBriefing'
import {
  NurseBriefingModals,
  type NurseBriefingStep,
} from '../components/nurseBriefing/NurseBriefingModals'

type NurseBriefingContextValue = {
  briefingActive: boolean
  step: NurseBriefingStep | null
}

const NurseBriefingContext = createContext<NurseBriefingContextValue | null>(null)

const EMPTY_BRIEFING: NurseShiftBriefing = {
  cost_center: null,
  active_admissions: [],
  pending_sample_lab_tests: [],
  low_stock_items: [],
}

export function useNurseBriefing() {
  return useContext(NurseBriefingContext)
}

function hasCareContextSelected(
  selectedPatient: string | undefined,
  activeVisit: string | undefined,
  activeAdmission: string | undefined,
  patientFromUrl: string | null,
) {
  return Boolean(selectedPatient || activeVisit || activeAdmission || patientFromUrl)
}

export function NurseBriefingProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const {
    selectedPatient,
    activeVisit,
    activeAdmission,
    userCostCenter,
    userRole,
    setSelectedPatient,
    setMode,
    setActiveAdmission,
    setActiveVisit,
    applyIpCareContext,
  } = useCareContext()

  const patientFromUrl = searchParams.get('patient')
  const onNurseRoute = location.pathname === '/nurse'
  const isNurse = isNurseRole(userRole)

  const [step, setStep] = useState<NurseBriefingStep | null>(null)
  const [briefing, setBriefing] = useState<NurseShiftBriefing>(EMPTY_BRIEFING)
  const [loading, setLoading] = useState(false)
  const completedForLandingRef = useRef(false)
  const lastRouteRef = useRef(location.pathname)
  const loadedSectionsRef = useRef({ admissions: false, lab_tests: false, low_stock: false })

  const careSelected = hasCareContextSelected(
    selectedPatient,
    activeVisit,
    activeAdmission,
    patientFromUrl,
  )

  const shouldOfferBriefing =
    isAuthenticated && isNurse && onNurseRoute && !careSelected && !authLoading

  const resetBriefing = useCallback(() => {
    setStep(null)
    setBriefing(EMPTY_BRIEFING)
    setLoading(false)
    completedForLandingRef.current = false
    loadedSectionsRef.current = { admissions: false, lab_tests: false, low_stock: false }
  }, [])

  useEffect(() => {
    if (lastRouteRef.current !== location.pathname) {
      lastRouteRef.current = location.pathname
      if (!onNurseRoute) {
        resetBriefing()
      } else if (!careSelected) {
        completedForLandingRef.current = false
        loadedSectionsRef.current = { admissions: false, lab_tests: false, low_stock: false }
      }
    }
  }, [location.pathname, onNurseRoute, careSelected, resetBriefing])

  useEffect(() => {
    if (careSelected) {
      resetBriefing()
    }
  }, [careSelected, resetBriefing])

  const loadSection = useCallback(
    async (section: NurseBriefingStep) => {
      if (loadedSectionsRef.current[section]) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        if (section === 'admissions') {
          const data = await fetchNurseBriefingAdmissions(userCostCenter)
          loadedSectionsRef.current.admissions = true
          setBriefing((prev) => ({
            ...prev,
            cost_center: data.cost_center ?? prev.cost_center,
            active_admissions: data.active_admissions,
          }))
        } else if (section === 'lab_tests') {
          const data = await fetchNurseBriefingLabTests(userCostCenter)
          loadedSectionsRef.current.lab_tests = true
          setBriefing((prev) => ({
            ...prev,
            pending_sample_lab_tests: data.pending_sample_lab_tests,
          }))
        } else {
          const data = await fetchNurseBriefingLowStock(userCostCenter)
          loadedSectionsRef.current.low_stock = true
          setBriefing((prev) => ({
            ...prev,
            low_stock_items: data.low_stock_items,
          }))
        }
      } catch (err) {
        console.error(`Failed to load nurse briefing (${section}):`, err)
        loadedSectionsRef.current[section] = true
      } finally {
        setLoading(false)
      }
    },
    [userCostCenter],
  )

  useEffect(() => {
    if (!shouldOfferBriefing || step || completedForLandingRef.current) return
    setStep('admissions')
  }, [shouldOfferBriefing, step])

  useEffect(() => {
    if (!step || completedForLandingRef.current) return
    void loadSection(step)
  }, [step, loadSection])

  const handleAdvance = useCallback(() => {
    setStep((current) => {
      if (current === 'admissions') return 'lab_tests'
      if (current === 'lab_tests') return 'low_stock'
      completedForLandingRef.current = true
      return null
    })
  }, [])

  const finishBriefing = useCallback(() => {
    completedForLandingRef.current = true
    setStep(null)
  }, [])

  const handleAdmissionSelect = useCallback(
    (admission: NurseBriefingAdmission) => {
      applyIpCareContext({
        patient: admission.patient,
        admission: admission.name,
        admissionLabel: admission.name,
      })
      finishBriefing()
      const params = new URLSearchParams()
      params.set('screen', 'n-first')
      params.set('patient', admission.patient)
      navigate(`/nurse?${params.toString()}`)
    },
    [applyIpCareContext, finishBriefing, navigate],
  )

  const handleLabTestSelect = useCallback(
    (labTest: NurseBriefingLabTest) => {
      if (labTest.inpatient_record) {
        applyIpCareContext({
          patient: labTest.patient,
          admission: labTest.inpatient_record,
          admissionLabel: labTest.inpatient_record,
        })
      } else {
        setSelectedPatient(labTest.patient)
        setMode(null)
        setActiveVisit(undefined)
        setActiveAdmission(undefined)
      }

      finishBriefing()
      const params = new URLSearchParams()
      params.set('screen', 'n-lab')
      params.set('patient', labTest.patient)
      params.set('lab_test', labTest.name)
      navigate(`/nurse?${params.toString()}`)
    },
    [
      applyIpCareContext,
      finishBriefing,
      navigate,
      setActiveAdmission,
      setActiveVisit,
      setMode,
      setSelectedPatient,
    ],
  )

  const value = useMemo(
    () => ({
      briefingActive: Boolean(step),
      step,
    }),
    [step],
  )

  return (
    <NurseBriefingContext.Provider value={value}>
      {children}
      {step ? (
        <NurseBriefingModals
          step={step}
          briefing={briefing}
          loading={loading}
          onAdvance={handleAdvance}
          onAdmissionSelect={handleAdmissionSelect}
          onLabTestSelect={handleLabTestSelect}
        />
      ) : null}
    </NurseBriefingContext.Provider>
  )
}
