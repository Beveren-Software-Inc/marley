import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ADHDAssessmentList } from '../components/adhd/AdhdAssessmentList'
import { CreateADHDAssessmentModal } from '../components/adhd/CreateADHDAssessmentModal'
import { DischargeAdmissionView } from '../components/admissions/DischargeAdmissionView'
import { SuicidalPatientAssessmentModal } from '../components/admissions/SuicidalPatientAssessmentModal'
import { CreateAppointmentModal } from '../components/appointments/CreateAppointmentModal'
import { ClinicalNotesList } from '../components/clinicalNotes/ClinicalNotesList'
import { CreateClinicalNoteModal } from '../components/clinicalNotes/CreateClinicalNoteModal'
import { MainNursingNoteList } from '../components/nursing/MainNursingNoteList'
import { CreateMainNursingNoteModal } from '../components/nursing/CreateMainNursingNoteModal'
import { DoctorOrderList } from '../components/doctorOrder/DoctorOrderList'
import { CreateDoctorOrderModal } from '../components/doctorOrder/CreateDoctorOrderModal'
import { CreateDoctorMedicationPlanModal } from '../components/doctorMedicationPlan/CreateDoctorMedicationPlanModal'
import { SuicideRiskAssessmentList } from '../components/clinicalSuicide/ClinicalSuicideRiskAssessmentList'
import { CreateSuicideRiskAssessmentModal } from '../components/clinicalSuicide/CreateClinicalSuicideRiskAssessmentModal'
import { CreateDepressionAssessmentModal } from '../components/depression/CreateDepressionAssessmentModal'
import { DepressionAssessmentList } from '../components/depression/DepressionAssessmentList'
import { DiagnosisSymptomsScreen } from '../components/diagnosis/DiagnosisSymptomsScreen'
import { PatientDiagnosisModal } from '../components/diagnosis/PatientDiagnosisModal'
import { DischargeList } from '../components/discharges/DischargeList'
import { ECTDashboard } from '../components/ect/ECTDashboard'
import { EnvironmentalChecklistList } from '../components/environmental/EnvironmentalChecklistList'
import { CreateGAD7AssessmentModal } from '../components/gad7/CreateGAD7AssessmentModal'
import { GAD7AssessmentList } from '../components/gad7/GAD7AssessmentList'
import { CreateHomicideRiskAssessmentModal } from '../components/homicide/CreateHomicideRiskAssessmentModal'
import { HomicideRiskAssessmentList } from '../components/homicide/HomicideRiskAssessmentList'
import { IOPDayListWithHeader } from '../components/iop/IOPDayList'
import { IOPEnrollmentListWithHeader } from '../components/iop/IOPEnrollmentList'
import { LabTestList } from '../components/labTests/LabTestList'
import { LabTestHistory } from '../components/labTests/LabTestHistory'
import { MedicalHistoryView } from '../components/medicalHistory/MedicalHistoryView'
import { CreateMedicineGivenModal } from '../components/medication/CreateMedicineGivenModal'
import { MedicineGivenList } from '../components/medication/MedicineGivenList'
import { ReceptionLongActingMedicineList } from '../components/medication/ReceptionLongActingMedicineList'
import { BulkScheduleIOPModal } from '../components/iop/BulkScheduleIOPModal'
import { CreateMoodDisorderAssessmentModal } from '../components/mood_disorder/CreateMoodDisorderAssessmentModal'
import { MoodDisorderAssessmentList } from '../components/mood_disorder/MoodDisorderAssessmentList'
import { MorseFallScaleList } from '../components/morse/MorseFallScaleList'
import { CreateNurseTaskModal } from '../components/nurseTask/CreateNurseTaskModal'
import { NurseTaskList } from '../components/nurseTask/NurseTaskList'
import { CreateObservationModal } from '../components/observations/CreateObservationModal'
import { ObservationList } from '../components/observations/ObservationList'
import { PackageDetailView } from '../components/packageDetails/PackageDetailView'
import { CreatePANSSAssessmentModal } from '../components/panss/CreatePANSSAssessmentModal'
import { PANSSAssessmentList } from '../components/panss/PANSSAssessmentList'
import { PatientHistoryList } from '../components/patientHistory/PatientHistoryList'
import { PatientHistoryModal } from '../components/patientHistory/PatientHistoryModal'
import { CreatePatientModal } from '../components/patients/CreatePatientModal'
import { PatientList } from '../components/patients/PatientList'
import { PatientCareHeader } from '../components/patients/PatientCareHeader'
import { CreatePHQ9AssessmentModal } from '../components/phq9/CreatePHQ9AssessmentModal'
import { PHQ9AssessmentList } from '../components/phq9/PHQ9AssessmentList'
import { PhysicalExaminationList } from '../components/physicalExam/PhysicalExaminationList'
import { PhysicalExaminationModal } from '../components/physicalExam/PhysicalExaminationModal'
import { CreatePrescriptionModal } from '../components/prescriptions/CreatePrescriptionModal'
import { PrescriptionList } from '../components/prescriptions/PrescriptionList'
import { RxPage } from '../components/prescriptions/SinglePrescription'
import { CreateServiceRequestModal } from '../components/serviceRequests/CreateServiceRequestModal'
import { ServiceRequestList } from '../components/serviceRequests/ServiceRequestList'
import { CreateSleepingPatternModal } from '../components/sleeping/CreateSleepingPatternModal'
import { SleepingPatternList } from '../components/sleeping/SleepingPatternList'
import { SuicidalAssessmentList } from '../components/suicidal/SuicidalAssessmentList'
import { CreateVitalSignModal } from '../components/vitalSigns/CreateVitalSignModal'
import { VitalSignsList } from '../components/vitalSigns/VitalSignsList'
import { CreateWarningMessageModal } from '../components/warnings/CreateWarningMessageModal'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { CreateYBOCSAssessmentModal } from '../components/ybocs/CreateYBOCSAssessmentModal'
import { YBOCSAssessmentList } from '../components/ybocs/YBOCSAssessmentList'
import { CreateYMRSAssessmentModal } from '../components/ymrs/CreateYMRSAssessmentModal'
import { YMRSAssessmentList } from '../components/ymrs/YMRSAssessmentList'
import { toast } from '../hooks/useToast'
import { useIpDoctorRequirements } from '../hooks/useIpDoctorRequirements'
import { useOpDoctorRequirements } from '../hooks/useOpDoctorRequirements'
import { fetchIpDoctorRequiredDocumentsStatus } from '../services/ipDoctorRequirements'
import type { PatientVisitListRow } from '../services/patientVisits'
import { useCareContext } from '../providers/CareContextProvider'
import { CreatePatientMedicalHistoryModal } from '../components/medicalHistory/CreatePatientMedicalHistoryModal'
import { isDoctorScreenBlocked } from '../config/costCenterCareScope'
import { draftSavedAt, hasAnyDischargeDraft } from '../services/dischargeDraft'
import { getPatientActiveAdmission, type InpatientRecord } from '../services/inpatientRecords'
import {
  navigateToDischarge,
  stripDischargeFlowParams,
} from '../utils/dischargeNavigation'
import {
  DOCTOR_DISCHARGE_SCREEN_ID,
  inpatientDischargeAllowed,
  isInpatientDischargeRoute,
  modeForInpatientDischargeScreens,
} from '../utils/inpatientDischargeRoute'
import { AdmissionPage } from './Admission'
import { PatientVisitPage } from './PatientVisit'

import { DashboardCard } from '../components/ui/DashboardCard'
import { PortalTopBar } from '../components/layout/PortalTopBar'
import { AppointmentsCard, OutpatientVisitsCard, InpatientAdmissionsCard } from '../components/dashboard/StandardDashboardCards'

const CreateLabRequestModal = ({ 
  onClose, 
  onSuccess, 
  initialPatient 
}: { 
  onClose: () => void
  onSuccess: () => void
  initialPatient?: string 
}) => {
  return (
    <CreateServiceRequestModal
      onClose={onClose}
      onSuccess={onSuccess}
      initialPatient={initialPatient}
      labTestTemplateOnly
    />
  )
}

export const DoctorPage = () => {
  const {
    mode,
    activeVisit,
    activeAdmission,
    selectedPatient: globalPatient,
    setSelectedPatient: setGlobalPatient,
    costCenterCareScope,
    guardClinicalCreate,
    setMode,
    setActiveVisit,
    setActiveAdmission,
  } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const patientFromUrl = searchParams.get('patient')
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(() => patientFromUrl || globalPatient || undefined)
  const syncingPatientSelectionRef = useRef(false)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [showLabTestModal, setShowLabTestModal] = useState(false)
  const [labCardTab, setLabCardTab] = useState<'reports' | 'requests'>('reports')
  const [showLabTrends, setShowLabTrends] = useState(false)
  const [showCreatePatientModal , setShowCreatePatientModal] = useState(false)
  const [patientRefreshKey, setPatientRefreshKey] = useState(0)
  const [dischargeHasDraft, setDischargeHasDraft] = useState(false)
  const [draftAdmissionNo, setDraftAdmissionNo] = useState<string | null>(null)
  const [showObservationModal, setShowObservationModal] = useState(false)
  const [showDiagnosisModal, setShowDiagnosisModal] = useState(false)
  const [warningRefreshKey, setWarningRefreshKey] = useState(0)
  const [labTestRefreshKey, setLabTestRefreshKey] = useState(0)
  const [observationRefreshKey, setObservationRefreshKey] = useState(0)
  const [dischargeRefreshKey, setDischargeRefreshKey] = useState(0)
  const [, setDiagnosisRefreshKey] = useState(0)
  const [, setDoctorProgressNoteRefreshKey] = useState(0)
  const [clinicalNotesRefreshKey, setClinicalNotesRefreshKey] = useState(0)
  const [showServiceRequestModal, setShowServiceRequestModal] = useState(false)
  const [serviceRequestRefreshKey, setServiceRequestRefreshKey] = useState(0)
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)
  const [appointmentRefreshKey, setAppointmentRefreshKey] = useState(0)
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false)
  const [prescriptionRefreshKey, setPrescriptionRefreshKey] = useState(0)
  const [showBulkScheduleModal, setShowBulkScheduleModal] = useState(false)
  const [showGivenMedicineModal, setShowGivenMedicineModal] = useState(false)
  const [givenRefreshKey, setGivenRefreshKey] = useState(0)
  const [showDoctorNoteModal, setShowDoctorNoteModal] = useState(false)
  const [showDoctorOrderModal, setShowDoctorOrderModal] = useState(false)
  const [showNursingNoteModal, setShowNursingNoteModal] = useState(false)
  const [showNutritionNoteModal, setShowNutritionNoteModal] = useState(false)
  const [showTherapistNoteModal, setShowTherapistNoteModal] = useState(false)
  const [showDoctorProgressNoteModal, setShowDoctorProgressNoteModal] = useState(false)
  const [showDoctorMedicationPlanModal, setShowDoctorMedicationPlanModal] = useState(false)
  const [, setDoctorMedicationPlanRefreshKey] = useState(0)
  const [showPsychologistNoteModal, setShowPsychologistNoteModal] = useState(false)
  const [showVitalSignModal, setShowVitalSignModal] = useState(false)
  const [vitalSignsRefreshKey, setVitalSignsRefreshKey] = useState(0)
  const [showSleepingPatternModal, setShowSleepingPatternModal] = useState(false)
  const [sleepingPatternRefreshKey, setSleepingPatternRefreshKey] = useState(0)
  const [envChecklistCreateOpen, setEnvChecklistCreateOpen] = useState(false)
  const [showCreateNurseTaskModal, setShowCreateNurseTaskModal] = useState(false)
  const [longActingRefreshKey] = useState(0)
  const [showPhysicalExamModal, setShowPhysicalExamModal] = useState(false)
  const [physicalExamRefreshKey, setPhysicalExamRefreshKey] = useState(0)
  const [showPatientHistoryModal, setShowPatientHistoryModal] = useState(false)
  const [patientHistoryRefreshKey, setPatientHistoryRefreshKey] = useState(0)
  const [showCreateMedicalHistoryModal, setShowCreateMedicalHistoryModal] = useState(false)
  const [medicalHistoryRefreshKey, setMedicalHistoryRefreshKey] = useState(0)
  const rawScreen = searchParams.get('screen')
  const dischargeAdmission = searchParams.get('discharge')
  const inDischargeRoute = isInpatientDischargeRoute(searchParams, [DOCTOR_DISCHARGE_SCREEN_ID])
  const modeForScreens = modeForInpatientDischargeScreens(mode, costCenterCareScope, inDischargeRoute)
  const screenBlocked = !!(rawScreen && isDoctorScreenBlocked(rawScreen, costCenterCareScope, modeForScreens))
  const screen = screenBlocked ? null : rawScreen

  useLayoutEffect(() => {
    if (!inDischargeRoute || mode === 'IP' || costCenterCareScope === 'op_only') return
    setMode('IP')
  }, [inDischargeRoute, mode, costCenterCareScope, setMode])
  const [showCreateADHDModal, setShowCreateADHDModal] = useState(false)
  const [adhdRefreshKey, setAdhdRefreshKey] = useState(0)
  const [showCreateDepressionModal, setShowCreateDepressionModal] = useState(false)
  const [depressionRefreshKey, setDepressionRefreshKey] = useState(0)
  const [showCreateMoodModal, setShowCreateMoodModal] = useState(false)
  const [moodRefreshKey, setMoodRefreshKey] = useState(0)
  const [showCreateGAD7Modal, setShowCreateGAD7Modal] = useState(false)
  const [gad7RefreshKey, setGad7RefreshKey] = useState(0)
  const [showCreatePHQ9Modal, setShowCreatePHQ9Modal] = useState(false)
  const [phq9RefreshKey, setPhq9RefreshKey] = useState(0)
  const [showCreateSuicideRiskModal, setShowCreateSuicideRiskModal] = useState(false)
  const [suicideRiskRefreshKey, setSuicideRiskRefreshKey] = useState(0)
  const [showCreateHomicideRiskModal, setShowCreateHomicideRiskModal] = useState(false)
  const [homicideRiskRefreshKey, setHomicideRiskRefreshKey] = useState(0)
  const [showCreateYBOCSModal, setShowCreateYBOCSModal] = useState(false)
  const [ybocsRefreshKey, setYbocsRefreshKey] = useState(0)
  const [showCreateYMRSModal, setShowCreateYMRSModal] = useState(false)
  const [ymrsRefreshKey, setYmrsRefreshKey] = useState(0)
  const [showCreatePANSSModal, setShowCreatePANSSModal] = useState(false)
  const [panssRefreshKey, setPanssRefreshKey] = useState(0)
  const [showSuicidalModal, setShowSuicidalModal] = useState(false)
  const [suicidalRefreshKey, setSuicidalRefreshKey] = useState(0)

  const showIpRequiredDocs = Boolean(selectedPatient && mode === 'IP' && activeAdmission)
  const showOpRequiredDocs = Boolean(selectedPatient && mode === 'OP' && activeVisit)
  const ipDocsRefreshToken = `${suicideRiskRefreshKey}-${patientHistoryRefreshKey}-${medicalHistoryRefreshKey}`
  const opDocsRefreshToken = String(medicalHistoryRefreshKey)
  const { status: ipDocStatus } = useIpDoctorRequirements(
    selectedPatient,
    activeAdmission,
    showIpRequiredDocs,
    ipDocsRefreshToken
  )
  const { status: opDocStatus } = useOpDoctorRequirements(
    selectedPatient,
    activeVisit,
    showOpRequiredDocs,
    opDocsRefreshToken
  )
  const pmhRequiresAttention =
    (showIpRequiredDocs && ipDocStatus !== null && !ipDocStatus.medical_history) ||
    (showOpRequiredDocs && opDocStatus !== null && !opDocStatus.medical_history)
  const pmhAttentionLabel =
    mode === 'OP'
      ? 'Required for this OP visit — add patient medical history'
      : 'Required for this IP admission — add patient medical history'

  // Sync selectedPatient with URL on mount and when URL changes
  useEffect(() => {
    const patientParam = searchParams.get('patient')
    if (syncingPatientSelectionRef.current) {
      if ((patientParam || undefined) === (selectedPatient || undefined)) {
        syncingPatientSelectionRef.current = false
      }
      return
    }
    if (patientParam && patientParam !== selectedPatient) {
      setSelectedPatient(patientParam)
    } else if (!patientParam && selectedPatient) {
      // Only clear if URL doesn't have patient param
      // Don't clear if we're just initializing
    }
  }, [searchParams, selectedPatient])

  // Ensure patient param is preserved when navigating to OP Visit or Admission screens
  useEffect(() => {
    if (syncingPatientSelectionRef.current) return
    if (!selectedPatient) return
    if (screen === 'admission' || screen === 'op') {
      const currentPatient = searchParams.get('patient')
      if (!currentPatient) {
        const newSearchParams = new URLSearchParams(searchParams)
        newSearchParams.set('patient', selectedPatient)
        setSearchParams(newSearchParams, { replace: true })
      }
    }
  }, [screen, selectedPatient, searchParams, setSearchParams])

  useLayoutEffect(() => {
    if (dischargeAdmission) return
    if (!rawScreen || !isDoctorScreenBlocked(rawScreen, costCenterCareScope, modeForScreens)) return
    const np = new URLSearchParams(searchParams)
    np.delete('screen')
    setSearchParams(np, { replace: true })
  }, [dischargeAdmission, rawScreen, costCenterCareScope, modeForScreens, searchParams, setSearchParams])

  const handleCreateDischarge = async () => {
    if (!selectedPatient) {
      toast.error('Please select a patient first')
      return
    }
    try {
      const admission = await getPatientActiveAdmission(selectedPatient)
      if (!admission) {
        toast.error('No active admission found for this patient')
        return
      }
      const hasDraft = await hasAnyDischargeDraft(admission.name)
      setDischargeHasDraft(hasDraft)
      setDraftAdmissionNo(admission.name)
      navigateToDischarge(
        {
          name: admission.name,
          patient: admission.patient,
          patient_name: admission.patient_name,
        },
        navigate,
        `/doctor?${searchParams.toString()}`
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch admission')
    }
  }

  useEffect(() => {
    if (!selectedPatient || rawScreen !== 'df') {
      setDischargeHasDraft(false)
      setDraftAdmissionNo(null)
      return
    }
    getPatientActiveAdmission(selectedPatient)
      .then(async (admission) => {
        if (admission && (await hasAnyDischargeDraft(admission.name))) {
          setDischargeHasDraft(true)
          setDraftAdmissionNo(admission.name)
        } else {
          setDischargeHasDraft(false)
          setDraftAdmissionNo(null)
        }
      })
      .catch(() => {
        setDischargeHasDraft(false)
        setDraftAdmissionNo(null)
      })
  }, [selectedPatient, rawScreen, dischargeRefreshKey])

  useEffect(() => {
    const state = location.state as { dischargeCompleted?: boolean } | null
    if (!state?.dischargeCompleted) return
    setDischargeRefreshKey((k) => k + 1)
    navigate(`${location.pathname}?${searchParams.toString()}`, { replace: true, state: {} })
  }, [location.state, location.pathname, navigate, searchParams])

  const handlePatientSelect = (patient: string | undefined) => {
    syncingPatientSelectionRef.current = true
    setSelectedPatient(patient)
    setGlobalPatient(patient)
    const newSearchParams = new URLSearchParams(searchParams)
    if (patient) {
      newSearchParams.set('patient', patient)
    } else {
      newSearchParams.delete('patient')
    }
    setSearchParams(newSearchParams, { replace: true })
  }

  const handleVisitActivate = (visit: PatientVisitListRow) => {
    if (visit.patient) {
      handlePatientSelect(visit.patient)
    }
    setMode('OP')
    setActiveAdmission(undefined)
    setActiveVisit(visit.value)
    try {
      localStorage.setItem('patientSearch_activeMode', 'OP')
      localStorage.setItem('patientSearch_activeVisit', visit.value)
      localStorage.setItem('patientSearch_activeVisitLabel', visit.value)
      localStorage.removeItem('patientSearch_activeAdmission')
      localStorage.removeItem('patientSearch_activeAdmissionLabel')
    } catch {
      /* ignore storage errors */
    }
    const np = new URLSearchParams(searchParams)
    if (visit.patient) np.set('patient', visit.patient)
    np.delete('screen')
    setSearchParams(np, { replace: true })
  }

  const handleAdmissionActivate = (record: InpatientRecord) => {
    if (record.patient) {
      handlePatientSelect(record.patient)
    }
    setMode('IP')
    setActiveVisit(undefined)
    setActiveAdmission(record.name)
    try {
      localStorage.setItem('patientSearch_activeMode', 'IP')
      localStorage.setItem('patientSearch_activeAdmission', record.name)
      localStorage.setItem('patientSearch_activeAdmissionLabel', record.name)
      localStorage.removeItem('patientSearch_activeVisit')
      localStorage.removeItem('patientSearch_activeVisitLabel')
    } catch {
      /* ignore storage errors */
    }
    const np = new URLSearchParams(searchParams)
    if (record.patient) np.set('patient', record.patient)
    np.delete('screen')
    stripDischargeFlowParams(np)
    setSearchParams(np, { replace: true })
  }

  const returnToDoctorHome = () => {
    const np = new URLSearchParams(searchParams)
    if (!np.get('screen')) return
    np.delete('screen')
    setSearchParams(np, { replace: true })
  }

  const continueIpRequiredDocsAfterPmh = async () => {
    if (mode !== 'IP' || !selectedPatient || !activeAdmission) return
    try {
      const status = await fetchIpDoctorRequiredDocumentsStatus(selectedPatient, activeAdmission)
      setMedicalHistoryRefreshKey((t) => t + 1)
      if (!status.history_form) {
        setShowPatientHistoryModal(true)
      } else if (!status.suicide_risk) {
        setShowCreateSuicideRiskModal(true)
      }
    } catch {
      /* ignore */
    }
  }

  const continueIpRequiredDocsAfterHistoryForm = async () => {
    if (mode !== 'IP' || !selectedPatient || !activeAdmission) return
    try {
      const status = await fetchIpDoctorRequiredDocumentsStatus(selectedPatient, activeAdmission)
      setPatientHistoryRefreshKey((t) => t + 1)
      if (!status.suicide_risk) {
        setShowCreateSuicideRiskModal(true)
      }
    } catch {
      /* ignore */
    }
  }

  const closeDischarge = () => {
    const state = location.state as { returnTo?: string } | null
    if (state?.returnTo) {
      navigate(state.returnTo, { replace: true })
      return
    }
    const np = new URLSearchParams(searchParams)
    stripDischargeFlowParams(np)
    setSearchParams(np, { replace: true })
  }

  const handleDischargeSuccess = () => {
    toast.success('Discharge completed successfully')
    const state = location.state as { returnTo?: string } | null
    if (state?.returnTo) {
      navigate(state.returnTo, { replace: true, state: { dischargeCompleted: true } })
      return
    }
    const np = new URLSearchParams(searchParams)
    stripDischargeFlowParams(np)
    setSearchParams(np, { replace: true, state: { dischargeCompleted: true } })
  }

  // Discharge workflow — keep portal top bar; form fills content area only
  if (dischargeAdmission && inpatientDischargeAllowed(costCenterCareScope)) {
    const navState = location.state as { patient?: string; patient_name?: string } | null
    const patientForBar =
      selectedPatient || navState?.patient || searchParams.get('patient') || undefined
    return (
      <div className="flex flex-col h-[calc(100vh-2.25rem)] max-h-[calc(100vh-2.25rem)] overflow-hidden">
        <PortalTopBar selectedPatient={patientForBar || ''} onPatientSelect={handlePatientSelect} />
        <div className="flex-1 min-h-0 overflow-hidden bg-white">
          <DischargeAdmissionView
            admissionName={dischargeAdmission}
            patientHint={navState?.patient}
            patientNameHint={navState?.patient_name}
            onClose={closeDischarge}
            onSuccess={handleDischargeSuccess}
          />
        </div>
      </div>
    )
  }

  // Show Admission page when screen=admission — hidden in OP mode
  if (!dischargeAdmission && screen === 'admission' && modeForScreens !== 'OP') {
    return <AdmissionPage />
  }

  // Show Patient Visit page when screen=op
  if (screen === 'op') {
    return <PatientVisitPage initialPatient={selectedPatient} />
  }

  if (screen === 'suicide') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />

        <div className="p-4">
          <DashboardCard
            title="Suicidal Assessments"
            noHeightLimit
            onAdd={() => guardClinicalCreate(() => setShowSuicidalModal(true))}
            addButtonTitle="Add Suicidal Assessment"
          >
            <SuicidalAssessmentList
              patient={selectedPatient}
              admission={activeAdmission}
              refreshKey={suicidalRefreshKey}
            />
          </DashboardCard>
        </div>

        {showSuicidalModal && (
          <SuicidalPatientAssessmentModal
            admissionNo={activeAdmission || ''}
            patient={selectedPatient || ''}
            patientName=''
            onClose={() => setShowSuicidalModal(false)}
            onSuccess={() => {
              setSuicidalRefreshKey(prev => prev + 1)
              setShowSuicidalModal(false)
            }}
          />
        )}
      </div>
    )
  }

  // Show Sleeping Pattern
  if (screen === 'sleep') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Sleeping Pattern" 
            onAdd={() => guardClinicalCreate(() => setShowSleepingPatternModal(true))}
            addButtonTitle="Create Sleeping Pattern"
          >
            <SleepingPatternList
              patient={selectedPatient}
              refreshKey={sleepingPatternRefreshKey}
            />
          </DashboardCard>
        </div>
        {showSleepingPatternModal && (
          <CreateSleepingPatternModal
            onClose={() => setShowSleepingPatternModal(false)}
            onSuccess={() => {
              setSleepingPatternRefreshKey(prev => prev + 1)
              setShowSleepingPatternModal(false)
            }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  // Show ECT Details
  if (screen === 'ect') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <ECTDashboard selectedPatient={selectedPatient} />
        </div>
      </div>
    )
  }

  // Show Doctors Note
  if (screen === 'dn') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Doctors Note" 
            onAdd={() => guardClinicalCreate(() => setShowDoctorNoteModal(true))}
            addButtonTitle="Add Doctors Note"
          >
            <ClinicalNotesList 
              patient={selectedPatient} 
              clinicalNoteType="Doctors Note"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showDoctorNoteModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowDoctorNoteModal(false)}
            onSuccess={() => {
              setClinicalNotesRefreshKey(prev => prev + 1)
              setShowDoctorNoteModal(false)
            }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Doctors Note"
            title="Add Doctors Note"
          />
        )}
      </div>
    )
  }

  // Show Patient Progress Note
  if (screen === 'dpn') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Patient Progress Notes" 
            onAdd={() => guardClinicalCreate(() => setShowDoctorProgressNoteModal(true))}
            addButtonTitle="Add Patient Progress Note"
          >
            <ClinicalNotesList 
              patient={selectedPatient} 
              clinicalNoteType="Doctor Progress Note"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showDoctorProgressNoteModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowDoctorProgressNoteModal(false)}
            onSuccess={() => {
              setClinicalNotesRefreshKey(prev => prev + 1)
              setShowDoctorProgressNoteModal(false)
            }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Doctor Progress Note"
            title="Add Patient Progress Note"
          />
        )}
      </div>
    )
  }

  // Show Doctors Order (Doctor Order doctype)
  if (screen === 'dos') {
    const orderAdmission = mode === 'IP' ? activeAdmission : undefined
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Doctors Order" 
            onAdd={() => guardClinicalCreate(() => setShowDoctorOrderModal(true))}
            addButtonTitle="Add Doctors Order"
          >
            <DoctorOrderList 
              patient={selectedPatient}
              admission={orderAdmission}
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showDoctorOrderModal && (
          <CreateDoctorOrderModal
            onClose={() => setShowDoctorOrderModal(false)}
            onSuccess={() => {
              setClinicalNotesRefreshKey(prev => prev + 1)
              setShowDoctorOrderModal(false)
            }}
            patient={selectedPatient}
            title="Add Doctors Order"
          />
        )}
      </div>
    )
  }

  // Lab Requests (Service Request — Lab Test Template)
  if (screen === 'lab-req') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard
            title="Lab Requests"
            onAdd={() => guardClinicalCreate(() => setShowServiceRequestModal(true))}
            addButtonTitle="Add Lab Request"
            noHeightLimit
          >
            <ServiceRequestList
              patient={selectedPatient}
              refreshKey={serviceRequestRefreshKey}
              template_dt="Lab Test Template"
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showServiceRequestModal && (
          <CreateServiceRequestModal
            onClose={() => setShowServiceRequestModal(false)}
            onSuccess={() => {
              setServiceRequestRefreshKey((prev) => prev + 1)
              setShowServiceRequestModal(false)
              toast.success('Lab request created successfully')
            }}
            initialPatient={selectedPatient}
            labTestTemplateOnly
          />
        )}
      </div>
    )
  }

  // Show Laboratory (Lab Tests)
  if (screen === 'lab') {
    const focusLabTest = searchParams.get('lab_test') || undefined
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Laboratory" 
            onAdd={() => guardClinicalCreate(() => setShowLabTestModal(true))}
            addButtonTitle="Add Lab Test"
            noHeightLimit
          >
            <LabTestList
              patient={selectedPatient}
              defaultStatus="Pending Review"
              doctorLabDefaults
              focusLabTest={focusLabTest}
              focusOpenReview
              key={`${labTestRefreshKey}-${focusLabTest || ''}`}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
      </div>
    )
  }

  // Show Psychologist Notes
  if (screen === 'psy-n') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Patient Psychologist Notes" 
            onAdd={() => guardClinicalCreate(() => setShowPsychologistNoteModal(true))}
            addButtonTitle="Add Psychologist Note"
          >
            <ClinicalNotesList 
              patient={selectedPatient} 
              clinicalNoteType="Psychologist Note"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showPsychologistNoteModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowPsychologistNoteModal(false)}
            onSuccess={() => {
              setClinicalNotesRefreshKey(prev => prev + 1)
              setShowPsychologistNoteModal(false)
            }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Psychologist Note"
            title="Add Psychologist Note"
          />
        )}
      </div>
    )
  }

  // Show Psychologist Orders
  if (screen === 'psy-o') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Psychologist Orders" 
            onAdd={() => guardClinicalCreate(() => setShowDiagnosisModal(true))}
            addButtonTitle="Add Psychologist Order"
          >
            <ClinicalNotesList
              patient={selectedPatient}
              clinicalNoteType="Psychologist Order"
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showDiagnosisModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowDiagnosisModal(false)}
            onSuccess={() => {
              setDiagnosisRefreshKey(prev => prev + 1)
              setShowDiagnosisModal(false)
            }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Psychologist Order"
            title="Add Psychologist Order"
          />
        )}
      </div>
    )
  }

  // Show Therapist Notes
  if (screen === 'ther') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Therapist Note" 
            onAdd={() => guardClinicalCreate(() => setShowTherapistNoteModal(true))}
            addButtonTitle="Add Therapist Note"
          >
            <ClinicalNotesList 
              patient={selectedPatient} 
              clinicalNoteType="Therapist Note"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showTherapistNoteModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowTherapistNoteModal(false)}
            onSuccess={() => {
              setClinicalNotesRefreshKey(prev => prev + 1)
              setShowTherapistNoteModal(false)
            }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Therapist Note"
            title="Add Therapist Note"
          />
        )}
      </div>
    )
  }

  // Show Nursing Notes (Main Nursing Note doctype)
  if (screen === 'nurse') {
    const noteAdmission = mode === 'IP' ? activeAdmission : undefined
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard
            title="Nursing Notes"
            onAdd={() => guardClinicalCreate(() => setShowNursingNoteModal(true))}
            addButtonTitle="Add Nursing Note"
          >
            <MainNursingNoteList
              patient={selectedPatient}
              admission={noteAdmission}
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showNursingNoteModal && (
          <CreateMainNursingNoteModal
            onClose={() => setShowNursingNoteModal(false)}
            onSuccess={() => {
              setClinicalNotesRefreshKey((prev) => prev + 1)
              setShowNursingNoteModal(false)
            }}
            patient={selectedPatient}
          />
        )}
      </div>
    )
  }

  // Nurse Task Assignment
  if (screen === 'nurse-tasks') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Nurse Tasks" 
            onAdd={() => guardClinicalCreate(() => setShowCreateNurseTaskModal(true))}
            addButtonTitle="New Nurse Task"
          >
            <div className="mb-3 text-xs text-slate-600">
              Tasks assigned to nurses for this patient — medication administration, vitals, lab support, and more.
            </div>
            <NurseTaskList patient={selectedPatient} currentShiftOnly={false} />
          </DashboardCard>
        </div>
        {showCreateNurseTaskModal && (
          <CreateNurseTaskModal
            patient={selectedPatient || undefined}
            onClose={() => setShowCreateNurseTaskModal(false)}
            onSuccess={() => setShowCreateNurseTaskModal(false)}
          />
        )}
      </div>
    )
  }

  // Show Observation
  if (screen === 'obs') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard
            title="Observation Level"
            onAdd={() => guardClinicalCreate(() => setShowObservationModal(true))}
            addButtonTitle="Add Observation Level"
          >
            <ObservationList patient={selectedPatient} key={observationRefreshKey} onPatientClick={handlePatientSelect} />
          </DashboardCard>
        </div>
        {showObservationModal && (
          <CreateObservationModal
            onClose={() => setShowObservationModal(false)}
            onSuccess={() => {
              setObservationRefreshKey(prev => prev + 1)
              setShowObservationModal(false)
            }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  // Show Vital Signs
  if (screen === 'tpr') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Vital Signs" 
            onAdd={() => guardClinicalCreate(() => setShowVitalSignModal(true))}
            addButtonTitle="Add Vital Signs"
          >
            <VitalSignsList patient={selectedPatient} refreshKey={vitalSignsRefreshKey} onPatientClick={handlePatientSelect} />
          </DashboardCard>
        </div>
        {showVitalSignModal && (
          <CreateVitalSignModal
            onClose={() => setShowVitalSignModal(false)}
            onSuccess={() => {
              setVitalSignsRefreshKey(prev => prev + 1)
              setShowVitalSignModal(false)
            }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  // Show All Prescriptions
  if (screen === 'rx') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="All Prescriptions" 
            onAdd={() => guardClinicalCreate(() => setShowPrescriptionModal(true))}
            addButtonTitle="Create Prescription"
            noHeightLimit
          >
            <PrescriptionList
              patient={selectedPatient}
              refreshKey={prescriptionRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showPrescriptionModal && (
          <CreatePrescriptionModal
            onClose={() => setShowPrescriptionModal(false)}
            onSuccess={() => {
              setPrescriptionRefreshKey(prev => prev + 1)
              setShowPrescriptionModal(false)
            }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  // Given Medicines — hidden in OP mode
  if (screen === 'gm' && mode !== 'OP') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Given Medicines" 
            onAdd={() => guardClinicalCreate(() => setShowGivenMedicineModal(true))}
            addButtonTitle="Record Given Medicine"
            noHeightLimit
          >
            <MedicineGivenList patient={selectedPatient} refreshKey={givenRefreshKey} />
          </DashboardCard>
        </div>
        {showGivenMedicineModal && (
          <CreateMedicineGivenModal
            initialPatient={selectedPatient}
            inpatientRecord={activeAdmission}
            onClose={() => setShowGivenMedicineModal(false)}
            onSuccess={() => {
              setGivenRefreshKey(prev => prev + 1)
              setShowGivenMedicineModal(false)
            }}
          />
        )}
      </div>
    )
  }

  // Show IP Medication
  if (screen === 'ipm') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="IP Medication (Inpatient Prescriptions)" 
            onAdd={() => guardClinicalCreate(() => setShowPrescriptionModal(true))}
            addButtonTitle="Create IP Prescription"
            noHeightLimit
          >
            <PrescriptionList
              patient={selectedPatient}
              refreshKey={prescriptionRefreshKey}
              careContext="Inpatient Admission"
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showPrescriptionModal && (
          <CreatePrescriptionModal
            onClose={() => setShowPrescriptionModal(false)}
            onSuccess={() => {
              setPrescriptionRefreshKey(prev => prev + 1)
              setShowPrescriptionModal(false)
            }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  // Morse Fall Scale
  if (screen === 'fall') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard title="Morse Fall Scale">
            <MorseFallScaleList
              patient={selectedPatient}
              onPatientClick={handlePatientSelect}
              defaultAdmission={activeAdmission || undefined}
              allowCreate={false}
            />
          </DashboardCard>
        </div>
      </div>
    )
  }

  // Environmental Checklist
  if (screen === 'env') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard title="Environmental Checklist" onAdd={() => setEnvChecklistCreateOpen(true)}>
            <EnvironmentalChecklistList
              patient={selectedPatient}
              defaultAdmission={activeAdmission || undefined}
              defaultVisit={activeVisit || undefined}
              onPatientClick={handlePatientSelect}
              createModalOpen={envChecklistCreateOpen}
              onCreateModalOpenChange={setEnvChecklistCreateOpen}
            />
          </DashboardCard>
        </div>
      </div>
    )
  }

  // IOP Dashboard
  if (screen === 'iop') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">IOP Dashboard</h2>
              <p className="text-sm text-slate-600 mt-1">
                Intensive Outpatient: schedule IOP days (slots) and enroll patients. Create a Patient Visit from an
                enrollment to link the visit.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowBulkScheduleModal(true)}
              className="flex-shrink-0 px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors whitespace-nowrap"
            >
              Bulk Schedule
            </button>
          </div>
          <div className="grid gap-6 md:grid-cols-2 auto-rows-fr">
            <DashboardCard title="IOP Days">
              <IOPDayListWithHeader refreshKey={appointmentRefreshKey} />
            </DashboardCard>
            <DashboardCard title="IOP Enrollments">
              <IOPEnrollmentListWithHeader
                refreshKey={appointmentRefreshKey}
                patientFilter={selectedPatient}
              />
            </DashboardCard>
          </div>
        </div>
        {showBulkScheduleModal && (
          <BulkScheduleIOPModal
            onClose={() => setShowBulkScheduleModal(false)}
            onSuccess={() => setShowBulkScheduleModal(false)}
          />
        )}
      </div>
    )
  }

  // Physical Examination
  if (screen === 'physical-exam') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Physical Examination" 
            onAdd={() => guardClinicalCreate(() => setShowPhysicalExamModal(true))}
            addButtonTitle="New Physical Examination"
          >
            <div className="text-sm text-slate-600 mb-3">
              Record physical examination findings by body system — skin, CVS/Resp, CNC, GIT and others.
            </div>
            <PhysicalExaminationList
              patient={selectedPatient}
              refreshKey={physicalExamRefreshKey}
            />
          </DashboardCard>
        </div>
        {showPhysicalExamModal && (
          <PhysicalExaminationModal
            admissionNo=""
            patient={selectedPatient}
            patientName=""
            onClose={() => setShowPhysicalExamModal(false)}
            onSuccess={() => {
              setPhysicalExamRefreshKey(prev => prev + 1)
              setShowPhysicalExamModal(false)
            }}
          />
        )}
      </div>
    )
  }

  // Patient History
  if (screen === 'patient-history') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Patient History" 
            onAdd={() => guardClinicalCreate(() => setShowPatientHistoryModal(true))}
            addButtonTitle="New Patient History"
          >
            <div className="text-sm text-slate-600 mb-3">
              Structured patient history records with template-driven attribute items and detailed descriptions.
            </div>
            <PatientHistoryList
              patient={selectedPatient}
              refreshKey={patientHistoryRefreshKey}
            />
          </DashboardCard>
        </div>
        {showPatientHistoryModal && (
          <PatientHistoryModal
            admissionNo=""
            patient={selectedPatient}
            patientName=""
            onClose={() => setShowPatientHistoryModal(false)}
            onSuccess={() => {
              setPatientHistoryRefreshKey(prev => prev + 1)
              setShowPatientHistoryModal(false)
            }}
          />
        )}
      </div>
    )
  }

  // Long Acting Medicine
  if (screen === 'd-long-acting-meds') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-slate-900">Long Acting Medicines</h2>
          </div>
          <DashboardCard title="Long Acting Medicines" noHeightLimit>
            <ReceptionLongActingMedicineList
              patient={selectedPatient || undefined}
              refreshKey={longActingRefreshKey}
            />
          </DashboardCard>
        </div>
      </div>
    )
  }

  // Appointments — full listing
  if (screen === 'appointments') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <AppointmentsCard
            fullScreen
            doctorScheduleMode
            patient={selectedPatient || undefined}
            onPatientSelect={handlePatientSelect}
            onOpenVisitInHeader={returnToDoctorHome}
          />
        </div>
      </div>
    )
  }

  // Show Patient Visit History
  if (screen === 'pvh') {
    return (
      <>
        <div className="flex flex-col">
          <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
          <div className="p-4">
            <OutpatientVisitsCard
              fullScreen
              patient={selectedPatient || undefined}
              onPatientSelect={handlePatientSelect}
              onVisitActivate={handleVisitActivate}
            />
          </div>
        </div>
      </>
    )
  }

  // Show Warning Messages full view
  if (screen === 'warn') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Warnings & Messages"
            onAdd={() => guardClinicalCreate(() => setShowWarningModal(true))}
            addButtonTitle="Add Warning Message"
          >
            <WarningMessagesList patient={selectedPatient} key={warningRefreshKey} onPatientClick={handlePatientSelect} />
          </DashboardCard>
        </div>
        {showWarningModal && (
          <CreateWarningMessageModal
            onClose={() => setShowWarningModal(false)}
            onSuccess={() => {
              setWarningRefreshKey(prev => prev + 1)
              setShowWarningModal(false)
            }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  // Show Nutritionist Notes
  if (screen === 'nut') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Nutritionist Notes" 
            onAdd={() => guardClinicalCreate(() => setShowNutritionNoteModal(true))}
            addButtonTitle="Add Nutritionist Note"
          >
            <ClinicalNotesList 
              patient={selectedPatient} 
              clinicalNoteType="Nutritionist Note"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showNutritionNoteModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowNutritionNoteModal(false)}
            onSuccess={() => {
              setClinicalNotesRefreshKey(prev => prev + 1)
              setShowNutritionNoteModal(false)
            }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Nutritionist Note"
            title="Add Nutritionist Note"
          />
        )}
      </div>
    )
  }

  // Show Medical History
  if (screen === 'mh') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard
            title="Past Medical History"
            onAdd={() => guardClinicalCreate(() => setShowCreateMedicalHistoryModal(true))}
            addButtonTitle="Add Past Medical History"
            requiresAttention={pmhRequiresAttention}
            attentionLabel={pmhAttentionLabel}
          >
            <MedicalHistoryView patient={selectedPatient} refreshKey={medicalHistoryRefreshKey} />
          </DashboardCard>
        </div>
        {showCreateMedicalHistoryModal && selectedPatient && (
          <CreatePatientMedicalHistoryModal
            patient={selectedPatient}
            defaultAdmission={activeAdmission || undefined}
            onClose={() => setShowCreateMedicalHistoryModal(false)}
            onCreated={async () => {
              setMedicalHistoryRefreshKey((prev) => prev + 1)
              setShowCreateMedicalHistoryModal(false)
              await continueIpRequiredDocsAfterPmh()
            }}
          />
        )}
      </div>
    )
  }

  // Show Package Details
  if (screen === 'pkg') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Package Details" 
            onAdd={async () => {
              if (!selectedPatient) {
                toast.error('Please select a patient first')
                return
              }
              try {
                const admission = await getPatientActiveAdmission(selectedPatient)
                if (!admission) {
                  toast.error('No active admission found for this patient')
                  return
                }
                window.open(
                  `/app/inpatient-record/${encodeURIComponent(admission.name)}`,
                  '_blank'
                )
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to open admission'
                toast.error(msg)
              }
            }}
            addButtonTitle="Manage Packages for Admission"
          >
            <PackageDetailView patient={selectedPatient} />
          </DashboardCard>
        </div>
      </div>
    )
  }

  // Show Diagnoses (all Medical Diagnosis Entry records)
  if (screen === 'dx') {
    return (
      <div className="flex flex-col h-[calc(100dvh-2.25rem)] max-h-[calc(100dvh-2.25rem)] overflow-hidden">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="flex-1 min-h-0 overflow-hidden">
          <DiagnosisSymptomsScreen />
        </div>
      </div>
    )
  }

  // Show Discharge Form — hidden in OP mode
  if (screen === DOCTOR_DISCHARGE_SCREEN_ID && modeForScreens !== 'OP') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Discharge Form" 
            onAdd={handleCreateDischarge}
            addButtonTitle={dischargeHasDraft ? 'Continue saved discharge' : 'Start discharge'}
          >
            {dischargeHasDraft && draftAdmissionNo && (
              <div className="mb-2 text-xs text-amber-700">
                Draft — {draftSavedAt(draftAdmissionNo)}
              </div>
            )}
            <DischargeList patient={selectedPatient} key={dischargeRefreshKey} onPatientClick={handlePatientSelect} />
          </DashboardCard>
        </div>
      </div>
    )
  }

  // Show Patients
  if (screen === 'patients') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Patients" 
            onAdd={() => guardClinicalCreate(() => setShowCreatePatientModal(true))}
            addButtonTitle="Create new patient"
          >
            <PatientList refreshKey={patientRefreshKey} />
          </DashboardCard>
        </div>
        {showCreatePatientModal && (
          <CreatePatientModal
            onClose={() => setShowCreatePatientModal(false)}
            onSuccess={(patientName) => {
              setShowCreatePatientModal(false)
              setPatientRefreshKey((prev) => prev + 1)
              toast.success(`Patient ${patientName} created successfully`)
            }}
          />
        )}
      </div>
    )
  }

  // Show ADHD Assessments
  if (screen === 'adhd') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard
            title="ADHD Assessments"
            onAdd={() => guardClinicalCreate(() => setShowCreateADHDModal(true))}
            addButtonTitle="Create ADHD Assessment"
          >
            <ADHDAssessmentList
              patient={selectedPatient}
              refreshKey={adhdRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showCreateADHDModal && (
          <CreateADHDAssessmentModal
            patient={selectedPatient}
            defaultAdmission={activeAdmission || undefined}
            defaultVisit={activeVisit || undefined}
            onClose={() => setShowCreateADHDModal(false)}
            onSuccess={() => {
              setShowCreateADHDModal(false)
              setAdhdRefreshKey((prev) => prev + 1)
              toast.success('ADHD Assessment created successfully')
            }}
          />
        )}
      </div>
    )
  }

  // Show Depression Assessments
  if (screen === 'depression') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard
            title="Depression Assessments"
            onAdd={() => guardClinicalCreate(() => setShowCreateDepressionModal(true))}
            addButtonTitle="Create Depression Assessment"
          >
            <DepressionAssessmentList
              patient={selectedPatient}
              refreshKey={depressionRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showCreateDepressionModal && (
          <CreateDepressionAssessmentModal
            patient={selectedPatient}
            defaultAdmission={activeAdmission || undefined}
            defaultVisit={activeVisit || undefined}
            onClose={() => setShowCreateDepressionModal(false)}
            onSuccess={() => {
              setShowCreateDepressionModal(false)
              setDepressionRefreshKey((prev) => prev + 1)
              toast.success('Depression Assessment created successfully')
            }}
          />
        )}
      </div>
    )
  }

  // Show Mood Disorder Assessments
  if (screen === 'mood') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Mood Disorder Assessments" 
            onAdd={() => guardClinicalCreate(() => setShowCreateMoodModal(true))}
            addButtonTitle="Create Mood Disorder Assessment"
          >
            <MoodDisorderAssessmentList
              patient={selectedPatient}
              refreshKey={moodRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showCreateMoodModal && (
          <CreateMoodDisorderAssessmentModal
            patient={selectedPatient}
            defaultAdmission={activeAdmission || undefined}
            defaultVisit={activeVisit || undefined}
            onClose={() => setShowCreateMoodModal(false)}
            onSuccess={() => {
              setShowCreateMoodModal(false)
              setMoodRefreshKey((prev) => prev + 1)
              toast.success('Mood Disorder Assessment created successfully')
            }}
          />
        )}
      </div>
    )
  }

  // Show GAD7 Assessments
  if (screen === 'gad7') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="GAD7 Assessments" 
            onAdd={() => guardClinicalCreate(() => setShowCreateGAD7Modal(true))}
            addButtonTitle="Create GAD7 Assessment"
          >
            <GAD7AssessmentList
              patient={selectedPatient}
              refreshKey={gad7RefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showCreateGAD7Modal && (
          <CreateGAD7AssessmentModal
            patient={selectedPatient}
            defaultAdmission={activeAdmission || undefined}
            defaultVisit={activeVisit || undefined}
            onClose={() => setShowCreateGAD7Modal(false)}
            onSuccess={() => {
              setShowCreateGAD7Modal(false)
              setGad7RefreshKey((prev) => prev + 1)
              toast.success('GAD7 Assessment created successfully')
            }}
          />
        )}
      </div>
    )
  }

  // Show PHQ9 Assessments
  if (screen === 'phq9') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard
            title="PHQ9 Assessments"
            onAdd={() => guardClinicalCreate(() => setShowCreatePHQ9Modal(true))}
            addButtonTitle="Create PHQ9 Assessment"
          >
            <PHQ9AssessmentList
              patient={selectedPatient}
              refreshKey={phq9RefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showCreatePHQ9Modal && (
          <CreatePHQ9AssessmentModal
            patient={selectedPatient}
            defaultAdmission={activeAdmission || undefined}
            defaultVisit={activeVisit || undefined}
            onClose={() => setShowCreatePHQ9Modal(false)}
            onSuccess={() => {
              setShowCreatePHQ9Modal(false)
              setPhq9RefreshKey((prev) => prev + 1)
              toast.success('PHQ9 Assessment created successfully')
            }}
          />
        )}
      </div>
    )
  }

  // Show Clinical Suicide Risk Assessments
  if (screen === 'clinical-suicide-risk') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Suicide Risk Assessments" 
            onAdd={() => guardClinicalCreate(() => setShowCreateSuicideRiskModal(true))}
            addButtonTitle="Create Suicide Risk Assessment"
          >
            <SuicideRiskAssessmentList
              patient={selectedPatient}
              refreshKey={suicideRiskRefreshKey}
            />
          </DashboardCard>
        </div>
        {showCreateSuicideRiskModal && (
          <CreateSuicideRiskAssessmentModal
            onClose={() => setShowCreateSuicideRiskModal(false)}
            onSuccess={() => {
              setShowCreateSuicideRiskModal(false)
              setSuicideRiskRefreshKey((prev) => prev + 1)
              toast.success('Suicide Risk Assessment created successfully')
            }}
          />
        )}
      </div>
    )
  }

  // Show Homicide Risk Assessments
  if (screen === 'homicide-risk') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard
            title="Homicide Risk Assessments"
            onAdd={() => guardClinicalCreate(() => setShowCreateHomicideRiskModal(true))}
            addButtonTitle="Create Homicide Risk Assessment"
          >
            <HomicideRiskAssessmentList
              patient={selectedPatient}
              refreshKey={homicideRiskRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showCreateHomicideRiskModal && (
          <CreateHomicideRiskAssessmentModal
            patient={selectedPatient}
            defaultAdmission={activeAdmission || undefined}
            defaultVisit={activeVisit || undefined}
            onClose={() => setShowCreateHomicideRiskModal(false)}
            onSuccess={() => {
              setShowCreateHomicideRiskModal(false)
              setHomicideRiskRefreshKey((prev) => prev + 1)
              toast.success('Homicide Risk Assessment created successfully')
            }}
          />
        )}
      </div>
    )
  }

  // Show YBOCS Assessments
  if (screen === 'ybocs') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard
            title="YBOCS Assessments"
            onAdd={() => guardClinicalCreate(() => setShowCreateYBOCSModal(true))}
            addButtonTitle="Create YBOCS Assessment"
          >
            <YBOCSAssessmentList
              patient={selectedPatient}
              refreshKey={ybocsRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showCreateYBOCSModal && (
          <CreateYBOCSAssessmentModal
            patient={selectedPatient}
            defaultAdmission={activeAdmission || undefined}
            defaultVisit={activeVisit || undefined}
            onClose={() => setShowCreateYBOCSModal(false)}
            onSuccess={() => {
              setShowCreateYBOCSModal(false)
              setYbocsRefreshKey((prev) => prev + 1)
              toast.success('YBOCS Assessment created successfully')
            }}
          />
        )}
      </div>
    )
  }

  // Show YMRS Assessments
  if (screen === 'ymrs') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="YMRS Assessments" 
            onAdd={() => guardClinicalCreate(() => setShowCreateYMRSModal(true))}
            addButtonTitle="Create YMRS Assessment"
          >
            <YMRSAssessmentList
              patient={selectedPatient}
              refreshKey={ymrsRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showCreateYMRSModal && (
          <CreateYMRSAssessmentModal
            patient={selectedPatient}
            defaultAdmission={activeAdmission || undefined}
            defaultVisit={activeVisit || undefined}
            onClose={() => setShowCreateYMRSModal(false)}
            onSuccess={() => {
              setShowCreateYMRSModal(false)
              setYmrsRefreshKey((prev) => prev + 1)
              toast.success('YMRS Assessment created successfully')
            }}
          />
        )}
      </div>
    )
  }

  // Show PANSS Assessments
  if (screen === 'panss') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard
            title="PANSS Assessments"
            noHeightLimit
            onAdd={() => guardClinicalCreate(() => setShowCreatePANSSModal(true))}
            addButtonTitle="Create PANSS Assessment"
          >
            <PANSSAssessmentList
              patient={selectedPatient}
              refreshKey={panssRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showCreatePANSSModal && (
          <CreatePANSSAssessmentModal
            patient={selectedPatient}
            defaultAdmission={activeAdmission || undefined}
            defaultVisit={activeVisit || undefined}
            onClose={() => setShowCreatePANSSModal(false)}
            onSuccess={() => {
              setShowCreatePANSSModal(false)
              setPanssRefreshKey((prev) => prev + 1)
              toast.success('PANSS Assessment created successfully')
            }}
          />
        )}
      </div>
    )
  }

  // Show Current Prescription
  if (screen === 'single-prescription') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard title="Current Prescription" filterable={false} noHeightLimit>
            <RxPage />
          </DashboardCard>
        </div>
      </div>
    )
  }

  const doctorAppointmentsCard = (
    <AppointmentsCard
      doctorScheduleMode
      listingScreen="appointments"
      patient={selectedPatient || undefined}
      onPatientSelect={handlePatientSelect}
      onOpenVisitInHeader={returnToDoctorHome}
    />
  )

  return (
  <div className="flex flex-col">
    <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />

    {/* Fixed single column — every card keeps its place; data follows the top
        filters (branch → OP/IP → visit/admission → selected patient). */}
    <div className="flex flex-col gap-4 p-4">
      {doctorAppointmentsCard}

      <OutpatientVisitsCard
        listingScreen="pvh"
        patient={selectedPatient || undefined}
        onPatientSelect={handlePatientSelect}
        onVisitActivate={handleVisitActivate}
      />

      <InpatientAdmissionsCard
        listingScreen="admission"
        patient={selectedPatient || undefined}
        onPatientSelect={handlePatientSelect}
        onAdmissionActivate={handleAdmissionActivate}
      />

      <DashboardCard
        fixedHeight
        title="Warnings & Messages"
        onAdd={() => guardClinicalCreate(() => setShowWarningModal(true))}
        addButtonTitle="Add Warning / Message"
        listingScreen="warn"
      >
        <WarningMessagesList
          patient={selectedPatient || undefined}
          noPatientScope="all"
          key={warningRefreshKey}
          onPatientClick={handlePatientSelect}
        />
      </DashboardCard>

      {/* Laboratory — one card, two tabs: Reports (results pending review) and
          Requests (lab orders). Merges the original report card with the newer
          lab-requests card. */}
      <DashboardCard
        fixedHeight
        title={labCardTab === 'reports' ? 'Lab Test Report - Pending for Review' : 'Lab Requests'}
        onAdd={() =>
          guardClinicalCreate(() =>
            labCardTab === 'reports' ? setShowLabTestModal(true) : setShowServiceRequestModal(true)
          )
        }
        addButtonTitle={labCardTab === 'reports' ? 'Add Lab Test Report' : 'Add Lab Request'}
        listingScreen={labCardTab === 'reports' ? 'lab' : 'lab-req'}
        headerExtra={
          <div className="flex items-center gap-1.5">
            <div className="flex rounded-md border border-slate-300 bg-white p-0.5 text-xs font-semibold">
              {([
                ['reports', 'REPORTS'],
                ['requests', 'REQUESTS'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLabCardTab(id)}
                  className={`rounded px-2 py-0.5 transition-colors ${
                    labCardTab === id ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {labCardTab === 'reports' && selectedPatient ? (
              <button
                type="button"
                onClick={() => setShowLabTrends(true)}
                className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5"
                title="Lab results over time — dates in columns, tests in rows"
              >
                📈 Lab Trends
              </button>
            ) : null}
          </div>
        }
      >
        {labCardTab === 'reports' ? (
          <LabTestList
            patient={selectedPatient || undefined}
            defaultStatus="Pending Review"
            doctorLabDefaults
            key={labTestRefreshKey}
            onPatientClick={handlePatientSelect}
          />
        ) : (
          <ServiceRequestList
            patient={selectedPatient || undefined}
            refreshKey={serviceRequestRefreshKey}
            template_dt="Lab Test Template"
            onPatientClick={handlePatientSelect}
          />
        )}
      </DashboardCard>

      <DashboardCard
        fixedHeight
        title="Prescription"
        onAdd={() => guardClinicalCreate(() => setShowPrescriptionModal(true))}
        addButtonTitle="Create Prescription"
        listingScreen="rx"
      >
        <PrescriptionList
          patient={selectedPatient || undefined}
          doctorPrescriptionDefaults
          refreshKey={prescriptionRefreshKey}
          onPatientClick={handlePatientSelect}
        />
      </DashboardCard>
    </div>

    {/* Modals */}
    {showPrescriptionModal && (
      <CreatePrescriptionModal
        onClose={() => setShowPrescriptionModal(false)}
        onSuccess={() => {
          setPrescriptionRefreshKey((prev) => prev + 1)
          setShowPrescriptionModal(false)
        }}
        initialPatient={selectedPatient}
      />
    )}

    {showWarningModal && (
      <CreateWarningMessageModal
        onClose={() => setShowWarningModal(false)}
        onSuccess={() => {
          setWarningRefreshKey(prev => prev + 1)
          setShowWarningModal(false)
        }}
        initialPatient={selectedPatient}
      />
    )}

    {showLabTrends && (
      <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={() => setShowLabTrends(false)}>
        <div className="absolute inset-0 bg-primary/15 backdrop-blur-[2px]" />
        <div
          className="relative z-10 flex h-full w-full max-w-5xl flex-col border-l border-slate-200 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Lab Trends</p>
              <p className="text-sm font-semibold text-slate-900">Results over time — dates in columns, tests in rows</p>
            </div>
            <button
              type="button"
              onClick={() => setShowLabTrends(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <LabTestHistory patientId={selectedPatient || undefined} onPatientChange={handlePatientSelect} />
          </div>
        </div>
      </div>
    )}

    {showLabTestModal && (
      <CreateLabRequestModal
        onClose={() => setShowLabTestModal(false)}
        onSuccess={() => {
          setLabTestRefreshKey(prev => prev + 1)
          setShowLabTestModal(false)
          toast.success('Lab request created successfully')
        }}
        initialPatient={selectedPatient}
      />
    )}

    {showDoctorProgressNoteModal && selectedPatient && (
      <CreateClinicalNoteModal
        onClose={() => setShowDoctorProgressNoteModal(false)}
        onSuccess={() => {
          setDoctorProgressNoteRefreshKey(prev => prev + 1)
          setShowDoctorProgressNoteModal(false)
        }}
        initialPatient={selectedPatient}
        defaultClinicalNoteType="Doctor Progress Note"
        title="Add Patient Progress Note"
      />
    )}

    {showDoctorMedicationPlanModal && selectedPatient && (
      <CreateDoctorMedicationPlanModal
        onClose={() => setShowDoctorMedicationPlanModal(false)}
        onSuccess={() => {
          setDoctorMedicationPlanRefreshKey((prev) => prev + 1)
          setShowDoctorMedicationPlanModal(false)
        }}
        initialPatient={selectedPatient}
      />
    )}

    {showDiagnosisModal && selectedPatient && (
      <PatientDiagnosisModal
        parentDoctype={mode === 'IP' ? 'Inpatient Admission' : 'Patient Visit'}
        parentName={mode === 'IP' ? (activeAdmission ?? undefined) : (activeVisit ?? undefined)}
        patient={selectedPatient}
        patientName={undefined}
        onClose={() => setShowDiagnosisModal(false)}
        onSuccess={() => {
          setDiagnosisRefreshKey((prev) => prev + 1)
          setShowDiagnosisModal(false)
        }}
      />
    )}

    {showServiceRequestModal && (
      <CreateServiceRequestModal
        onClose={() => setShowServiceRequestModal(false)}
        onSuccess={() => {
          setServiceRequestRefreshKey(prev => prev + 1)
          setShowServiceRequestModal(false)
          toast.success('Lab request created successfully')
        }}
        initialPatient={selectedPatient}
        labTestTemplateOnly
      />
    )}

    {showAppointmentModal && (
      <CreateAppointmentModal
        onClose={() => setShowAppointmentModal(false)}
        onSuccess={() => {
          setAppointmentRefreshKey(prev => prev + 1)
          setShowAppointmentModal(false)
        }}
        initialPatient={selectedPatient}
      />
    )}

    {showCreateSuicideRiskModal && (
      <CreateSuicideRiskAssessmentModal
        patient={selectedPatient}
        defaultAdmission={mode === 'IP' ? activeAdmission || undefined : undefined}
        defaultVisit={mode === 'OP' ? activeVisit || undefined : undefined}
        onClose={() => setShowCreateSuicideRiskModal(false)}
        onSuccess={() => {
          setShowCreateSuicideRiskModal(false)
          setSuicideRiskRefreshKey((prev) => prev + 1)
          toast.success('Suicide Risk Assessment created successfully')
        }}
      />
    )}

    {showPatientHistoryModal && (
      <PatientHistoryModal
        admissionNo={mode === 'IP' ? activeAdmission || '' : ''}
        patient={selectedPatient}
        onClose={() => setShowPatientHistoryModal(false)}
        onSuccess={async () => {
          setPatientHistoryRefreshKey((prev) => prev + 1)
          setShowPatientHistoryModal(false)
          await continueIpRequiredDocsAfterHistoryForm()
        }}
      />
    )}

    {showCreateMedicalHistoryModal && selectedPatient && (
      <CreatePatientMedicalHistoryModal
        patient={selectedPatient}
        defaultAdmission={activeAdmission || undefined}
        onClose={() => setShowCreateMedicalHistoryModal(false)}
        onCreated={async () => {
          setMedicalHistoryRefreshKey((prev) => prev + 1)
          setShowCreateMedicalHistoryModal(false)
          await continueIpRequiredDocsAfterPmh()
        }}
      />
    )}
  </div>
)
}