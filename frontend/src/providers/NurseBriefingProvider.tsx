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
import { markShiftBriefingShown, wasShiftBriefingShown } from '../utils/shiftBriefingSession'

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
    costCenterCareScope,
    costCenterCareScopeReady,
    setSelectedPatient,
    setMode,
    setActiveAdmission,
    setActiveVisit,
    applyIpCareContext,
  } = useCareContext()

  const patientFromUrl = searchParams.get('patient')
  const onNurseRoute = location.pathname === '/nurse'
  const isNurse = isNurseRole(userRole)
  /** OP-only branches (e.g. British Medical Center) have no inpatient side. */
  const admissionsAllowed = costCenterCareScope !== 'op_only'

  const [step, setStep] = useState<NurseBriefingStep | null>(null)
  const [briefing, setBriefing] = useState<NurseShiftBriefing>(EMPTY_BRIEFING)
  const [loading, setLoading] = useState(false)
  /** Landing check runs silently — the modal only appears once a step has data. */
  const [landingHold, setLandingHold] = useState(false)
  const completedForLandingRef = useRef(wasShiftBriefingShown('nurse'))
  const lastRouteRef = useRef(location.pathname)
  const loadedSectionsRef = useRef({ admissions: false, lab_tests: false, low_stock: false })

  const careSelected = hasCareContextSelected(
    selectedPatient,
    activeVisit,
    activeAdmission,
    patientFromUrl,
  )

  const shouldOfferBriefing =
    isAuthenticated &&
    isNurse &&
    onNurseRoute &&
    !careSelected &&
    !authLoading &&
    // Wait for branch Patient Care Type so OP-only sites never flash the IP popup.
    costCenterCareScopeReady &&
    !wasShiftBriefingShown('nurse')

  const clearBriefingUi = useCallback(() => {
    setStep(null)
    setBriefing(EMPTY_BRIEFING)
    setLoading(false)
    setLandingHold(false)
    loadedSectionsRef.current = { admissions: false, lab_tests: false, low_stock: false }
    completedForLandingRef.current = wasShiftBriefingShown('nurse')
  }, [])

  useEffect(() => {
    if (lastRouteRef.current !== location.pathname) {
      lastRouteRef.current = location.pathname
      if (!onNurseRoute) {
        clearBriefingUi()
      }
    }
  }, [location.pathname, onNurseRoute, clearBriefingUi])

  useEffect(() => {
    if (careSelected) {
      clearBriefingUi()
    }
  }, [careSelected, clearBriefingUi])

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
          if (data.active_admissions.length === 0) {
            setStep('lab_tests')
          } else {
            setLandingHold(false)
          }
        } else if (section === 'lab_tests') {
          const data = await fetchNurseBriefingLabTests(userCostCenter)
          loadedSectionsRef.current.lab_tests = true
          setBriefing((prev) => ({
            ...prev,
            pending_sample_lab_tests: data.pending_sample_lab_tests,
          }))
          // Nothing to collect — move on to the inventory step.
          if (data.pending_sample_lab_tests.length === 0) {
            setStep('low_stock')
          } else {
            setLandingHold(false)
          }
        } else {
          const data = await fetchNurseBriefingLowStock(userCostCenter)
          loadedSectionsRef.current.low_stock = true
          setBriefing((prev) => ({
            ...prev,
            low_stock_items: data.low_stock_items,
          }))
          // Nothing to brief on at all — no popup.
          if (data.low_stock_items.length === 0) {
            markShiftBriefingShown('nurse')
            completedForLandingRef.current = true
            setStep(null)
          }
          setLandingHold(false)
        }
      } catch (err) {
        console.error(`Failed to load nurse briefing (${section}):`, err)
        loadedSectionsRef.current[section] = true
        // Stay silent rather than show an empty popup.
        setLandingHold(false)
        setStep(null)
      } finally {
        setLoading(false)
      }
    },
    [userCostCenter],
  )

  useEffect(() => {
    if (!shouldOfferBriefing || step) return
    markShiftBriefingShown('nurse')
    // Check first, then reveal: OP-only branches never see the admissions step.
    setLandingHold(true)
    setStep(admissionsAllowed ? 'admissions' : 'lab_tests')
  }, [shouldOfferBriefing, step, admissionsAllowed])

  // If branch metadata resolves to OP-only after admissions was queued, skip it.
  useEffect(() => {
    if (!costCenterCareScopeReady || admissionsAllowed) return
    if (step === 'admissions') setStep('lab_tests')
  }, [costCenterCareScopeReady, admissionsAllowed, step])

  useEffect(() => {
    if (!step || completedForLandingRef.current) return
    if (step === 'admissions' && !admissionsAllowed) return
    void loadSection(step)
  }, [step, loadSection, admissionsAllowed])

  const handleAdvance = useCallback(() => {
    setStep((current) => {
      if (current === 'admissions') return 'lab_tests'
      if (current === 'lab_tests') return 'low_stock'
      markShiftBriefingShown('nurse')
      completedForLandingRef.current = true
      return null
    })
  }, [])

  const finishBriefing = useCallback(() => {
    markShiftBriefingShown('nurse')
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

  /** OP-only branch: never render the active inpatient admission popup. */
  const visibleStep: NurseBriefingStep | null =
    step === 'admissions' && !admissionsAllowed ? null : step
  const showBriefing = Boolean(visibleStep) && !landingHold

  const value = useMemo(
    () => ({
      briefingActive: showBriefing,
      step: visibleStep,
    }),
    [showBriefing, visibleStep],
  )

  return (
    <NurseBriefingContext.Provider value={value}>
      {children}
      {showBriefing && visibleStep ? (
        <NurseBriefingModals
          step={visibleStep}
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
