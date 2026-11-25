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
import { isDoctorRole } from '../config/permissions'
import {
  fetchDoctorBriefingAdmissions,
  fetchDoctorBriefingLabTests,
  type DoctorBriefingLabTest,
  type DoctorShiftBriefing,
} from '../services/doctorBriefing'
import type { NurseBriefingAdmission } from '../services/nurseBriefing'
import {
  DoctorBriefingModals,
  type DoctorBriefingStep,
} from '../components/doctorBriefing/DoctorBriefingModals'
import { markShiftBriefingShown, wasShiftBriefingShown } from '../utils/shiftBriefingSession'

type DoctorBriefingContextValue = {
  briefingActive: boolean
  step: DoctorBriefingStep | null
  openAdmissionsBriefing: () => void
  openLabReviewBriefing: () => void
}

const DoctorBriefingContext = createContext<DoctorBriefingContextValue | null>(null)

const EMPTY_BRIEFING: DoctorShiftBriefing = {
  cost_center: null,
  active_admissions: [],
  pending_review_lab_tests: [],
}

export function useDoctorBriefing() {
  return useContext(DoctorBriefingContext)
}

function hasCareContextSelected(
  selectedPatient: string | undefined,
  activeVisit: string | undefined,
  activeAdmission: string | undefined,
  patientFromUrl: string | null,
) {
  return Boolean(selectedPatient || activeVisit || activeAdmission || patientFromUrl)
}

export function DoctorBriefingProvider({ children }: { children: ReactNode }) {
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
  const onDoctorRoute = location.pathname === '/doctor'
  const isDoctor = isDoctorRole(userRole)
  /** OP-only branches (e.g. British Medical Center) have no inpatient side. */
  const admissionsAllowed = costCenterCareScope !== 'op_only'

  const [step, setStep] = useState<DoctorBriefingStep | null>(null)
  const [briefing, setBriefing] = useState<DoctorShiftBriefing>(EMPTY_BRIEFING)
  const [loading, setLoading] = useState(false)
  const [admissionsOnly, setAdmissionsOnly] = useState(false)
  const [labsOnly, setLabsOnly] = useState(false)
  /** Landing check runs silently — the modal only appears once a step has data. */
  const [landingHold, setLandingHold] = useState(false)
  const completedForLandingRef = useRef(wasShiftBriefingShown('doctor'))
  const lastRouteRef = useRef(location.pathname)
  const loadedSectionsRef = useRef({ admissions: false, lab_tests: false })

  const careSelected = hasCareContextSelected(
    selectedPatient,
    activeVisit,
    activeAdmission,
    patientFromUrl,
  )

  const shouldOfferBriefing =
    isAuthenticated &&
    isDoctor &&
    onDoctorRoute &&
    !careSelected &&
    !authLoading &&
    // Wait for branch Patient Care Type so OP-only sites never flash the IP popup.
    costCenterCareScopeReady &&
    !wasShiftBriefingShown('doctor')

  const clearBriefingUi = useCallback(() => {
    setStep(null)
    setAdmissionsOnly(false)
    setLabsOnly(false)
    setBriefing(EMPTY_BRIEFING)
    setLoading(false)
    setLandingHold(false)
    loadedSectionsRef.current = { admissions: false, lab_tests: false }
    completedForLandingRef.current = wasShiftBriefingShown('doctor')
  }, [])

  useEffect(() => {
    if (lastRouteRef.current !== location.pathname) {
      lastRouteRef.current = location.pathname
      if (!onDoctorRoute) {
        clearBriefingUi()
      }
    }
  }, [location.pathname, onDoctorRoute, clearBriefingUi])

  useEffect(() => {
    if (careSelected && !admissionsOnly && !labsOnly) {
      clearBriefingUi()
    }
  }, [careSelected, admissionsOnly, labsOnly, clearBriefingUi])

  const loadSection = useCallback(
    async (section: DoctorBriefingStep) => {
      if (loadedSectionsRef.current[section]) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        if (section === 'admissions') {
          const data = await fetchDoctorBriefingAdmissions(userCostCenter)
          loadedSectionsRef.current.admissions = true
          setBriefing((prev) => ({
            ...prev,
            cost_center: data.cost_center ?? prev.cost_center,
            active_admissions: data.active_admissions,
          }))
          // Nothing admitted in this branch — skip straight to lab review
          // (but keep the explicit "Current IP Warnings" popup open).
          if (!admissionsOnly && data.active_admissions.length === 0) {
            setStep('lab_tests')
          } else {
            setLandingHold(false)
          }
        } else {
          const data = await fetchDoctorBriefingLabTests(userCostCenter)
          loadedSectionsRef.current.lab_tests = true
          setBriefing((prev) => ({
            ...prev,
            pending_review_lab_tests: data.pending_review_lab_tests,
          }))
          // Nothing pending — no popup to show (explicit lab-review link stays open).
          if (!labsOnly && data.pending_review_lab_tests.length === 0) {
            markShiftBriefingShown('doctor')
            completedForLandingRef.current = true
            setStep(null)
          }
          setLandingHold(false)
        }
      } catch (err) {
        console.error(`Failed to load doctor briefing (${section}):`, err)
        loadedSectionsRef.current[section] = true
        setLandingHold(false)
        // Landing check failed — stay silent rather than show an empty popup.
        if (!admissionsOnly && !labsOnly) setStep(null)
      } finally {
        setLoading(false)
      }
    },
    [userCostCenter, admissionsOnly, labsOnly],
  )

  const openAdmissionsBriefing = useCallback(() => {
    // Active inpatient admissions do not exist on an OP-only branch.
    if (!admissionsAllowed) return
    setLandingHold(true)
    setLabsOnly(false)
    setAdmissionsOnly(true)
    loadedSectionsRef.current.admissions = false
    setStep('admissions')
    setLoading(true)
    void (async () => {
      try {
        const data = await fetchDoctorBriefingAdmissions(userCostCenter)
        loadedSectionsRef.current.admissions = true
        setBriefing((prev) => ({
          ...prev,
          cost_center: data.cost_center ?? prev.cost_center,
          active_admissions: data.active_admissions,
        }))
        // No active IP for this branch — do not open an empty popup.
        if (data.active_admissions.length === 0) {
          setAdmissionsOnly(false)
          setStep(null)
          setLandingHold(false)
          return
        }
        setLandingHold(false)
      } catch (err) {
        console.error('Failed to load IP warnings briefing:', err)
        loadedSectionsRef.current.admissions = true
        setAdmissionsOnly(false)
        setStep(null)
        setLandingHold(false)
      } finally {
        setLoading(false)
      }
    })()
  }, [admissionsAllowed, userCostCenter])

  const openLabReviewBriefing = useCallback(() => {
    setLandingHold(true)
    setAdmissionsOnly(false)
    setLabsOnly(true)
    loadedSectionsRef.current.lab_tests = false
    setStep('lab_tests')
    setLoading(true)
    void (async () => {
      try {
        const data = await fetchDoctorBriefingLabTests(userCostCenter)
        loadedSectionsRef.current.lab_tests = true
        setBriefing((prev) => ({
          ...prev,
          pending_review_lab_tests: data.pending_review_lab_tests,
        }))
        if (data.pending_review_lab_tests.length === 0) {
          setLabsOnly(false)
          setStep(null)
          setLandingHold(false)
          return
        }
        setLandingHold(false)
      } catch (err) {
        console.error('Failed to load pending lab review:', err)
        loadedSectionsRef.current.lab_tests = true
        setLabsOnly(false)
        setStep(null)
        setLandingHold(false)
      } finally {
        setLoading(false)
      }
    })()
  }, [userCostCenter])

  useEffect(() => {
    if (!shouldOfferBriefing || step) return
    markShiftBriefingShown('doctor')
    // Check first, then reveal: OP-only branches never see the admissions step.
    setLandingHold(true)
    setStep(admissionsAllowed ? 'admissions' : 'lab_tests')
  }, [shouldOfferBriefing, step, admissionsAllowed])

  // If branch metadata resolves to OP-only after admissions was queued, skip it.
  useEffect(() => {
    if (!costCenterCareScopeReady || admissionsAllowed) return
    if (step !== 'admissions') return
    if (admissionsOnly) {
      setAdmissionsOnly(false)
      setStep(null)
      setLandingHold(false)
      return
    }
    setStep('lab_tests')
  }, [costCenterCareScopeReady, admissionsAllowed, step, admissionsOnly])

  useEffect(() => {
    if (!step || completedForLandingRef.current) return
    // Never fetch / show admissions for OP-only branches.
    if (step === 'admissions' && !admissionsAllowed) return
    void loadSection(step)
  }, [step, loadSection, admissionsAllowed])

  const handleAdvance = useCallback(() => {
    setStep((current) => {
      if (admissionsOnly) {
        setAdmissionsOnly(false)
        return null
      }
      if (labsOnly) {
        setLabsOnly(false)
        return null
      }
      if (current === 'admissions') return 'lab_tests'
      markShiftBriefingShown('doctor')
      completedForLandingRef.current = true
      return null
    })
  }, [admissionsOnly, labsOnly])

  const finishBriefing = useCallback(() => {
    markShiftBriefingShown('doctor')
    completedForLandingRef.current = true
    setAdmissionsOnly(false)
    setLabsOnly(false)
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
      params.set('screen', 'warn')
      params.set('patient', admission.patient)
      navigate(`/doctor?${params.toString()}`)
    },
    [applyIpCareContext, finishBriefing, navigate],
  )

  const handleLabTestSelect = useCallback(
    (payload: { tests: DoctorBriefingLabTest[]; groupLabel?: string }) => {
      const labTest = payload.tests[0]
      if (!labTest) return

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
      params.set('screen', 'lab')
      params.set('patient', labTest.patient)
      if (payload.tests.length > 1) {
        params.set('lab_tests', payload.tests.map((t) => t.name).filter(Boolean).join(','))
        if (payload.groupLabel) params.set('lab_group_label', payload.groupLabel)
      } else {
        params.set('lab_test', labTest.name)
      }
      navigate(`/doctor?${params.toString()}`)
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
  const visibleStep: DoctorBriefingStep | null =
    step === 'admissions' && !admissionsAllowed ? null : step
  const showBriefing = Boolean(visibleStep) && !landingHold

  const value = useMemo(
    () => ({
      briefingActive: showBriefing,
      step: visibleStep,
      openAdmissionsBriefing,
      openLabReviewBriefing,
    }),
    [showBriefing, visibleStep, openAdmissionsBriefing, openLabReviewBriefing],
  )

  return (
    <DoctorBriefingContext.Provider value={value}>
      {children}
      {showBriefing && visibleStep ? (
        <DoctorBriefingModals
          step={visibleStep}
          briefing={briefing}
          loading={loading}
          onAdvance={handleAdvance}
          onAdmissionSelect={handleAdmissionSelect}
          onLabTestSelect={handleLabTestSelect}
          admissionsOnly={admissionsOnly}
          labsOnly={labsOnly}
        />
      ) : null}
    </DoctorBriefingContext.Provider>
  )
}
