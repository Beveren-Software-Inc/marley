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
    setSelectedPatient,
    setMode,
    setActiveAdmission,
    setActiveVisit,
    applyIpCareContext,
  } = useCareContext()

  const patientFromUrl = searchParams.get('patient')
  const onDoctorRoute = location.pathname === '/doctor'
  const isDoctor = isDoctorRole(userRole)

  const [step, setStep] = useState<DoctorBriefingStep | null>(null)
  const [briefing, setBriefing] = useState<DoctorShiftBriefing>(EMPTY_BRIEFING)
  const [loading, setLoading] = useState(false)
  const [admissionsOnly, setAdmissionsOnly] = useState(false)
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
    !wasShiftBriefingShown('doctor')

  const clearBriefingUi = useCallback(() => {
    setStep(null)
    setAdmissionsOnly(false)
    setBriefing(EMPTY_BRIEFING)
    setLoading(false)
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
    if (careSelected && !admissionsOnly) {
      clearBriefingUi()
    }
  }, [careSelected, admissionsOnly, clearBriefingUi])

  const loadSection = useCallback(
    async (section: DoctorBriefingStep) => {
      if (loadedSectionsRef.current[section]) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        if (section === 'admissions') {
          const data = await fetchDoctorBriefingAdmissions()
          loadedSectionsRef.current.admissions = true
          setBriefing((prev) => ({
            ...prev,
            cost_center: data.cost_center ?? prev.cost_center,
            active_admissions: data.active_admissions,
          }))
        } else {
          const data = await fetchDoctorBriefingLabTests(userCostCenter)
          loadedSectionsRef.current.lab_tests = true
          setBriefing((prev) => ({
            ...prev,
            pending_review_lab_tests: data.pending_review_lab_tests,
          }))
        }
      } catch (err) {
        console.error(`Failed to load doctor briefing (${section}):`, err)
        loadedSectionsRef.current[section] = true
      } finally {
        setLoading(false)
      }
    },
    [userCostCenter],
  )

  const openAdmissionsBriefing = useCallback(() => {
    setAdmissionsOnly(true)
    loadedSectionsRef.current.admissions = false
    setStep('admissions')
    setLoading(true)
    void (async () => {
      try {
        const data = await fetchDoctorBriefingAdmissions()
        loadedSectionsRef.current.admissions = true
        setBriefing((prev) => ({
          ...prev,
          cost_center: data.cost_center ?? prev.cost_center,
          active_admissions: data.active_admissions,
        }))
      } catch (err) {
        console.error('Failed to load IP warnings briefing:', err)
        loadedSectionsRef.current.admissions = true
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!shouldOfferBriefing || step) return
    markShiftBriefingShown('doctor')
    setStep('admissions')
  }, [shouldOfferBriefing, step])

  useEffect(() => {
    if (!step || completedForLandingRef.current) return
    void loadSection(step)
  }, [step, loadSection])

  const handleAdvance = useCallback(() => {
    setStep((current) => {
      if (admissionsOnly) {
        setAdmissionsOnly(false)
        return null
      }
      if (current === 'admissions') return 'lab_tests'
      markShiftBriefingShown('doctor')
      completedForLandingRef.current = true
      return null
    })
  }, [admissionsOnly])

  const finishBriefing = useCallback(() => {
    markShiftBriefingShown('doctor')
    completedForLandingRef.current = true
    setAdmissionsOnly(false)
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
    (labTest: DoctorBriefingLabTest) => {
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
      params.set('lab_test', labTest.name)
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

  const value = useMemo(
    () => ({
      briefingActive: Boolean(step),
      step,
      openAdmissionsBriefing,
    }),
    [step, openAdmissionsBriefing],
  )

  return (
    <DoctorBriefingContext.Provider value={value}>
      {children}
      {step ? (
        <DoctorBriefingModals
          step={step}
          briefing={briefing}
          loading={loading}
          onAdvance={handleAdvance}
          onAdmissionSelect={handleAdmissionSelect}
          onLabTestSelect={handleLabTestSelect}
          admissionsOnly={admissionsOnly}
        />
      ) : null}
    </DoctorBriefingContext.Provider>
  )
}
