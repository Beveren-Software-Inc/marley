import { useEffect, useLayoutEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ADHDAssessmentList } from '../components/adhd/AdhdAssessmentList'
import { CreateADHDAssessmentModal } from '../components/adhd/CreateADHDAssessmentModal'
import { AdmissionList } from '../components/admissions/AdmissionList'
import { DischargeAdmissionView } from '../components/admissions/DischargeAdmissionView'
import { SuicidalPatientAssessmentModal } from '../components/admissions/SuicidalPatientAssessmentModal'
import { AppointmentList } from '../components/appointments/AppointmentList'
import { CreateAppointmentModal } from '../components/appointments/CreateAppointmentModal'
import { ClinicalNotesList } from '../components/clinicalNotes/ClinicalNotesList'
import { CreateClinicalNoteModal } from '../components/clinicalNotes/CreateClinicalNoteModal'
import { CreateDoctorMedicationPlanModal } from '../components/doctorMedicationPlan/CreateDoctorMedicationPlanModal'
import { DoctorMedicationPlanList } from '../components/doctorMedicationPlan/DoctorMedicationPlanList'
import { SuicideRiskAssessmentList } from '../components/clinicalSuicide/ClinicalSuicideRiskAssessmentList'
import { CreateSuicideRiskAssessmentModal } from '../components/clinicalSuicide/CreateClinicalSuicideRiskAssessmentModal'
import { CreateDepressionAssessmentModal } from '../components/depression/CreateDepressionAssessmentModal'
import { DepressionAssessmentList } from '../components/depression/DepressionAssessmentList'
import { DiagnosisSymptomsScreen } from '../components/diagnosis/DiagnosisSymptomsScreen'
import { PatientDiagnosisList } from '../components/diagnosis/PatientDiagnosisList'
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
import { MedicalHistoryView } from '../components/medicalHistory/MedicalHistoryView'
import { CreateMedicineGivenModal } from '../components/medication/CreateMedicineGivenModal'
import { LongActingMedicineList } from '../components/medication/LongActingMedicineList'
import { MedicineGivenList } from '../components/medication/MedicineGivenList'
import { ReceptionLongActingMedicineList } from '../components/medication/ReceptionLongActingMedicineList'
import { CreateMoodDisorderAssessmentModal } from '../components/mood_disorder/CreateMoodDisorderAssessmentModal'
import { MoodDisorderAssessmentList } from '../components/mood_disorder/MoodDisorderAssessmentList'
import { MorseFallScaleList } from '../components/morse/MorseFallScaleList'
import { NotificationBell } from '../components/notifications/NotificationBell'
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
import { ClosedCareEpisodeBanner } from '../components/ui/ClosedCareEpisodeBanner'
import { PatientSummaryCard } from '../components/patients/PatientSummaryCard'
import { CreatePatientVisitModal } from '../components/patientVisits/CreatePatientVisitModal'
import { PatientVisitList } from '../components/patientVisits/PatientVisitList'
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
import { UserMenu } from '../components/user/UserMenu'
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
import { useCareContext } from '../providers/CareContextProvider'
import { CreatePatientMedicalHistoryModal } from '../components/medicalHistory/CreatePatientMedicalHistoryModal'
import { isDoctorScreenBlocked } from '../config/costCenterCareScope'
import { draftSavedAt, hasDischargeDraft } from '../services/dischargeDraft'
import { getPatientActiveAdmission } from '../services/inpatientRecords'
import { navigateToDischarge } from '../utils/dischargeNavigation'
import { AdmissionPage } from './Admission'
import { PatientVisitPage } from './PatientVisit'

import { DashboardCard } from '../components/ui/DashboardCard'
import { PortalTopBar } from '../components/layout/PortalTopBar'

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
  } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const patientFromUrl = searchParams.get('patient')
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(() => patientFromUrl || globalPatient || undefined)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [showLabTestModal, setShowLabTestModal] = useState(false)
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
  const [diagnosisRefreshKey, setDiagnosisRefreshKey] = useState(0)
  const [doctorProgressNoteRefreshKey, setDoctorProgressNoteRefreshKey] = useState(0)
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
  const [doctorMedicationPlanRefreshKey, setDoctorMedicationPlanRefreshKey] = useState(0)
  const [showPsychologistNoteModal, setShowPsychologistNoteModal] = useState(false)
  const [showVitalSignModal, setShowVitalSignModal] = useState(false)
  const [vitalSignsRefreshKey, setVitalSignsRefreshKey] = useState(0)
  const [showSleepingPatternModal, setShowSleepingPatternModal] = useState(false)
  const [sleepingPatternRefreshKey, setSleepingPatternRefreshKey] = useState(0)
  const [morseFallRefreshKey] = useState(0)
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
  const screenBlocked = !!(rawScreen && isDoctorScreenBlocked(rawScreen, costCenterCareScope, mode))
  const screen = screenBlocked ? null : rawScreen
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
  const [showCreateVisitModal, setShowCreateVisitModal] = useState(false)

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
    if (patientParam && patientParam !== selectedPatient) {
      setSelectedPatient(patientParam)
    } else if (!patientParam && selectedPatient) {
      // Only clear if URL doesn't have patient param
      // Don't clear if we're just initializing
    }
  }, [searchParams])

  // Ensure patient param is preserved when navigating to OP Visit or Admission screens
  useEffect(() => {
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
    if (!rawScreen || !isDoctorScreenBlocked(rawScreen, costCenterCareScope, mode)) return
    const np = new URLSearchParams(searchParams)
    np.delete('screen')
    setSearchParams(np, { replace: true })
  }, [rawScreen, costCenterCareScope, mode, searchParams, setSearchParams])

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
      setDischargeHasDraft(hasDischargeDraft(admission.name))
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
      .then((admission) => {
        if (admission && hasDischargeDraft(admission.name)) {
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

  const closeDischarge = () => {
    const state = location.state as { returnTo?: string } | null
    if (state?.returnTo) {
      navigate(state.returnTo, { replace: true })
      return
    }
    const np = new URLSearchParams(searchParams)
    np.delete('discharge')
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
    np.delete('discharge')
    setSearchParams(np, { replace: true, state: { dischargeCompleted: true } })
  }

  // Discharge workflow — keep portal top bar; form fills content area only
  if (dischargeAdmission && mode !== 'OP') {
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
  if (screen === 'admission' && mode !== 'OP') {
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
            onAdd={() => guardClinicalCreate(() => setShowSuicidalModal(true))}
            addButtonTitle="Add Suicidal Assessment"
          >
            <SuicidalAssessmentList
              patient={selectedPatient}
              admission={activeAdmission}
              onAddNew={() => guardClinicalCreate(() => setShowSuicidalModal(true))}
              key={suicidalRefreshKey}
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
              medicalRole="Doctor"
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

  // Show Doctor Progress Note
  if (screen === 'dpn') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Doctor Progress Notes" 
            onAdd={() => guardClinicalCreate(() => setShowDoctorProgressNoteModal(true))}
            addButtonTitle="Add Doctor Progress Note"
          >
            <ClinicalNotesList 
              patient={selectedPatient} 
              medicalRole="Doctor"
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
            title="Add Doctor Progress Note"
          />
        )}
      </div>
    )
  }

  // Show Doctors Order
  if (screen === 'dos') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Doctors Order" 
            onAdd={() => guardClinicalCreate(() => setShowDoctorOrderModal(true))}
            addButtonTitle="Add Doctors Order"
          >
            <ClinicalNotesList 
              patient={selectedPatient}
              medicalRole="Doctor"
              clinicalNoteType="Doctors Order"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showDoctorOrderModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowDoctorOrderModal(false)}
            onSuccess={() => {
              setClinicalNotesRefreshKey(prev => prev + 1)
              setShowDoctorOrderModal(false)
            }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Doctors Order"
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
            addButtonTitle="Add Service Request"
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
              toast.success('Service request created successfully')
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
            <LabTestList patient={selectedPatient} defaultStatus="Pending Review" key={labTestRefreshKey} onPatientClick={handlePatientSelect} />
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
              medicalRole="Psychologist"
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
              medicalRole="Psychologist"
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
              medicalRole="Physiotherapist"
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

  // Show Nursing Notes
  if (screen === 'nurse') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Nursing Note" 
            onAdd={() => guardClinicalCreate(() => setShowNursingNoteModal(true))}
            addButtonTitle="Add Nursing Note"
          >
            <ClinicalNotesList 
              patient={selectedPatient} 
              medicalRole="Nurse"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showNursingNoteModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowNursingNoteModal(false)}
            onSuccess={() => {
              setClinicalNotesRefreshKey(prev => prev + 1)
              setShowNursingNoteModal(false)
            }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Nursing Note"
            title="Add Nursing Note"
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
            <NurseTaskList patient={selectedPatient} />
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
            title="Observation" 
            onAdd={() => guardClinicalCreate(() => setShowObservationModal(true))}
            addButtonTitle="Add Observation"
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
            <MorseFallScaleList patient={selectedPatient} refreshKey={morseFallRefreshKey} onPatientClick={handlePatientSelect} />
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
          <DashboardCard title="Environmental Checklist">
            <EnvironmentalChecklistList patient={selectedPatient} />
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
              <IOPEnrollmentListWithHeader refreshKey={appointmentRefreshKey} />
            </DashboardCard>
          </div>
        </div>
        {showBulkScheduleModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Bulk Schedule</h2>
                <button
                  onClick={() => setShowBulkScheduleModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-slate-500">Bulk Schedule modal coming soon.</p>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setShowBulkScheduleModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
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
            <h2 className="text-xl font-semibold text-slate-900">Long Acting Medicine</h2>
            <p className="text-sm text-slate-600 mt-1">
              View long acting medicines for the selected patient. Filter by start date and frequency. Click a row for details.
            </p>
          </div>
          <DashboardCard title="Long Acting Medicines">
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
          <DashboardCard
            title="Appointments"
            onAdd={() => guardClinicalCreate(() => setShowAppointmentModal(true))}
            addButtonTitle="Add Appointment"
            noHeightLimit
          >
            <AppointmentList
              doctorScheduleMode={!selectedPatient}
              showAll={!!selectedPatient}
              patient={selectedPatient || undefined}
              refreshKey={appointmentRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showAppointmentModal && (
          <CreateAppointmentModal
            onClose={() => setShowAppointmentModal(false)}
            onSuccess={() => {
              setAppointmentRefreshKey((prev) => prev + 1)
              setShowAppointmentModal(false)
            }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  // Show Patient Visit History
  if (screen === 'pvh') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard
            title="Patient Visit History"
            onAdd={() => setShowCreateVisitModal(true)}
            addButtonTitle="Create Patient Visit"
            allowCreateOnClosedEpisode
          >
            <PatientVisitList patient={selectedPatient} onPatientFromVisit={handlePatientSelect} />
          </DashboardCard>
        </div>
      </div>
    )
  }

  // Show Warning Messages full view
  if (screen === 'warn') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard 
            title="Warnings & Allergies" 
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
              medicalRole="Nutritionist"
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

  // Show Diagnoses (Patient Diagnosis on active OP visit / IP admission)
  if (screen === 'dx') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <DiagnosisSymptomsScreen
          selectedPatient={selectedPatient || ''}
          onPatientSelect={handlePatientSelect}
        />
      </div>
    )
  }

  // Show Discharge Form — hidden in OP mode
  if (screen === 'df' && mode !== 'OP') {
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
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold truncate">ADHD Assessments</h1>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <ClosedCareEpisodeBanner />
        <div className="p-4">
          <DashboardCard 
            title="ADHD Assessments" 
            onAdd={() => guardClinicalCreate(() => setShowCreateADHDModal(true))}
            addButtonTitle="Create ADHD Assessment"
          >
            <ADHDAssessmentList
              refreshKey={adhdRefreshKey}
              onCreateNew={() => setShowCreateADHDModal(true)}
            />
          </DashboardCard>
        </div>
        {showCreateADHDModal && (
          <CreateADHDAssessmentModal
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
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold truncate">Depression Assessments</h1>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <ClosedCareEpisodeBanner />
        <div className="p-4">
          <DashboardCard 
            title="Depression Assessments" 
            onAdd={() => guardClinicalCreate(() => setShowCreateDepressionModal(true))}
            addButtonTitle="Create Depression Assessment"
          >
            <DepressionAssessmentList
              refreshKey={depressionRefreshKey}
              onCreateNew={() => setShowCreateDepressionModal(true)}
            />
          </DashboardCard>
        </div>
        {showCreateDepressionModal && (
          <CreateDepressionAssessmentModal
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
              refreshKey={moodRefreshKey}
              onCreateNew={() => setShowCreateMoodModal(true)}
            />
          </DashboardCard>
        </div>
        {showCreateMoodModal && (
          <CreateMoodDisorderAssessmentModal
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
              refreshKey={gad7RefreshKey}
              onCreateNew={() => setShowCreateGAD7Modal(true)}
            />
          </DashboardCard>
        </div>
        {showCreateGAD7Modal && (
          <CreateGAD7AssessmentModal
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
              refreshKey={phq9RefreshKey}
              onCreateNew={() => setShowCreatePHQ9Modal(true)}
            />
          </DashboardCard>
        </div>
        {showCreatePHQ9Modal && (
          <CreatePHQ9AssessmentModal
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
            <SuicideRiskAssessmentList refreshKey={suicideRiskRefreshKey} />
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
              refreshKey={homicideRiskRefreshKey}
              onCreateNew={() => setShowCreateHomicideRiskModal(true)}
            />
          </DashboardCard>
        </div>
        {showCreateHomicideRiskModal && (
          <CreateHomicideRiskAssessmentModal
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
              refreshKey={ybocsRefreshKey}
              onCreateNew={() => setShowCreateYBOCSModal(true)}
            />
          </DashboardCard>
        </div>
        {showCreateYBOCSModal && (
          <CreateYBOCSAssessmentModal
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
              refreshKey={ymrsRefreshKey}
              onCreateNew={() => setShowCreateYMRSModal(true)}
            />
          </DashboardCard>
        </div>
        {showCreateYMRSModal && (
          <CreateYMRSAssessmentModal
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
            onAdd={() => guardClinicalCreate(() => setShowCreatePANSSModal(true))}
            addButtonTitle="Create PANSS Assessment"
          >
            <PANSSAssessmentList
              refreshKey={panssRefreshKey}
              onCreateNew={() => setShowCreatePANSSModal(true)}
            />
          </DashboardCard>
        </div>
        {showCreatePANSSModal && (
          <CreatePANSSAssessmentModal
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

  // Main Dashboard View — neither OP/IP: appointments only; OP/IP selected: list on top, appointments below
  const showOpIpListStrip =
    (mode === 'OP' && !activeVisit) ||
    (costCenterCareScope !== 'op_only' && mode === 'IP' && !activeAdmission)

  const showAppointmentsOnlyStrip =
    !selectedPatient &&
    !showOpIpListStrip &&
    (mode === null ||
      (mode === 'OP' && !!activeVisit) ||
      (mode === 'IP' && !!activeAdmission))

  const doctorAppointmentsCard = (
    <DashboardCard
      fixedHeight
      title="Appointments"
      onAdd={() => guardClinicalCreate(() => setShowAppointmentModal(true))}
      addButtonTitle="Add Appointment"
      listingScreen="appointments"
    >
      <AppointmentList
        compact
        doctorScheduleMode={!selectedPatient}
        showAll={!!selectedPatient}
        patient={selectedPatient || undefined}
        refreshKey={appointmentRefreshKey}
        onPatientClick={handlePatientSelect}
      />
    </DashboardCard>
  )

  /** OP patient + specific visit: Diagnosis|Plan → Labs → Rx|Long acting */
  const opVisitDashboardLayout = mode === 'OP' && !!activeVisit
  /** OP patient chosen but no visit yet: Prescription + Patient Information on one row */
  const opPatientNoVisitLayout = mode === 'OP' && !!selectedPatient && !activeVisit
  /** IP patient chosen but no admission yet: Appointments + Admissions on one row */
  const ipPatientNoAdmissionLayout =
    costCenterCareScope !== 'op_only' && mode === 'IP' && !!selectedPatient && !activeAdmission

  return (
  <div className="flex flex-col">
    <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />

    {/* No OP/IP: appointments only; OP/IP selected: appointments + list side by side */}
    {showAppointmentsOnlyStrip ? (
      <div className="px-4 pt-4 pb-0">{doctorAppointmentsCard}</div>
    ) : null}

    {showOpIpListStrip && !selectedPatient ? (
      <div className="px-4 pt-4 pb-0 grid gap-4 md:grid-cols-2 auto-rows-fr">
        {doctorAppointmentsCard}
        <DashboardCard
          fixedHeight
          title={mode === 'OP' ? 'Patient Visits (OP)' : 'Inpatient Admissions (IP)'}
          onAdd={mode === 'OP' ? () => setShowCreateVisitModal(true) : undefined}
          addButtonTitle="Create Patient Visit"
          listingScreen={mode === 'OP' ? 'pvh' : 'admission'}
          allowCreateOnClosedEpisode={mode === 'OP'}
        >
          {mode === 'OP' ? (
            <PatientVisitList
              patient={undefined}
              onPatientFromVisit={(p) => {
                setSelectedPatient(p)
                const sp = new URLSearchParams(searchParams)
                sp.set('patient', p)
                setSearchParams(sp, { replace: true })
              }}
            />
          ) : (
            <AdmissionList
              patient={undefined}
              onPatientFromAdmission={(p) => {
                setSelectedPatient(p)
                const sp = new URLSearchParams(searchParams)
                sp.set('patient', p)
                setSearchParams(sp, { replace: true })
              }}
            />
          )}
        </DashboardCard>
      </div>
    ) : null}

    {selectedPatient ? (
      <>
        {/* IP patient, no admission yet: pick admission first — Appointments | Admissions */}
        {ipPatientNoAdmissionLayout ? (
          <div className="grid gap-4 md:grid-cols-2 auto-rows-fr p-4 pb-0">
            {doctorAppointmentsCard}
            <DashboardCard
              fixedHeight
              title="Inpatient Admissions (IP)"
              onAdd={undefined}
              listingScreen="admission"
            >
              <AdmissionList
                patient={selectedPatient}
                onPatientFromAdmission={(p) => {
                  setSelectedPatient(p)
                  const sp = new URLSearchParams(searchParams)
                  sp.set('patient', p)
                  setSearchParams(sp, { replace: true })
                }}
              />
            </DashboardCard>
          </div>
        ) : null}

        {/* OP patient, no visit yet: Appointments | Patient Visits first */}
        {costCenterCareScope !== 'ip_only' && mode === 'OP' && !activeVisit ? (
          <div className="grid gap-4 md:grid-cols-2 auto-rows-fr px-4 pb-4">
            {doctorAppointmentsCard}
            <DashboardCard
              fixedHeight
              title="Patient Visits (OP)"
              onAdd={() => setShowCreateVisitModal(true)}
              addButtonTitle="Create Patient Visit"
              listingScreen="pvh"
              allowCreateOnClosedEpisode
            >
              <PatientVisitList patient={selectedPatient} onPatientFromVisit={handlePatientSelect} />
            </DashboardCard>
          </div>
        ) : null}

        {/* Warnings + medical history */}
        <div className="grid gap-4 md:grid-cols-2 auto-rows-fr p-4">
          <DashboardCard
            fixedHeight
            title="Warnings & Allergies"
            onAdd={() => guardClinicalCreate(() => setShowWarningModal(true))}
            addButtonTitle="Add Warning Message"
            listingScreen="warn"
          >
            <WarningMessagesList patient={selectedPatient} key={warningRefreshKey} onPatientClick={handlePatientSelect} />
          </DashboardCard>

          <DashboardCard
            fixedHeight
            title="Past Medical History"
            onAdd={() => guardClinicalCreate(() => setShowCreateMedicalHistoryModal(true))}
            addButtonTitle="Add Past Medical History"
            listingScreen="mh"
            requiresAttention={pmhRequiresAttention}
            attentionLabel={pmhAttentionLabel}
          >
            <MedicalHistoryView patient={selectedPatient} refreshKey={medicalHistoryRefreshKey} />
          </DashboardCard>
        </div>

        {/* Row 2: IP only — Suicide risk assessment + History form */}
        {mode === 'IP' && (
        <div className="grid gap-4 md:grid-cols-2 auto-rows-fr px-4 pb-4">
          <DashboardCard
            fixedHeight
            title="Suicide Risk Assessment"
            onAdd={() => guardClinicalCreate(() => setShowCreateSuicideRiskModal(true))}
            addButtonTitle="Create Suicide Risk Assessment"
            listingScreen="clinical-suicide-risk"
            requiresAttention={showIpRequiredDocs && ipDocStatus !== null && !ipDocStatus.suicide_risk}
            attentionLabel="Required for this IP admission — complete suicide risk assessment"
          >
            <SuicideRiskAssessmentList
              patient={selectedPatient}
              inpatientAdmission={activeAdmission || undefined}
              refreshKey={suicideRiskRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>

          <DashboardCard
            fixedHeight
            title="History Form"
            onAdd={() => guardClinicalCreate(() => setShowPatientHistoryModal(true))}
            addButtonTitle="New History Form"
            listingScreen="patient-history"
            requiresAttention={showIpRequiredDocs && ipDocStatus !== null && !ipDocStatus.history_form}
            attentionLabel="Required for this IP admission — complete history form"
          >
            <PatientHistoryList
              patient={selectedPatient}
              inpatientAdmission={activeAdmission || undefined}
              refreshKey={patientHistoryRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        )}

        {/* OP with visit selected: Appointments + visits (choose/switch visit) */}
        {costCenterCareScope !== 'ip_only' && mode === 'OP' && !!activeVisit ? (
          <div className="grid gap-4 md:grid-cols-2 auto-rows-fr px-4 pb-4">
            {doctorAppointmentsCard}
            <DashboardCard
              fixedHeight
              title="Patient Visits (OP)"
              onAdd={() => setShowCreateVisitModal(true)}
              addButtonTitle="Create Patient Visit"
              listingScreen="pvh"
              allowCreateOnClosedEpisode
            >
              <PatientVisitList patient={selectedPatient} onPatientFromVisit={handlePatientSelect} />
            </DashboardCard>
          </div>
        ) : null}

        {mode === null && costCenterCareScope !== 'ip_only' ? (
          <div className="px-4 pb-4">{doctorAppointmentsCard}</div>
        ) : null}

        {opVisitDashboardLayout ? (
          <>
            {/* OP + visit: Diagnosis | Doctor's Plan */}
            <div className="grid gap-4 md:grid-cols-2 auto-rows-fr px-4 pb-4">
              <DashboardCard
                fixedHeight
                title="Diagnosis Detail"
                onAdd={() => guardClinicalCreate(() => setShowDiagnosisModal(true))}
                addButtonTitle="Add / Edit Diagnosis"
                listingScreen="dx"
              >
                <PatientDiagnosisList patient={selectedPatient} refreshKey={diagnosisRefreshKey} />
              </DashboardCard>

              <DashboardCard
                fixedHeight
                title="Doctor's Plan"
                onAdd={() => guardClinicalCreate(() => setShowDoctorMedicationPlanModal(true))}
                addButtonTitle="Add Doctor's Plan"
              >
                <DoctorMedicationPlanList patient={selectedPatient} key={doctorMedicationPlanRefreshKey} />
              </DashboardCard>
            </div>

            {/* Lab Requests | Lab Test Reports */}
            <div className="grid gap-4 md:grid-cols-2 auto-rows-fr px-4 pb-4">
              <DashboardCard
                fixedHeight
                title="Lab Requests"
                onAdd={() => guardClinicalCreate(() => setShowServiceRequestModal(true))}
                addButtonTitle="Add Service Request"
                listingScreen="lab-req"
              >
                <ServiceRequestList
                  patient={selectedPatient}
                  refreshKey={serviceRequestRefreshKey}
                  template_dt="Lab Test Template"
                  onPatientClick={handlePatientSelect}
                />
              </DashboardCard>

              <DashboardCard
                fixedHeight
                title="Lab Test Reports"
                onAdd={() => guardClinicalCreate(() => setShowLabTestModal(true))}
                addButtonTitle="Add Lab Test Report"
                listingScreen="lab"
              >
                <LabTestList
                  patient={selectedPatient}
                  defaultStatus="Pending Review"
                  key={labTestRefreshKey}
                  onPatientClick={handlePatientSelect}
                />
              </DashboardCard>
            </div>

            {/* Prescription | Long Acting Medicine */}
            <div className="grid gap-4 md:grid-cols-2 auto-rows-fr px-4 pb-4">
              <DashboardCard
                fixedHeight
                title="Prescription"
                onAdd={() => guardClinicalCreate(() => setShowPrescriptionModal(true))}
                addButtonTitle="Create Prescription"
                listingScreen="rx"
              >
                <PrescriptionList
                  patient={selectedPatient}
                  doctorPrescriptionDefaults
                  refreshKey={prescriptionRefreshKey}
                  onPatientClick={handlePatientSelect}
                />
              </DashboardCard>

              <DashboardCard fixedHeight title="Long Acting Medicine" listingScreen="d-long-acting-meds">
                <LongActingMedicineList patient={selectedPatient} refreshKey={prescriptionRefreshKey} />
              </DashboardCard>
            </div>

            <div className="grid gap-4 md:grid-cols-2 auto-rows-fr px-4 pb-4">
              <DashboardCard
                fixedHeight
                title="Doctor Progress Notes"
                onAdd={() => guardClinicalCreate(() => setShowDoctorProgressNoteModal(true))}
                addButtonTitle="Add Doctor Progress Note"
                listingScreen="dpn"
              >
                <ClinicalNotesList
                  patient={selectedPatient}
                  medicalRole="Doctor"
                  clinicalNoteType="Doctor Progress Note"
                  key={doctorProgressNoteRefreshKey}
                  onPatientClick={handlePatientSelect}
                />
              </DashboardCard>

              <DashboardCard fixedHeight title="Patient Information">
                <PatientSummaryCard patient={selectedPatient} />
              </DashboardCard>
            </div>
          </>
        ) : (
          <>
            {/* Diagnosis (left) · Doctor Progress Notes (right) */}
            <div className="grid gap-4 md:grid-cols-2 auto-rows-fr px-4 pb-4">
              <DashboardCard
                fixedHeight
                title="Diagnosis Detail"
                onAdd={() => guardClinicalCreate(() => setShowDiagnosisModal(true))}
                addButtonTitle="Add / Edit Diagnosis"
                listingScreen="dx"
              >
                <PatientDiagnosisList patient={selectedPatient} refreshKey={diagnosisRefreshKey} />
              </DashboardCard>

              <DashboardCard
                fixedHeight
                title="Doctor Progress Notes"
                onAdd={() => guardClinicalCreate(() => setShowDoctorProgressNoteModal(true))}
                addButtonTitle="Add Doctor Progress Note"
                listingScreen="dpn"
              >
                <ClinicalNotesList
                  patient={selectedPatient}
                  medicalRole="Doctor"
                  clinicalNoteType="Doctor Progress Note"
                  key={doctorProgressNoteRefreshKey}
                  onPatientClick={handlePatientSelect}
                />
              </DashboardCard>
            </div>

            {/* Doctor's Plan + Long Acting (after Diagnosis/Notes, before Labs) */}
            <div
              className={`grid gap-4 px-4 pb-4 auto-rows-fr ${
                mode === 'OP' || costCenterCareScope !== 'op_only' ? 'md:grid-cols-2' : 'md:grid-cols-1'
              }`}
            >
              <DashboardCard
                fixedHeight
                title="Doctor's Plan"
                onAdd={() => guardClinicalCreate(() => setShowDoctorMedicationPlanModal(true))}
                addButtonTitle="Add Doctor's Plan"
              >
                <DoctorMedicationPlanList patient={selectedPatient} key={doctorMedicationPlanRefreshKey} />
              </DashboardCard>

              <DashboardCard fixedHeight title="Long Acting Medicine" listingScreen="d-long-acting-meds">
                <LongActingMedicineList patient={selectedPatient} refreshKey={prescriptionRefreshKey} />
              </DashboardCard>
            </div>

            {/* Labs */}
            <div className="grid gap-4 md:grid-cols-2 auto-rows-fr px-4 pb-4">
              <DashboardCard
                fixedHeight
                title="Lab Test Reports"
                onAdd={() => guardClinicalCreate(() => setShowLabTestModal(true))}
                addButtonTitle="Add Lab Test Report"
                listingScreen="lab"
              >
                <LabTestList
                  patient={selectedPatient}
                  defaultStatus="Pending Review"
                  key={labTestRefreshKey}
                  onPatientClick={handlePatientSelect}
                />
              </DashboardCard>

              <DashboardCard
                fixedHeight
                title="Lab Requests"
                onAdd={() => guardClinicalCreate(() => setShowServiceRequestModal(true))}
                addButtonTitle="Add Service Request"
                listingScreen="lab-req"
              >
                <ServiceRequestList
                  patient={selectedPatient}
                  refreshKey={serviceRequestRefreshKey}
                  template_dt="Lab Test Template"
                  onPatientClick={handlePatientSelect}
                />
              </DashboardCard>
            </div>

            {/* Prescriptions; IP+admission: share row with Appointments; OP no visit: Patient Info beside Rx */}
            <div
              className={`grid gap-4 auto-rows-fr px-4 pb-4 ${
                costCenterCareScope !== 'op_only' && mode === 'IP' && activeAdmission
                  ? 'md:grid-cols-2'
                  : opPatientNoVisitLayout
                    ? 'md:grid-cols-2'
                    : 'md:grid-cols-1'
              }`}
            >
              {costCenterCareScope !== 'op_only' && mode === 'IP' && activeAdmission
                ? doctorAppointmentsCard
                : null}
              <DashboardCard
                fixedHeight
                title="Prescription"
                onAdd={() => guardClinicalCreate(() => setShowPrescriptionModal(true))}
                addButtonTitle="Create Prescription"
                listingScreen="rx"
              >
                <PrescriptionList
                  patient={selectedPatient}
                  doctorPrescriptionDefaults
                  refreshKey={prescriptionRefreshKey}
                  onPatientClick={handlePatientSelect}
                />
              </DashboardCard>
              {opPatientNoVisitLayout && (
                <DashboardCard fixedHeight title="Patient Information" filterable={false}>
                  <PatientSummaryCard patient={selectedPatient} />
                </DashboardCard>
              )}
            </div>
          </>
        )}

        {/* Patient summary — IP / no OP visit context (OP+visit uses row above with progress notes) */}
        {!opVisitDashboardLayout && !opPatientNoVisitLayout && (
          <div className="px-4 pb-4">
            <DashboardCard fixedHeight title="Patient Information" filterable={false}>
              <PatientSummaryCard patient={selectedPatient} />
            </DashboardCard>
          </div>
        )}

        {/* Row 8: IP — Admissions & discharges */}
        {costCenterCareScope !== 'op_only' && mode === 'IP' && (
          <div className="px-4 pb-4">
            <DashboardCard fixedHeight title="Admission & Discharges" listingScreen="df">
              <DischargeList patient={selectedPatient} key={dischargeRefreshKey} onPatientClick={handlePatientSelect} />
            </DashboardCard>
          </div>
        )}
      </>
    ) : (
      // No patient selected view
      <>
        <div className="grid gap-4 md:grid-cols-2 auto-rows-fr p-4">
          <DashboardCard
            fixedHeight
            title="Facility notices"
            onAdd={() => guardClinicalCreate(() => setShowWarningModal(true))}
            addButtonTitle="Add organisation notice"
            listingScreen="warn"
          >
            <WarningMessagesList
              patient={undefined}
              noPatientScope="organisation"
              key={warningRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>

          <DashboardCard 
            fixedHeight
            title="Lab Test Reports Pending for Review" 
            onAdd={() => guardClinicalCreate(() => setShowLabTestModal(true))}
            addButtonTitle="Add Lab Test Report"
            listingScreen="lab"
          >
            <LabTestList defaultStatus="Pending Review" key={labTestRefreshKey} onPatientClick={handlePatientSelect} />
          </DashboardCard>
        </div>

        <div className="px-4 pb-4">
          <DashboardCard
            fixedHeight
            title="Prescription"
            onAdd={() => guardClinicalCreate(() => setShowPrescriptionModal(true))}
            addButtonTitle="Create Prescription"
            listingScreen="rx"
          >
            <PrescriptionList refreshKey={prescriptionRefreshKey} onPatientClick={handlePatientSelect} />
          </DashboardCard>
        </div>
      </>
    )}

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
        title="Add Doctor Progress Note"
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
          toast.success('Service request created successfully')
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

    {showCreateVisitModal && (
      <CreatePatientVisitModal
        onClose={() => setShowCreateVisitModal(false)}
        onSuccess={() => {
          setShowCreateVisitModal(false)
        }}
        initialPatient={selectedPatient || undefined}
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
        onSuccess={() => {
          setPatientHistoryRefreshKey((prev) => prev + 1)
          setShowPatientHistoryModal(false)
        }}
      />
    )}

    {showCreateMedicalHistoryModal && selectedPatient && (
      <CreatePatientMedicalHistoryModal
        patient={selectedPatient}
        defaultAdmission={activeAdmission || undefined}
        onClose={() => setShowCreateMedicalHistoryModal(false)}
        onCreated={() => {
          setMedicalHistoryRefreshKey((prev) => prev + 1)
          setShowCreateMedicalHistoryModal(false)
          toast.success('Patient medical history saved')
        }}
      />
    )}
  </div>
)
}