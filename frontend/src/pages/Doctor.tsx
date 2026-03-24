import { useState, useEffect, useCallback } from 'react'
import { hasDischargeDraft, draftSavedAt } from '../services/dischargeDraft'
import { useSearchParams } from 'react-router-dom'
import { useCareContext } from '../providers/CareContextProvider'
import { PatientSearch } from '../components/patients/PatientSearch'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { LabTestList } from '../components/labTests/LabTestList'
import { ECTDetailsList } from '../components/ect/ECTDetailsList'
import { ClinicalNotesList } from '../components/clinicalNotes/ClinicalNotesList'
import { ObservationList } from '../components/observations/ObservationList'
import { VitalSignsList } from '../components/vitalSigns/VitalSignsList'
import { CreateObservationModal } from '../components/observations/CreateObservationModal'
import { MedicalHistoryView } from '../components/medicalHistory/MedicalHistoryView'
import { PackageDetailView } from '../components/packageDetails/PackageDetailView'
import { NursingTaskList } from '../components/nursing/NursingTaskList'
import { CreateNursingTaskModal } from '../components/nursing/CreateNursingTaskModal'
import { NurseTaskList } from '../components/nurseTask/NurseTaskList'
import { CreateNurseTaskModal } from '../components/nurseTask/CreateNurseTaskModal'
import { DischargeList } from '../components/discharges/DischargeList'
import { PatientSummaryCard } from '../components/patients/PatientSummaryCard'
import { DoctorServiceDetailsTable } from '../components/services/DoctorServiceDetailsTable'
import { CreateClinicalNoteModal } from '../components/clinicalNotes/CreateClinicalNoteModal'
import { CreateWarningMessageModal } from '../components/warnings/CreateWarningMessageModal'
import { CreateLabTestModal } from '../components/labTests/CreateLabTestModal'
import { DischargeModal } from '../components/admissions/DischargeModal'
import { CreateDoctorServiceModal } from '../components/services/CreateDoctorServiceModal'
import { AdmissionPage } from './Admission'
import { PatientVisitPage } from './PatientVisit'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'
import { getPatientActiveAdmission } from '../services/inpatientRecords'
import { toast } from '../hooks/useToast'
import { ServiceRequestList } from '../components/serviceRequests/ServiceRequestList'
import { CreateServiceRequestModal } from '../components/serviceRequests/CreateServiceRequestModal'
import { AppointmentList } from '../components/appointments/AppointmentList'
import { CreateAppointmentModal } from '../components/appointments/CreateAppointmentModal'
import { PrescriptionList } from '../components/prescriptions/PrescriptionList'
import { CreatePrescriptionModal } from '../components/prescriptions/CreatePrescriptionModal'
import { PatientVisitList } from '../components/patientVisits/PatientVisitList'
import { AdmissionList } from '../components/admissions/AdmissionList'
import { DiagnosisSymptomsScreen } from '../components/diagnosis/DiagnosisSymptomsScreen'
import { EnvironmentalChecklistList } from '../components/environmental/EnvironmentalChecklistList'
import { MorseFallScaleList } from '../components/morse/MorseFallScaleList'
import { IOPDayListWithHeader } from '../components/iop/IOPDayList'
import { IOPEnrollmentListWithHeader } from '../components/iop/IOPEnrollmentList'
import { ReceptionLongActingMedicineList } from '../components/medication/ReceptionLongActingMedicineList'
import { CreateMedicineGivenModal } from '../components/medication/CreateMedicineGivenModal'
import { MedicineGivenList } from '../components/medication/MedicineGivenList'
import { LongActingMedicineList } from '../components/medication/LongActingMedicineList'
import { reconcileDischargeMedicines } from '../services/medicineGiven'
import { CreateVitalSignModal } from '../components/vitalSigns/CreateVitalSignModal'
import { CreateECTDetailModal } from '../components/ect/CreateECTDetailModal'
import { CreateECTAdmissionModal } from '../components/ect/CreateECTAdmissionModal'
import { CreateECTProcedureModal } from '../components/ect/CreateECTProcedureModal'
import { ECTAdmissionList } from '../components/ect/ECTAdmissionList'
import { ECTProcedureList } from '../components/ect/ECTProcedureList'
import { ECTAnesthesiaConsentList } from '../components/ect/ECTAnesthesiaConsentList'
import { ECTAnesthesiaConsentModal } from '../components/ect/ECTAnesthesiaConsentModal'
import { PreAnesthesiaAssessmentList } from '../components/ect/PreAnesthesiaAssessmentList'
import { PreAnesthesiaAssessmentModal } from '../components/ect/PreAnesthesiaAssessmentModal'
import { SleepingPatternList } from '../components/sleeping/SleepingPatternList'
import { CreateSleepingPatternModal } from '../components/sleeping/CreateSleepingPatternModal'
import { PhysicalExaminationList } from '../components/physicalExam/PhysicalExaminationList'
import { PhysicalExaminationModal } from '../components/physicalExam/PhysicalExaminationModal'
import { PatientHistoryList } from '../components/patientHistory/PatientHistoryList'
import { PatientHistoryModal } from '../components/patientHistory/PatientHistoryModal'
import { AdmissionAssessmentList } from '../components/admissions/AdmissionAssessmentList'
import { SuicidalPatientAssessmentModal } from '../components/admissions/SuicidalPatientAssessmentModal'
import { RecoveryRoomRecordModal } from '../components/admissions/RecoveryRoomRecordModal'
import { AnesthesiaRecordModal } from '../components/admissions/AnesthesiaRecordModal'
import { TimeOutProcedureModal } from '../components/admissions/TimeOutProcedureModal'
import { PreEctChecklistModal } from '../components/admissions/PreEctChecklistModal'
import { ModifiedAldereteScoreModal } from '../components/admissions/ModifiedAldereteScoreModal'

export const DoctorPage = () => {
  const { mode, activeVisit, activeAdmission, selectedPatient: globalPatient, setSelectedPatient: setGlobalPatient } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const patientFromUrl = searchParams.get('patient')
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(() => patientFromUrl || globalPatient || undefined)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [showLabTestModal, setShowLabTestModal] = useState(false)
  const [showDischargeModal, setShowDischargeModal] = useState(false)
  const [dischargeHasDraft, setDischargeHasDraft] = useState(false)
  const [showObservationModal, setShowObservationModal] = useState(false)
  const [showDiagnosisModal, setShowDiagnosisModal] = useState(false)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [selectedAdmission, setSelectedAdmission] = useState<{ name: string; patient: string; patient_name?: string } | null>(null)
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
  const [reconcileLoading, setReconcileLoading] = useState(false)
  const [showDoctorNoteModal, setShowDoctorNoteModal] = useState(false)
  const [showDoctorOrderModal, setShowDoctorOrderModal] = useState(false)
  const [showNursingNoteModal, setShowNursingNoteModal] = useState(false)
  const [showNutritionNoteModal, setShowNutritionNoteModal] = useState(false)
  const [showTherapistNoteModal, setShowTherapistNoteModal] = useState(false)
  const [showDoctorProgressNoteModal, setShowDoctorProgressNoteModal] = useState(false)
  const [showPsychologistNoteModal, setShowPsychologistNoteModal] = useState(false)
  const [showVitalSignModal, setShowVitalSignModal] = useState(false)
  const [vitalSignsRefreshKey, setVitalSignsRefreshKey] = useState(0)
  const [showECTModal, setShowECTModal] = useState(false)
  const [showECTAdmissionModal, setShowECTAdmissionModal] = useState(false)
  const [showECTProcedureModal, setShowECTProcedureModal] = useState(false)
  const [showECTAnesthesiaConsentModal, setShowECTAnesthesiaConsentModal] = useState(false)
  const [ectConsentRefreshKey, setEctConsentRefreshKey] = useState(0)
  const [showPreAnesthesiaModal, setShowPreAnesthesiaModal] = useState(false)
  const [preAnesthesiaRefreshKey, setPreAnesthesiaRefreshKey] = useState(0)
  const [ectRefreshKey, setEctRefreshKey] = useState(0)
  const [showSleepingPatternModal, setShowSleepingPatternModal] = useState(false)
  const [sleepingPatternRefreshKey, setSleepingPatternRefreshKey] = useState(0)
  const [showPhysicalExamModal, setShowPhysicalExamModal] = useState(false)
  const [physicalExamRefreshKey, setPhysicalExamRefreshKey] = useState(0)
  const [showPatientHistoryModal, setShowPatientHistoryModal] = useState(false)
  const [patientHistoryRefreshKey, setPatientHistoryRefreshKey] = useState(0)
  const [showCreateNursingTaskModal, setShowCreateNursingTaskModal] = useState(false)
  const [showCreateNurseTaskModal, setShowCreateNurseTaskModal] = useState(false)
  const [longActingRefreshKey] = useState(0)
  const [showSuicidalModal, setShowSuicidalModal] = useState(false)
  const [suicidalRefreshKey, setSuicidalRefreshKey] = useState(0)
  const [showRecoveryRoomModal, setShowRecoveryRoomModal] = useState(false)
  const [recoveryRoomRefreshKey, setRecoveryRoomRefreshKey] = useState(0)
  const [showAnesthesiaRecordModal, setShowAnesthesiaRecordModal] = useState(false)
  const [anesthesiaRecordRefreshKey, setAnesthesiaRecordRefreshKey] = useState(0)
  const [showTimeOutModal, setShowTimeOutModal] = useState(false)
  const [timeOutRefreshKey, setTimeOutRefreshKey] = useState(0)
  const [showPreEctModal, setShowPreEctModal] = useState(false)
  const [preEctRefreshKey, setPreEctRefreshKey] = useState(0)
  const [showAldereteModal, setShowAldereteModal] = useState(false)
  const [aldereteRefreshKey, setAldereteRefreshKey] = useState(0)
  const screen = searchParams.get('screen')

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
      setSelectedAdmission({
        name: admission.name,
        patient: admission.patient,
        patient_name: admission.patient_name
      })
      setDischargeHasDraft(hasDischargeDraft(admission.name))
      setShowDischargeModal(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch admission')
    }
  }

  const handleDischargeModalClose = useCallback(() => {
    setShowDischargeModal(false)
    if (selectedAdmission) {
      setDischargeHasDraft(hasDischargeDraft(selectedAdmission.name))
    }
  }, [selectedAdmission])

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

  const handleReconcileGiven = async () => {
    if (!selectedPatient) {
      toast.error('Please select a patient first')
      return
    }
    try {
      setReconcileLoading(true)
      const admission = await getPatientActiveAdmission(selectedPatient)
      if (!admission) {
        toast.error('No active admission found for this patient')
        return
      }
      const res = await reconcileDischargeMedicines(admission.name)
      if (res.stock_entry) {
        toast.success(`Stock Entry ${res.stock_entry} created`)
        window.open(`/app/stock-entry/${encodeURIComponent(res.stock_entry)}`, '_blank')
      } else {
        toast.info('No remaining medicines to return')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reconcile medicines'
      toast.error(msg)
    } finally {
      setReconcileLoading(false)
    }
  }

  // Show Admission page when screen=admission
  if (screen === 'admission') {
    return <AdmissionPage />
  }

  // Show Patient Visit page when screen=op
  if (screen === 'op') {
    return <PatientVisitPage initialPatient={selectedPatient} />
  }

  // Show Sleeping Pattern
  if (screen === 'sleep') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Sleeping Pattern</span>
              <button
                onClick={() => setShowSleepingPatternModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Create Sleeping Pattern"
              >
                +
              </button>
            </div>
            <SleepingPatternList
              patient={selectedPatient}
              refreshKey={sleepingPatternRefreshKey}
            />
          </section>
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
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* ECT Admission card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>ECT Admission</span>
                <button
                  onClick={() => setShowECTAdmissionModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                  title="Add ECT Admission"
                >
                  +
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Use this to record admission details for patients undergoing ECT.
              </p>
              <div className="flex-1 min-h-[80px]">
                <ECTAdmissionList patient={selectedPatient} />
              </div>
            </section>

            {/* ECT Procedure card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>ECT Procedure</span>
                <button
                  onClick={() => setShowECTProcedureModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                  title="Add ECT Procedure"
                >
                  +
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Capture procedure details for each ECT session, including vitals and clinical notes.
              </p>
              <div className="flex-1 min-h-[80px]">
                <ECTProcedureList patient={selectedPatient} />
              </div>
            </section>

            {/* ECT Details card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>ECT Details</span>
                <button
                  onClick={() => setShowECTModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                  title="Add ECT Detail"
                >
                  +
                </button>
              </div>
              <div className="flex-1 min-h-[120px]">
                <ECTDetailsList patient={selectedPatient} refreshKey={ectRefreshKey} />
              </div>
            </section>

            {/* ECT Anesthesia Consent card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>ECT Anesthesia Consent</span>
                <button
                  onClick={() => setShowECTAnesthesiaConsentModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                  title="Add ECT Anesthesia Consent"
                >
                  +
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Record anesthesia consent with signatures from the anesthesiologist, patient, guardian, and witness.
              </p>
              <div className="flex-1 min-h-[80px]">
                <ECTAnesthesiaConsentList patient={selectedPatient} refreshKey={ectConsentRefreshKey} />
              </div>
            </section>

            {/* Pre Anesthesia Assessment card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Pre Anesthesia Assessment</span>
                <button
                  onClick={() => setShowPreAnesthesiaModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                  title="Add Pre Anesthesia Assessment"
                >
                  +
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Comprehensive pre-operative anesthesia assessment covering all body systems with ASA classification and fitness determination.
              </p>
              <div className="flex-1 min-h-[80px]">
                <PreAnesthesiaAssessmentList patient={selectedPatient} refreshKey={preAnesthesiaRefreshKey} />
              </div>
            </section>

            {/* Suicidal Patient Assessment card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Suicidal Patient Assessment</span>
                <button
                  onClick={() => setShowSuicidalModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                  title="Add Suicidal Patient Assessment"
                >
                  +
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Assess patient suicide risk factors, history, and current ideation with structured clinical evaluation.
              </p>
              <div className="flex-1 min-h-[80px]">
                <AdmissionAssessmentList
                  doctype="Suicidal Patient Assessment"
                  doctypeLabel="Suicidal Patient Assessment"
                  patient={selectedPatient}
                  refreshKey={suicidalRefreshKey}
                />
              </div>
            </section>

            {/* Recovery Room Record card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Recovery Room Record</span>
                <button
                  onClick={() => setShowRecoveryRoomModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                  title="Add Recovery Room Record"
                >
                  +
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Document patient recovery room events, vitals, and nursing observations post-procedure.
              </p>
              <div className="flex-1 min-h-[80px]">
                <AdmissionAssessmentList
                  doctype="Recovery Room Record"
                  doctypeLabel="Recovery Room Record"
                  patient={selectedPatient}
                  refreshKey={recoveryRoomRefreshKey}
                />
              </div>
            </section>

            {/* Anesthesia Record card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Anesthesia Record</span>
                <button
                  onClick={() => setShowAnesthesiaRecordModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                  title="Add Anesthesia Record"
                >
                  +
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Record anesthesia administration details, patient monitoring, and intra-procedure events.
              </p>
              <div className="flex-1 min-h-[80px]">
                <AdmissionAssessmentList
                  doctype="Anesthesia Record"
                  doctypeLabel="Anesthesia Record"
                  patient={selectedPatient}
                  refreshKey={anesthesiaRecordRefreshKey}
                />
              </div>
            </section>

            {/* Time Out Procedure card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Time Out Procedure</span>
                <button
                  onClick={() => setShowTimeOutModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                  title="Add Time Out Procedure"
                >
                  +
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Complete the pre-procedure time-out checklist to verify patient identity, procedure, and site.
              </p>
              <div className="flex-1 min-h-[80px]">
                <AdmissionAssessmentList
                  doctype="Time Out Procedure"
                  doctypeLabel="Time Out Procedure"
                  patient={selectedPatient}
                  refreshKey={timeOutRefreshKey}
                />
              </div>
            </section>

            {/* Pre-ECT Checklist card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Pre-ECT Checklist</span>
                <button
                  onClick={() => setShowPreEctModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                  title="Add Pre-ECT Checklist"
                >
                  +
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Verify all pre-ECT requirements are met before proceeding with the procedure.
              </p>
              <div className="flex-1 min-h-[80px]">
                <AdmissionAssessmentList
                  doctype="Pre-ECT Checklist"
                  doctypeLabel="Pre-ECT Checklist"
                  patient={selectedPatient}
                  refreshKey={preEctRefreshKey}
                />
              </div>
            </section>

            {/* Modified Alderete Score card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Modified Alderete Score</span>
                <button
                  onClick={() => setShowAldereteModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                  title="Add Modified Alderete Score"
                >
                  +
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Score patient recovery readiness for discharge from the recovery room using the Modified Alderete criteria.
              </p>
              <div className="flex-1 min-h-[80px]">
                <AdmissionAssessmentList
                  doctype="Modified Alderete Score"
                  doctypeLabel="Modified Alderete Score"
                  patient={selectedPatient}
                  refreshKey={aldereteRefreshKey}
                />
              </div>
            </section>

            {/* Physical Examination card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Physical Examination</span>
                <button
                  onClick={() => setShowPhysicalExamModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                  title="Add Physical Examination"
                >
                  +
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Document systematic physical examination findings across all body systems.
              </p>
              <div className="flex-1 min-h-[80px]">
                <PhysicalExaminationList patient={selectedPatient} refreshKey={physicalExamRefreshKey} />
              </div>
            </section>

            {/* Patient History card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Patient History</span>
                <button
                  onClick={() => setShowPatientHistoryModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                  title="Add Patient History"
                >
                  +
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Record detailed patient history including presenting complaints, past medical and psychiatric history.
              </p>
              <div className="flex-1 min-h-[80px]">
                <PatientHistoryList patient={selectedPatient} refreshKey={patientHistoryRefreshKey} />
              </div>
            </section>
          </div>
        </div>
        {showECTAdmissionModal && (
          <CreateECTAdmissionModal
            onClose={() => setShowECTAdmissionModal(false)}
            onSuccess={() => {
              // Reload current route so ECTAdmissionList refetches immediately
              setShowECTAdmissionModal(false)
              window.location.reload()
            }}
            initialPatient={selectedPatient}
          />
        )}
        {showECTProcedureModal && (
          <CreateECTProcedureModal
            onClose={() => setShowECTProcedureModal(false)}
            onSuccess={() => {
              setShowECTProcedureModal(false)
            }}
            initialPatient={selectedPatient}
          />
        )}
        {showECTModal && (
          <CreateECTDetailModal
            onClose={() => setShowECTModal(false)}
            onSuccess={() => {
              setEctRefreshKey(prev => prev + 1)
              setShowECTModal(false)
            }}
            initialPatient={selectedPatient}
          />
        )}
        {showECTAnesthesiaConsentModal && (
          <ECTAnesthesiaConsentModal
            admissionNo=""
            patient={selectedPatient}
            patientName=""
            onClose={() => setShowECTAnesthesiaConsentModal(false)}
            onSuccess={() => {
              setEctConsentRefreshKey(prev => prev + 1)
              setShowECTAnesthesiaConsentModal(false)
            }}
          />
        )}
        {showPreAnesthesiaModal && (
          <PreAnesthesiaAssessmentModal
            admissionNo=""
            patient={selectedPatient}
            patientName=""
            onClose={() => setShowPreAnesthesiaModal(false)}
            onSuccess={() => {
              setPreAnesthesiaRefreshKey(prev => prev + 1)
              setShowPreAnesthesiaModal(false)
            }}
          />
        )}
        {showSuicidalModal && (
          <SuicidalPatientAssessmentModal
            admissionNo=""
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowSuicidalModal(false)}
            onSuccess={() => {
              setSuicidalRefreshKey(prev => prev + 1)
              setShowSuicidalModal(false)
            }}
          />
        )}
        {showRecoveryRoomModal && (
          <RecoveryRoomRecordModal
            admissionNo=""
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowRecoveryRoomModal(false)}
            onSuccess={() => {
              setRecoveryRoomRefreshKey(prev => prev + 1)
              setShowRecoveryRoomModal(false)
            }}
          />
        )}
        {showAnesthesiaRecordModal && (
          <AnesthesiaRecordModal
            admissionNo=""
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowAnesthesiaRecordModal(false)}
            onSuccess={() => {
              setAnesthesiaRecordRefreshKey(prev => prev + 1)
              setShowAnesthesiaRecordModal(false)
            }}
          />
        )}
        {showTimeOutModal && (
          <TimeOutProcedureModal
            admissionNo=""
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowTimeOutModal(false)}
            onSuccess={() => {
              setTimeOutRefreshKey(prev => prev + 1)
              setShowTimeOutModal(false)
            }}
          />
        )}
        {showPreEctModal && (
          <PreEctChecklistModal
            admissionNo=""
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowPreEctModal(false)}
            onSuccess={() => {
              setPreEctRefreshKey(prev => prev + 1)
              setShowPreEctModal(false)
            }}
          />
        )}
        {showAldereteModal && (
          <ModifiedAldereteScoreModal
            admissionNo=""
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowAldereteModal(false)}
            onSuccess={() => {
              setAldereteRefreshKey(prev => prev + 1)
              setShowAldereteModal(false)
            }}
          />
        )}
        {showPhysicalExamModal && (
          <PhysicalExaminationModal
            admissionNo=""
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowPhysicalExamModal(false)}
            onSuccess={() => {
              setPhysicalExamRefreshKey(prev => prev + 1)
              setShowPhysicalExamModal(false)
            }}
          />
        )}
        {showPatientHistoryModal && (
          <PatientHistoryModal
            admissionNo=""
            patient={selectedPatient || ''}
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

  // Show Doctors Note (Clinical Note with Medical Role = Doctor, Clinical Note Type = Note)
  if (screen === 'dn') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Doctors Note</span>
              <button
                onClick={() => setShowDoctorNoteModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Doctors Note"
              >
                +
              </button>
            </div>
            <ClinicalNotesList 
              patient={selectedPatient} 
              medicalRole="Doctor"
              clinicalNoteType="Doctors Note"
              key={clinicalNotesRefreshKey}
            />
          </section>
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

  // Show Doctor Progress Note (Clinical Note with Medical Role = Doctor, Clinical Note Type = Progress Note)
  if (screen === 'dpn') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Doctor Progress Notes</span>
              <button
                onClick={() => setShowDoctorProgressNoteModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Doctor Progress Note"
              >
                +
              </button>
            </div>
            <ClinicalNotesList 
              patient={selectedPatient} 
              medicalRole="Doctor"
              clinicalNoteType="Doctor Progress Note"
              key={clinicalNotesRefreshKey}
            />
          </section>
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

  // Show Doctors Order (Clinical Note with Clinical Note Type = Order)
  if (screen === 'dos') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Doctors Order</span>
              <button
                onClick={() => setShowDoctorOrderModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Doctors Order"
              >
                +
              </button>
            </div>
            <ClinicalNotesList 
              patient={selectedPatient} 
              clinicalNoteType="Doctors Order"
              key={clinicalNotesRefreshKey}
            />
          </section>
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

  // Show Laboratory (Lab Tests)
  if (screen === 'lab') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Laboratory</span>
              <button
                onClick={() => setShowLabTestModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Lab Test"
              >
                +
              </button>
            </div>
            <LabTestList patient={selectedPatient} defaultStatus="Pending Review" key={labTestRefreshKey} />
          </section>
        </div>
      </div>
    )
  }

  // Show Psychologist Notes (Clinical Note with Medical Role = Psychologists)
  if (screen === 'psy-n') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Patient Psychologist Notes</span>
              <button
                onClick={() => setShowPsychologistNoteModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Psychologist Note"
              >
                +
              </button>
            </div>
            <ClinicalNotesList 
              patient={selectedPatient} 
              medicalRole="Psychologists"
              clinicalNoteType="Psychologist Note"
              key={clinicalNotesRefreshKey}
            />
          </section>
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

  // Show Psychologist Orders (Clinical Note with Medical Role = Psychologists, Note Type = Order)
  if (screen === 'psy-o') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Psychologist Orders</span>
              <button
                onClick={() => setShowDiagnosisModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Psychologist Order"
              >
                +
              </button>
            </div>
            <ClinicalNotesList
              patient={selectedPatient}
              medicalRole="Psychologists"
              clinicalNoteType="Psychologist Order"
            />
          </section>
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

  // Show Therapist Notes (Clinical Note with Medical Role = Physiotherapist or Therapist)
  if (screen === 'ther') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Therapist Note</span>
              <button
                onClick={() => setShowTherapistNoteModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Therapist Note"
              >
                +
              </button>
            </div>
            <ClinicalNotesList 
              patient={selectedPatient} 
              medicalRole="Physiotherapist"
              key={clinicalNotesRefreshKey}
            />
          </section>
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

  // Show Nursing Notes (Clinical Note with Medical Role = Nurse)
  if (screen === 'nurse') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Nursing Note</span>
              <button
                onClick={() => setShowNursingNoteModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Nursing Note"
              >
                +
              </button>
            </div>
            <ClinicalNotesList 
              patient={selectedPatient} 
              medicalRole="Nurse"
              key={clinicalNotesRefreshKey}
            />
          </section>
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

  // Nurse Task Assignment – Doctor view of custom Nurse Tasks for this patient
  if (screen === 'nurse-tasks') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Nurse Tasks</h2>
                <p className="text-xs text-slate-600 mt-1">
                  Tasks assigned to nurses for this patient — medication administration, vitals, lab support, and more.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateNurseTaskModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90"
                title="New Nurse Task"
              >
                + New Task
              </button>
            </div>
            <NurseTaskList patient={selectedPatient} />
          </section>
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
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Observation</span>
              <button
                onClick={() => setShowObservationModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Observation"
              >
                +
              </button>
            </div>
            <ObservationList patient={selectedPatient} key={observationRefreshKey} />
          </section>
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
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Vital Signs</span>
              <button
                onClick={() => setShowVitalSignModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Vital Signs"
              >
                +
              </button>
            </div>
            <VitalSignsList patient={selectedPatient} refreshKey={vitalSignsRefreshKey} />
          </section>
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

  // Show Doctors Prescriptions (Patient Medication Orders)
  if (screen === 'rx') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Doctors Prescriptions</span>
              <button
                onClick={() => setShowPrescriptionModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Create Prescription"
              >
                +
              </button>
            </div>
            <PrescriptionList
              patient={selectedPatient}
              refreshKey={prescriptionRefreshKey}
            />
          </section>
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

  // Given Medicines – list administrations, not prescriptions
  if (screen === 'gm') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Given Medicines</span>
              <div className="flex items-center gap-2">
                {/* <button
                  onClick={handleReconcileGiven}
                  className="px-3 py-1 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
                  disabled={reconcileLoading}
                  title="Create Stock Entry for remaining medicines"
                >
                  {reconcileLoading ? 'Reconciling…' : 'Reconcile for Discharge'}
                </button> */}
                <button
                  onClick={() => setShowGivenMedicineModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                  title="Record Given Medicine"
                >
                  +
                </button>
              </div>
            </div>
            <MedicineGivenList patient={selectedPatient} refreshKey={givenRefreshKey} />
          </section>
        </div>
        {showGivenMedicineModal && (
          <CreateMedicineGivenModal
            initialPatient={selectedPatient}
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

  // Show IP Medication (only inpatient prescriptions)
  if (screen === 'ipm') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>IP Medication (Inpatient Prescriptions)</span>
              <button
                onClick={() => setShowPrescriptionModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Create IP Prescription"
              >
                +
              </button>
            </div>
            <PrescriptionList
              patient={selectedPatient}
              refreshKey={prescriptionRefreshKey}
              careContext="Inpatient Admission"
            />
          </section>
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
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Morse Fall Scale</span>
              <button
                onClick={() => window.open('/app/morse-fall-scale/new', '_blank')}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Create Morse Fall Scale"
              >
                +
              </button>
            </div>
            <MorseFallScaleList patient={selectedPatient} />
          </section>
        </div>
      </div>
    )
  }

  // Environmental Checklist (requires patient + Inpatient Admission selection)
  if (screen === 'env') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-3">Environmental Checklist</div>
            <EnvironmentalChecklistList patient={selectedPatient} />
          </section>
        </div>
      </div>
    )
  }

  // IOP Dashboard (reuse Receptionist IOP view)
  if (screen === 'iop') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
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
          <div className="grid gap-6 md:grid-cols-2">
            <IOPDayListWithHeader refreshKey={appointmentRefreshKey} />
            <IOPEnrollmentListWithHeader refreshKey={appointmentRefreshKey} />
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

  // Long Acting Medicine (doctor subtopic)
  if (screen === 'physical-exam') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Physical Examination</span>
              <button
                onClick={() => setShowPhysicalExamModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="New Physical Examination"
              >
                +
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              Record physical examination findings by body system — skin, CVS/Resp, CNC, GIT and others.
            </p>
            <PhysicalExaminationList
              patient={selectedPatient}
              refreshKey={physicalExamRefreshKey}
            />
          </section>
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

  if (screen === 'patient-history') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Patient History</span>
              <button
                onClick={() => setShowPatientHistoryModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="New Patient History"
              >
                +
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              Structured patient history records with template-driven attribute items and detailed descriptions.
            </p>
            <PatientHistoryList
              patient={selectedPatient}
              refreshKey={patientHistoryRefreshKey}
            />
          </section>
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

  if (screen === 'd-long-acting-meds') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Long Acting Medicine</h2>
              <p className="text-sm text-slate-600 mt-1">
                View long acting medicines for the selected patient. Filter by start date and frequency. Click a row for details.
              </p>
            </div>
          </div>
          <ReceptionLongActingMedicineList
            patient={selectedPatient || undefined}
            refreshKey={longActingRefreshKey}
          />
        </div>
      </div>
    )
  }

  // Show Patient Visit History
  if (screen === 'pvh') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4">Patient Visit History</div>
            <PatientVisitList patient={selectedPatient} />
          </section>
        </div>
      </div>
    )
  }

  // Show Warning Messages full view
  if (screen === 'warn') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Warnings & Allergies</span>
              <button
                onClick={() => setShowWarningModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Warning Message"
              >
                +
              </button>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: 'thin' }}>
              <WarningMessagesList patient={selectedPatient} key={warningRefreshKey} />
            </div>
          </section>
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

  // Show Nutritionist Notes (Clinical Note with Medical Role = Nutritionist)
  if (screen === 'nut') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Nutritionist Notes</span>
              <button
                onClick={() => setShowNutritionNoteModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Nutritionist Note"
              >
                +
              </button>
            </div>
            <ClinicalNotesList 
              patient={selectedPatient} 
              medicalRole="Nutritionist"
              clinicalNoteType="Nutritionist Note"
              key={clinicalNotesRefreshKey}
            />
          </section>
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
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <MedicalHistoryView patient={selectedPatient} />
        </div>
      </div>
    )
  }

  // Show Package Details – dashboard: available packages, active admission, assigned package (from Quotation)
  if (screen === 'pkg') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Package Details</span>
              <button
                onClick={async () => {
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
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Manage Packages for Admission"
              >
                +
              </button>
            </div>
            <PackageDetailView patient={selectedPatient} />
          </section>
        </div>
      </div>
    )
  }

  // Show Diagnosis & Symptoms (from left sidebar "Diagnoses" -> screen=dx)
  if (screen === 'dx') {
    return (
      <DiagnosisSymptomsScreen
        selectedPatient={selectedPatient || ''}
        onPatientSelect={handlePatientSelect}
      />
    )
  }

  // Show Discharge Form (list of discharges with + button)
  if (screen === 'df') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Discharge Form</span>
              <div className="flex items-center gap-2">
                {dischargeHasDraft && selectedAdmission && (
                  <span className="text-xs text-amber-700">
                    Draft — {draftSavedAt(selectedAdmission.name)}
                  </span>
                )}
                <button
                  onClick={handleCreateDischarge}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-white text-xs font-medium transition-colors ${
                    dischargeHasDraft
                      ? 'bg-amber-500 hover:bg-amber-600'
                      : 'bg-primary hover:bg-primary/90'
                  }`}
                  title={dischargeHasDraft ? 'Continue saved discharge' : 'Start discharge'}
                >
                  {dischargeHasDraft ? '▶ Continue' : '+'}
                </button>
              </div>
            </div>
            <DischargeList patient={selectedPatient} key={dischargeRefreshKey} />
          </section>
        </div>
        {showDischargeModal && selectedAdmission && (
          <DischargeModal
            admission={selectedAdmission}
            onClose={handleDischargeModalClose}
            onSuccess={() => {
              setShowDischargeModal(false)
              setSelectedAdmission(null)
              setDischargeHasDraft(false)
              setDischargeRefreshKey(prev => prev + 1)
              toast.success('Discharge completed successfully')
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
        <div className="flex-1 min-w-0">
          <PatientSearch
            selectedPatient={selectedPatient || ''}
            onPatientSelect={handlePatientSelect}
            patients={[]}
          />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <UserMenu />
          <NotificationBell />
        </div>
      </header>

      {/* OP / IP mode: full-width top row — hidden once a specific visit/admission is selected */}
      {(mode === 'OP' && !activeVisit) || (mode === 'IP' && !activeAdmission) ? (
        <div className="px-4 pt-4 pb-0">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
            <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
              <span>{mode === 'OP' ? 'Patient Visits (OP)' : 'Inpatient Admissions (IP)'}</span>
            </div>
            <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
              {mode === 'OP' ? (
                <PatientVisitList
                  patient={selectedPatient || undefined}
                  onPatientFromVisit={(p) => {
                    setSelectedPatient(p)
                    const sp = new URLSearchParams(searchParams)
                    sp.set('patient', p)
                    setSearchParams(sp, { replace: true })
                  }}
                />
              ) : (
                <AdmissionList
                  patient={selectedPatient || undefined}
                  onPatientFromAdmission={(p) => {
                    setSelectedPatient(p)
                    const sp = new URLSearchParams(searchParams)
                    sp.set('patient', p)
                    setSearchParams(sp, { replace: true })
                  }}
                />
              )}
            </div>
          </section>
        </div>
      ) : null}

      {selectedPatient ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 p-4">
            {/* Card 1: Patient info */}
            <div className="overflow-auto max-h-[400px]">
              <PatientSummaryCard patient={selectedPatient} />
            </div>

            {/* Card 2: Patient Medical History */}
            <section className="bg-white border border-slate-200 rounded-lg p-0 shadow-sm flex flex-col max-h-[400px] overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
                <span className="font-semibold">Patient Medical History</span>
              </div>
              <div className="flex-1 min-h-0 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
                <MedicalHistoryView patient={selectedPatient} />
              </div>
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2 px-4 pb-4">
            {/* Card: Warnings & Allergies */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                <span>Warnings & Allergies</span>
                <button
                  onClick={() => setShowWarningModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                  title="Add Warning Message"
                >
                  +
                </button>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <WarningMessagesList patient={selectedPatient} key={warningRefreshKey} />
              </div>
            </section>

            {/* Card: Doctor Progress Notes (just before Lab Test) */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                <span>Doctor Progress Notes</span>
                <button
                  onClick={() => setShowDoctorProgressNoteModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                  title="Add Doctor Progress Note"
                >
                  +
                </button>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <ClinicalNotesList
                  patient={selectedPatient}
                  medicalRole="Doctor"
                  clinicalNoteType="Doctor Progress Note"
                  key={doctorProgressNoteRefreshKey}
                />
              </div>
            </section>

            {/* Card 3: Lab Test Reports */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                <span>Lab Test Reports</span>
                <button
                  onClick={() => setShowLabTestModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                  title="Add Lab Test Report"
                >
                  +
                </button>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <LabTestList
                  patient={selectedPatient}
                  defaultStatus="Pending Review"
                  key={labTestRefreshKey}
                />
              </div>
            </section>

            {/* Card 4: Diagnosis detail (Diagnosis Notes) */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                <span>Diagnosis Detail</span>
                <button
                  onClick={() => setShowDiagnosisModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                  title="Add Diagnosis Note"
                >
                  +
                </button>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <ClinicalNotesList 
                  patient={selectedPatient}
                  clinicalNoteType="Diagnosis Note"
                  hideTypes={true}
                  key={diagnosisRefreshKey}
                />
              </div>
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2 px-4 pb-4">
            {/* Card 5: Service Requests */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                <span>Service Requests</span>
                <button
                  onClick={() => setShowServiceRequestModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                  title="Add Service Request"
                >
                  +
                </button>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <ServiceRequestList 
                  patient={selectedPatient} 
                  refreshKey={serviceRequestRefreshKey}
                />
              </div>
            </section>

            {/* Card: Prescription (Patient Medication Order) */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                <span>Prescription</span>
                <button
                  onClick={() => setShowPrescriptionModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                  title="Create Prescription"
                >
                  +
                </button>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <PrescriptionList patient={selectedPatient} refreshKey={prescriptionRefreshKey} />
              </div>
            </section>

            {/* Card: Long Acting Medicine (just after Prescription) */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex-shrink-0">
                <span>Long Acting Medicine</span>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <LongActingMedicineList
                  patient={selectedPatient}
                  refreshKey={prescriptionRefreshKey}
                />
              </div>
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2 px-4 pb-4">
            {/* Card: Patient Visits */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex-shrink-0">
                <span>Patient Visits</span>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <PatientVisitList patient={selectedPatient} />
              </div>
            </section>

            {/* Card: Admissions */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex-shrink-0">
                <span>Admissions</span>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <AdmissionList patient={selectedPatient} />
              </div>
            </section>
          </div>

          {/* Card: Discharges */}
          <div className="px-4 pb-4">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex-shrink-0">
                <span>Discharges</span>
              </div>
              <div
                className="overflow-x-auto overflow-y-auto flex-1 min-h-0"
                style={{ scrollbarWidth: 'thin' }}
              >
                <DischargeList patient={selectedPatient} key={dischargeRefreshKey} />
              </div>
            </section>
          </div>

          <div className="px-4 pb-4">
            <DoctorServiceDetailsTable 
              patient={selectedPatient} 
              onAddService={() => setShowServiceModal(true)}
            />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 p-4">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                <span>Warning Messages (Allergies etc.)</span>
                <button
                  onClick={() => setShowWarningModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                  title="Add Warning Message"
                >
                  +
                </button>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <WarningMessagesList patient={undefined} key={warningRefreshKey} />
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                <span>Lab Test Reports Pending for Review</span>
                <button
                  onClick={() => setShowLabTestModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                  title="Add Lab Test Report"
                >
                  +
                </button>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <LabTestList defaultStatus="Pending Review" key={labTestRefreshKey} />
              </div>
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2 px-4 pb-4">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                <span>Appointments</span>
                <button
                  onClick={() => setShowAppointmentModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                  title="Add Appointment"
                >
                  +
                </button>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <AppointmentList refreshKey={appointmentRefreshKey} />
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                <span>Prescription</span>
                <button
                  onClick={() => setShowPrescriptionModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                  title="Create Prescription"
                >
                  +
                </button>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <PrescriptionList refreshKey={prescriptionRefreshKey} />
              </div>
            </section>
          </div>
        </>
      )}

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
        <CreateLabTestModal
          onClose={() => setShowLabTestModal(false)}
          onSuccess={() => {
            setLabTestRefreshKey(prev => prev + 1)
            setShowLabTestModal(false)
          }}
          initialPatient={selectedPatient}
        />
      )}

      {showDischargeModal && selectedAdmission && (
        <DischargeModal
          admission={selectedAdmission}
          onClose={handleDischargeModalClose}
          onSuccess={() => {
            setShowDischargeModal(false)
            setSelectedAdmission(null)
            setDischargeHasDraft(false)
            toast.success('Discharge completed successfully')
          }}
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

      {showDiagnosisModal && selectedPatient && (
        <CreateClinicalNoteModal
          onClose={() => setShowDiagnosisModal(false)}
          onSuccess={() => {
            setDiagnosisRefreshKey(prev => prev + 1)
            setShowDiagnosisModal(false)
          }}
          initialPatient={selectedPatient}
          defaultClinicalNoteType="Diagnosis Note"
          title="Add Diagnosis Note"
        />
      )}

      {showServiceModal && (
        <CreateDoctorServiceModal
          onClose={() => setShowServiceModal(false)}
          onSuccess={() => {
            setShowServiceModal(false)
            // TODO: Refresh service details table when backend is wired
          }}
          patient={selectedPatient}
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
    </div>
  )
}
