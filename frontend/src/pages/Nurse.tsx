import { useState, useEffect } from 'react'
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
import { CreateVitalSignModal } from '../components/vitalSigns/CreateVitalSignModal'
import { DischargeList } from '../components/discharges/DischargeList'
import { DischargeModal } from '../components/admissions/DischargeModal'
import { PackageDetailView } from '../components/packageDetails/PackageDetailView'
import { NursingTaskList } from '../components/nursing/NursingTaskList'
import { PatientSummaryCard } from '../components/patients/PatientSummaryCard'
import { DoctorServiceDetailsTable } from '../components/services/DoctorServiceDetailsTable'
import { CreateClinicalNoteModal } from '../components/clinicalNotes/CreateClinicalNoteModal'
import { getPatientActiveAdmission } from '../services/inpatientRecords'
import { toast } from '../hooks/useToast'
import { CreateWarningMessageModal } from '../components/warnings/CreateWarningMessageModal'
import { CreateLabTestModal } from '../components/labTests/CreateLabTestModal'
import { CreateDoctorServiceModal } from '../components/services/CreateDoctorServiceModal'
import { AdmissionPage } from './Admission'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'
import { ServiceRequestList } from '../components/serviceRequests/ServiceRequestList'
import { CreateServiceRequestModal } from '../components/serviceRequests/CreateServiceRequestModal'
import { IPServiceList } from '../components/ipServices/IPServiceList'
import { CreateIPServiceModal } from '../components/ipServices/CreateIPServiceModal'
import { PrescriptionList } from '../components/prescriptions/PrescriptionList'
import { CreatePrescriptionModal } from '../components/prescriptions/CreatePrescriptionModal'
import { CreateMedicineGivenModal } from '../components/medication/CreateMedicineGivenModal'
import { MedicineGivenList } from '../components/medication/MedicineGivenList'
import { DailyMedicationChart } from '../components/medication/DailyMedicationChart'
import { MedicationSheet } from '../components/medication/MedicationSheet'
import { LongActingMedReminderList } from '../components/medication/LongActingMedReminderList'
import { reconcileDischargeMedicines } from '../services/medicineGiven'
import { DiagnosisSymptomsScreen } from '../components/diagnosis/DiagnosisSymptomsScreen'
import { AppointmentList } from '../components/appointments/AppointmentList'
import { EnvironmentalChecklistList } from '../components/environmental/EnvironmentalChecklistList'
import { MorseFallScaleList } from '../components/morse/MorseFallScaleList'
import { SleepingPatternList } from '../components/sleeping/SleepingPatternList'
import { CreateSleepingPatternModal } from '../components/sleeping/CreateSleepingPatternModal'
import { PatientHistoryList } from '../components/patientHistory/PatientHistoryList'
import { PatientHistoryModal } from '../components/patientHistory/PatientHistoryModal'
import { ECTAdmissionList } from '../components/ect/ECTAdmissionList'
import { ECTProcedureList } from '../components/ect/ECTProcedureList'
import { CreateECTAdmissionModal } from '../components/ect/CreateECTAdmissionModal'
import { CreateECTProcedureModal } from '../components/ect/CreateECTProcedureModal'
import { CreateECTDetailModal } from '../components/ect/CreateECTDetailModal'
import { ECTAnesthesiaConsentList } from '../components/ect/ECTAnesthesiaConsentList'
import { ECTAnesthesiaConsentModal } from '../components/ect/ECTAnesthesiaConsentModal'
import { PreAnesthesiaAssessmentList } from '../components/ect/PreAnesthesiaAssessmentList'
import { PreAnesthesiaAssessmentModal } from '../components/ect/PreAnesthesiaAssessmentModal'
import { AdmissionAssessmentList } from '../components/admissions/AdmissionAssessmentList'
import { SuicidalPatientAssessmentModal } from '../components/admissions/SuicidalPatientAssessmentModal'
import { RecoveryRoomRecordModal } from '../components/admissions/RecoveryRoomRecordModal'
import { AnesthesiaRecordModal } from '../components/admissions/AnesthesiaRecordModal'
import { TimeOutProcedureModal } from '../components/admissions/TimeOutProcedureModal'
import { PreEctChecklistModal } from '../components/admissions/PreEctChecklistModal'
import { ModifiedAldereteScoreModal } from '../components/admissions/ModifiedAldereteScoreModal'
import { PhysicalExaminationList } from '../components/physicalExam/PhysicalExaminationList'
import { PhysicalExaminationModal } from '../components/physicalExam/PhysicalExaminationModal'
import { IOPDayListWithHeader } from '../components/iop/IOPDayList'
import { IOPEnrollmentListWithHeader } from '../components/iop/IOPEnrollmentList'
import { PatientVisitList } from '../components/patientVisits/PatientVisitList'
import { AdmissionList } from '../components/admissions/AdmissionList'
import { PatientVisitPage } from './PatientVisit'
import { GroomingChartList } from '../components/nursing/GroomingChartList'
import { CreateGroomingChartModal } from '../components/nursing/CreateGroomingChartModal'

export const NursePage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const { mode } = useCareContext()
  const patientFromUrl = searchParams.get('patient')
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(patientFromUrl || undefined)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [showLabTestModal, setShowLabTestModal] = useState(false)
  const [showObservationModal, setShowObservationModal] = useState(false)
  const [showDischargeModal, setShowDischargeModal] = useState(false)
  const [showDiagnosisModal, setShowDiagnosisModal] = useState(false)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [selectedAdmission, setSelectedAdmission] = useState<{ name: string; patient: string; patient_name?: string } | null>(null)
  const [warningRefreshKey, setWarningRefreshKey] = useState(0)
  const [labTestRefreshKey, setLabTestRefreshKey] = useState(0)
  const [observationRefreshKey, setObservationRefreshKey] = useState(0)
  const [dischargeRefreshKey, setDischargeRefreshKey] = useState(0)
  const [diagnosisRefreshKey, setDiagnosisRefreshKey] = useState(0)
  const [clinicalNotesRefreshKey, setClinicalNotesRefreshKey] = useState(0)
  const [vitalSignsRefreshKey, setVitalSignsRefreshKey] = useState(0)
  const [showServiceRequestModal, setShowServiceRequestModal] = useState(false)
  const [serviceRequestRefreshKey, setServiceRequestRefreshKey] = useState(0)
  const [ipServiceRefreshKey, setIpServiceRefreshKey] = useState(0)
  const [showCreateIPServiceModal, setShowCreateIPServiceModal] = useState(false)
  const [createIPServicePreFill, setCreateIPServicePreFill] = useState<{ serviceRequest?: string; patient?: string } | null>(null)
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false)
  const [prescriptionRefreshKey, setPrescriptionRefreshKey] = useState(0)
  const [showPsychOrderModal, setShowPsychOrderModal] = useState(false)
  const [showDoctorNoteModal, setShowDoctorNoteModal] = useState(false)
  const [showNutritionNoteModal, setShowNutritionNoteModal] = useState(false)
  const [showTherapistNoteModal, setShowTherapistNoteModal] = useState(false)
  const [showVitalSignModal, setShowVitalSignModal] = useState(false)
  const [showSleepingPatternModal, setShowSleepingPatternModal] = useState(false)
  const [sleepingPatternRefreshKey, setSleepingPatternRefreshKey] = useState(0)
  const [showPatientHistoryModal, setShowPatientHistoryModal] = useState(false)
  const [patientHistoryRefreshKey, setPatientHistoryRefreshKey] = useState(0)
  const [showGivenMedicineModal, setShowGivenMedicineModal] = useState(false)
  const [givenRefreshKey, setGivenRefreshKey] = useState(0)
  const [reconcileLoading, setReconcileLoading] = useState(false)
  const [showBulkScheduleModal, setShowBulkScheduleModal] = useState(false)
  const [iopRefreshKey] = useState(0)
  const [showGroomingModal, setShowGroomingModal] = useState(false)
  const [groomingRefreshKey, setGroomingRefreshKey] = useState(0)
  // ECT dashboard state
  const [showECTModal, setShowECTModal] = useState(false)
  const [ectRefreshKey, setEctRefreshKey] = useState(0)
  const [showECTAdmissionModal, setShowECTAdmissionModal] = useState(false)
  const [showECTProcedureModal, setShowECTProcedureModal] = useState(false)
  const [showECTAnesthesiaConsentModal, setShowECTAnesthesiaConsentModal] = useState(false)
  const [ectConsentRefreshKey, setEctConsentRefreshKey] = useState(0)
  const [showPreAnesthesiaModal, setShowPreAnesthesiaModal] = useState(false)
  const [preAnesthesiaRefreshKey, setPreAnesthesiaRefreshKey] = useState(0)
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
  const [showPhysicalExamModal, setShowPhysicalExamModal] = useState(false)
  const [physicalExamRefreshKey, setPhysicalExamRefreshKey] = useState(0)
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

  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient)
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

  // Show Admission page when screen=n-reg or screen=admission
  if (screen === 'n-reg' || screen === 'admission') {
    return <AdmissionPage />
  }

  // IP Warnings / Meds / Allergy – mirror Doctor warnings card
  if (screen === 'n-first') {
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

  // Show ECT Details
  if (screen === 'n-ect') {
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
                <button onClick={() => setShowECTAdmissionModal(true)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold" title="Add ECT Admission">+</button>
              </div>
              <p className="text-sm text-slate-600 mb-3">Use this to record admission details for patients undergoing ECT.</p>
              <div className="flex-1 min-h-[80px]"><ECTAdmissionList patient={selectedPatient} /></div>
            </section>

            {/* ECT Procedure card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>ECT Procedure</span>
                <button onClick={() => setShowECTProcedureModal(true)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold" title="Add ECT Procedure">+</button>
              </div>
              <p className="text-sm text-slate-600 mb-3">Capture procedure details for each ECT session, including vitals and clinical notes.</p>
              <div className="flex-1 min-h-[80px]"><ECTProcedureList patient={selectedPatient} /></div>
            </section>

            {/* ECT Details card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>ECT Details</span>
                <button onClick={() => setShowECTModal(true)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold" title="Add ECT Detail">+</button>
              </div>
              <div className="flex-1 min-h-[120px]"><ECTDetailsList patient={selectedPatient} refreshKey={ectRefreshKey} /></div>
            </section>

            {/* ECT Anesthesia Consent card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>ECT Anesthesia Consent</span>
                <button onClick={() => setShowECTAnesthesiaConsentModal(true)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold" title="Add ECT Anesthesia Consent">+</button>
              </div>
              <p className="text-sm text-slate-600 mb-3">Record anesthesia consent with signatures from the anesthesiologist, patient, guardian, and witness.</p>
              <div className="flex-1 min-h-[80px]"><ECTAnesthesiaConsentList patient={selectedPatient} refreshKey={ectConsentRefreshKey} /></div>
            </section>

            {/* Pre Anesthesia Assessment card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Pre Anesthesia Assessment</span>
                <button onClick={() => setShowPreAnesthesiaModal(true)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold" title="Add Pre Anesthesia Assessment">+</button>
              </div>
              <p className="text-sm text-slate-600 mb-3">Comprehensive pre-operative anesthesia assessment covering all body systems with ASA classification and fitness determination.</p>
              <div className="flex-1 min-h-[80px]"><PreAnesthesiaAssessmentList patient={selectedPatient} refreshKey={preAnesthesiaRefreshKey} /></div>
            </section>

            {/* Suicidal Patient Assessment card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Suicidal Patient Assessment</span>
                <button onClick={() => setShowSuicidalModal(true)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold" title="Add Suicidal Patient Assessment">+</button>
              </div>
              <p className="text-sm text-slate-600 mb-3">Assess patient suicide risk factors, history, and current ideation with structured clinical evaluation.</p>
              <div className="flex-1 min-h-[80px]">
                <AdmissionAssessmentList doctype="Suicidal Patient Assessment" doctypeLabel="Suicidal Patient Assessment" patient={selectedPatient} refreshKey={suicidalRefreshKey} />
              </div>
            </section>

            {/* Recovery Room Record card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Recovery Room Record</span>
                <button onClick={() => setShowRecoveryRoomModal(true)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold" title="Add Recovery Room Record">+</button>
              </div>
              <p className="text-sm text-slate-600 mb-3">Document patient recovery room events, vitals, and nursing observations post-procedure.</p>
              <div className="flex-1 min-h-[80px]">
                <AdmissionAssessmentList doctype="Recovery Room Record" doctypeLabel="Recovery Room Record" patient={selectedPatient} refreshKey={recoveryRoomRefreshKey} />
              </div>
            </section>

            {/* Anesthesia Record card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Anesthesia Record</span>
                <button onClick={() => setShowAnesthesiaRecordModal(true)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold" title="Add Anesthesia Record">+</button>
              </div>
              <p className="text-sm text-slate-600 mb-3">Record anesthesia administration details, patient monitoring, and intra-procedure events.</p>
              <div className="flex-1 min-h-[80px]">
                <AdmissionAssessmentList doctype="Anesthesia Record" doctypeLabel="Anesthesia Record" patient={selectedPatient} refreshKey={anesthesiaRecordRefreshKey} />
              </div>
            </section>

            {/* Time Out Procedure card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Time Out Procedure</span>
                <button onClick={() => setShowTimeOutModal(true)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold" title="Add Time Out Procedure">+</button>
              </div>
              <p className="text-sm text-slate-600 mb-3">Complete the pre-procedure time-out checklist to verify patient identity, procedure, and site.</p>
              <div className="flex-1 min-h-[80px]">
                <AdmissionAssessmentList doctype="Time Out Procedure" doctypeLabel="Time Out Procedure" patient={selectedPatient} refreshKey={timeOutRefreshKey} />
              </div>
            </section>

            {/* Pre-ECT Checklist card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Pre-ECT Checklist</span>
                <button onClick={() => setShowPreEctModal(true)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold" title="Add Pre-ECT Checklist">+</button>
              </div>
              <p className="text-sm text-slate-600 mb-3">Verify all pre-ECT requirements are met before proceeding with the procedure.</p>
              <div className="flex-1 min-h-[80px]">
                <AdmissionAssessmentList doctype="Pre-ECT Checklist" doctypeLabel="Pre-ECT Checklist" patient={selectedPatient} refreshKey={preEctRefreshKey} />
              </div>
            </section>

            {/* Modified Alderete Score card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Modified Alderete Score</span>
                <button onClick={() => setShowAldereteModal(true)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold" title="Add Modified Alderete Score">+</button>
              </div>
              <p className="text-sm text-slate-600 mb-3">Score patient recovery readiness for discharge from the recovery room using the Modified Alderete criteria.</p>
              <div className="flex-1 min-h-[80px]">
                <AdmissionAssessmentList doctype="Modified Alderete Score" doctypeLabel="Modified Alderete Score" patient={selectedPatient} refreshKey={aldereteRefreshKey} />
              </div>
            </section>

            {/* Physical Examination card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Physical Examination</span>
                <button onClick={() => setShowPhysicalExamModal(true)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold" title="Add Physical Examination">+</button>
              </div>
              <p className="text-sm text-slate-600 mb-3">Document systematic physical examination findings across all body systems.</p>
              <div className="flex-1 min-h-[80px]">
                <PhysicalExaminationList patient={selectedPatient} refreshKey={physicalExamRefreshKey} />
              </div>
            </section>

            {/* Patient History card */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Patient History</span>
                <button onClick={() => setShowPatientHistoryModal(true)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold" title="Add Patient History">+</button>
              </div>
              <p className="text-sm text-slate-600 mb-3">Record detailed patient history including presenting complaints, past medical and psychiatric history.</p>
              <div className="flex-1 min-h-[80px]">
                <PatientHistoryList patient={selectedPatient} refreshKey={patientHistoryRefreshKey} />
              </div>
            </section>
          </div>
        </div>

        {/* Modals */}
        {showECTAdmissionModal && (
          <CreateECTAdmissionModal
            onClose={() => setShowECTAdmissionModal(false)}
            onSuccess={() => { setShowECTAdmissionModal(false); window.location.reload() }}
            initialPatient={selectedPatient}
          />
        )}
        {showECTProcedureModal && (
          <CreateECTProcedureModal
            onClose={() => setShowECTProcedureModal(false)}
            onSuccess={() => setShowECTProcedureModal(false)}
            initialPatient={selectedPatient}
          />
        )}
        {showECTModal && (
          <CreateECTDetailModal
            onClose={() => setShowECTModal(false)}
            onSuccess={() => { setEctRefreshKey(prev => prev + 1); setShowECTModal(false) }}
            initialPatient={selectedPatient}
          />
        )}
        {showECTAnesthesiaConsentModal && (
          <ECTAnesthesiaConsentModal
            admissionNo=""
            patient={selectedPatient}
            patientName=""
            onClose={() => setShowECTAnesthesiaConsentModal(false)}
            onSuccess={() => { setEctConsentRefreshKey(prev => prev + 1); setShowECTAnesthesiaConsentModal(false) }}
          />
        )}
        {showPreAnesthesiaModal && (
          <PreAnesthesiaAssessmentModal
            admissionNo=""
            patient={selectedPatient}
            patientName=""
            onClose={() => setShowPreAnesthesiaModal(false)}
            onSuccess={() => { setPreAnesthesiaRefreshKey(prev => prev + 1); setShowPreAnesthesiaModal(false) }}
          />
        )}
        {showSuicidalModal && (
          <SuicidalPatientAssessmentModal
            admissionNo=""
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowSuicidalModal(false)}
            onSuccess={() => { setSuicidalRefreshKey(prev => prev + 1); setShowSuicidalModal(false) }}
          />
        )}
        {showRecoveryRoomModal && (
          <RecoveryRoomRecordModal
            admissionNo=""
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowRecoveryRoomModal(false)}
            onSuccess={() => { setRecoveryRoomRefreshKey(prev => prev + 1); setShowRecoveryRoomModal(false) }}
          />
        )}
        {showAnesthesiaRecordModal && (
          <AnesthesiaRecordModal
            admissionNo=""
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowAnesthesiaRecordModal(false)}
            onSuccess={() => { setAnesthesiaRecordRefreshKey(prev => prev + 1); setShowAnesthesiaRecordModal(false) }}
          />
        )}
        {showTimeOutModal && (
          <TimeOutProcedureModal
            admissionNo=""
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowTimeOutModal(false)}
            onSuccess={() => { setTimeOutRefreshKey(prev => prev + 1); setShowTimeOutModal(false) }}
          />
        )}
        {showPreEctModal && (
          <PreEctChecklistModal
            admissionNo=""
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowPreEctModal(false)}
            onSuccess={() => { setPreEctRefreshKey(prev => prev + 1); setShowPreEctModal(false) }}
          />
        )}
        {showAldereteModal && (
          <ModifiedAldereteScoreModal
            admissionNo=""
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowAldereteModal(false)}
            onSuccess={() => { setAldereteRefreshKey(prev => prev + 1); setShowAldereteModal(false) }}
          />
        )}
        {showPhysicalExamModal && (
          <PhysicalExaminationModal
            admissionNo=""
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowPhysicalExamModal(false)}
            onSuccess={() => { setPhysicalExamRefreshKey(prev => prev + 1); setShowPhysicalExamModal(false) }}
          />
        )}
        {showPatientHistoryModal && (
          <PatientHistoryModal
            admissionNo=""
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowPatientHistoryModal(false)}
            onSuccess={() => { setPatientHistoryRefreshKey(prev => prev + 1); setShowPatientHistoryModal(false) }}
          />
        )}
      </div>
    )
  }

  // IOP Dashboard – same as Reception and Doctor: IOP days and enrollments
  if (screen === 'n-iop') {
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
            <IOPDayListWithHeader refreshKey={iopRefreshKey} />
            <IOPEnrollmentListWithHeader refreshKey={iopRefreshKey} patientFilter={selectedPatient} />
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

  // My Nursing Tasks – tasks assigned to the logged-in nurse
  if (screen === 'n-my-tasks') {
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
                <h2 className="text-base font-semibold text-slate-900">My Nursing Tasks</h2>
                <p className="text-xs text-slate-600 mt-1">
                  Tasks assigned to you, ordered by requested time and status.
                </p>
              </div>
            </div>
            <NursingTaskList myTasks />
          </section>
        </div>
      </div>
    )
  }

  // Lab Reports Status – show lab listings (Pending Review by default)
  if (screen === 'n-labs') {
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
              <span>Lab Reports Status</span>
            </div>
            <LabTestList
              patient={selectedPatient}
              defaultStatus="Requested"
              key={labTestRefreshKey}
            />
          </section>
        </div>
      </div>
    )
  }

  // Laboratory – same listing as doctor Laboratory
  if (screen === 'n-lab') {
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
            </div>
            <LabTestList
              patient={selectedPatient}
              defaultStatus="Requested"
              key={labTestRefreshKey}
            />
          </section>
        </div>
      </div>
    )
  }

  // Show Doctors Notes (Clinical Note with Medical Role = Doctor, Clinical Note Type = Doctors Note)
  if (screen === 'n-doc-notes') {
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
              <span>Doctors Notes</span>
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

  // Show Doctors Order (Clinical Note with note_type = Order)
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
            <div className="font-semibold mb-4">Doctors Order</div>
            <ClinicalNotesList 
              patient={selectedPatient} 
              noteType="Order"
            />
          </section>
        </div>
      </div>
    )
  }

  // Show Nursing Notes (Clinical Note with Medical Role = Nurse)
  if (screen === 'nurse' || screen === 'n-nurse-notes') {
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
            <div className="font-semibold mb-4">Nursing Note</div>
            <ClinicalNotesList 
              patient={selectedPatient} 
              medicalRole="Nurse"
            />
          </section>
        </div>
      </div>
    )
  }

  // Show Psychologist Notes (Clinical Note with Medical Role = Psychologists)
  if (screen === 'n-psy-notes') {
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
            <div className="font-semibold mb-4">Psychologist Notes</div>
            <ClinicalNotesList
              patient={selectedPatient}
              medicalRole="Psychologists"
            />
          </section>
        </div>
      </div>
    )
  }

  // Show Nutritionist Notes (mirror Doctor Nutritionist Notes)
  if (screen === 'n-nut') {
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

  // Show Psychologist Orders (Clinical Note with Medical Role = Psychologists, Note Type = Order)
  if (screen === 'n-psy-order') {
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
                onClick={() => setShowPsychOrderModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Psychologist Order"
              >
                +
              </button>
            </div>
            <ClinicalNotesList
              patient={selectedPatient}
              medicalRole="Psychologists"
              noteType="Order"
            />
          </section>
        </div>
        {showPsychOrderModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowPsychOrderModal(false)}
            onSuccess={() => {
              setDiagnosisRefreshKey(prev => prev + 1)
              setShowPsychOrderModal(false)
            }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Order"
            title="Add Psychologist Order"
          />
        )}
      </div>
    )
  }

  // Show Observation
  if (screen === 'n-obs') {
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
  if (screen === 'n-tpr') {
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

  // Environmental Checklist (requires patient + Inpatient Admission selection)
  if (screen === 'n-env') {
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

  // Therapist Notes – mirror Doctor Therapist Notes
  if (screen === 'n-ther') {
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

  // Medication (Prescriptions)
  if (screen === 'n-med') {
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
              <span>Medication (Prescriptions)</span>
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
  if (screen === 'n-given') {
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
                <button
                  onClick={handleReconcileGiven}
                  className="px-3 py-1 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
                  disabled={reconcileLoading}
                  title="Create Stock Entry for remaining medicines"
                >
                  {reconcileLoading ? 'Reconciling…' : 'Reconcile for Discharge'}
                </button>
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

  // Daily Medication Chart – schedule by session for the day
  if (screen === 'n-daily-med') {
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
            <DailyMedicationChart patient={selectedPatient} />
          </section>
        </div>
      </div>
    )
  }

  // Medication Sheet – list administrations with date range filters
  if (screen === 'n-med-sheet') {
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
            <MedicationSheet patient={selectedPatient} />
          </section>
        </div>
      </div>
    )
  }

  // Long Acting Med Reminder – automatic alerts for extended-duration medications (Q1W, Q2W, Q3W, Q4W)
  if (screen === 'n-reminder') {
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
            <div className="font-semibold mb-4">
              <span>Long Acting Med Reminder</span>
            </div>
            <LongActingMedReminderList patient={selectedPatient} daysAhead={7} />
          </section>
        </div>
      </div>
    )
  }

  // Other Services / Referral Services - Service Requests list
  // IP Services page: two cards – Service Request (left), IP Service (right)
  if (screen === 'n-ip-services') {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
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
        <div className="p-4 flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 flex-1">
            {/* Left card: Service Request – request a service (e.g. Transport) */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px] overflow-hidden min-w-0">
              <div className="font-semibold mb-2 flex items-center justify-between flex-shrink-0">
                <span>Service Request</span>
                <button
                  onClick={() => setShowServiceRequestModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                  title="New service request (IP Service Type)"
                >
                  +
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-3 flex-shrink-0">
                Request a hospital service (e.g. transport with nurse, transport only). Turn a request into an IP Service from the right card.
              </p>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
<ServiceRequestList
                patient={selectedPatient}
                refreshKey={serviceRequestRefreshKey}
                template_dt="IP Service Type"
                onCreateIPService={(sr) => {
                  setCreateIPServicePreFill({ serviceRequest: sr.name, patient: sr.patient })
                  setShowCreateIPServiceModal(true)
                }}
              />
              </div>
            </section>
            {/* Right card: IP Service – fulfill / create service (with or without a request) */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px] overflow-hidden min-w-0">
              <div className="font-semibold mb-2 flex items-center justify-between flex-shrink-0">
                <span>IP Service</span>
                <button
                  onClick={() => setShowCreateIPServiceModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                  title="New IP Service (with or without a request)"
                >
                  +
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-3 flex-shrink-0">
                Fulfill a service request or create an IP Service directly (admission, services, totals). Link to a Service Request optional.
              </p>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <IPServiceList
                  patient={selectedPatient}
                  refreshKey={ipServiceRefreshKey}
                />
              </div>
            </section>
          </div>
        </div>
        {showServiceRequestModal && (
          <CreateServiceRequestModal
            onClose={() => setShowServiceRequestModal(false)}
            onSuccess={() => {
              setServiceRequestRefreshKey((prev) => prev + 1)
              setShowServiceRequestModal(false)
            }}
            initialPatient={selectedPatient}
          />
        )}
        {showCreateIPServiceModal && (
          <CreateIPServiceModal
            onClose={() => {
              setShowCreateIPServiceModal(false)
              setCreateIPServicePreFill(null)
            }}
            onSuccess={() => {
              setIpServiceRefreshKey((prev) => prev + 1)
              setShowCreateIPServiceModal(false)
              setCreateIPServicePreFill(null)
            }}
            initialPatient={createIPServicePreFill?.patient ?? selectedPatient}
            initialServiceRequest={createIPServicePreFill?.serviceRequest}
            openInNewTab={false}
          />
        )}
      </div>
    )
  }

  if (screen === 'n-other' || screen === 'n-ref') {
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
              <span>{screen === 'n-ref' ? 'Referral Services' : 'Other Services'}</span>
              <button
                onClick={() => setShowServiceRequestModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Service Request"
              >
                +
              </button>
            </div>
            <ServiceRequestList patient={selectedPatient} refreshKey={serviceRequestRefreshKey} />
          </section>
        </div>
        {showServiceRequestModal && (
          <CreateServiceRequestModal
            onClose={() => setShowServiceRequestModal(false)}
            onSuccess={() => {
              setServiceRequestRefreshKey(prev => prev + 1)
              setShowServiceRequestModal(false)
            }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  // Sessions / Scheduler - Appointments
  if (screen === 'n-session') {
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
            <div className="font-semibold mb-4">Sessions / Scheduler (Appointments)</div>
            <AppointmentList patient={selectedPatient} />
          </section>
        </div>
      </div>
    )
  }

  // Morse Fall Scale
  if (screen === 'n-fall') {
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

  // Sleeping Pattern
  if (screen === 'n-sleep') {
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

  if (screen === 'n-patient-history') {
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

  // Show Discharge Form (list of discharges with + button)
  if (screen === 'n-discharge') {
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
        setShowDischargeModal(true)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch admission'
        toast.error(errorMessage)
      }
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
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Discharge Form / Procedure</span>
              <button
                onClick={handleCreateDischarge}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Discharge"
              >
                +
              </button>
            </div>
            <DischargeList patient={selectedPatient} key={dischargeRefreshKey} />
          </section>
        </div>
        {showDischargeModal && selectedAdmission && (
          <DischargeModal
            admission={selectedAdmission}
            onClose={() => {
              setShowDischargeModal(false)
              setSelectedAdmission(null)
            }}
            onSuccess={() => {
              setShowDischargeModal(false)
              setSelectedAdmission(null)
              setDischargeRefreshKey(prev => prev + 1)
              toast.success('Discharge completed successfully')
            }}
          />
        )}
      </div>
    )
  }

  // Show Diagnosis & Symptoms (from left sidebar "Diagnoses" -> screen=n-dx)
  if (screen === 'n-dx') {
    return (
      <DiagnosisSymptomsScreen
        selectedPatient={selectedPatient || ''}
        onPatientSelect={handlePatientSelect}
      />
    )
  }

  // Show Package Details – dashboard: available packages, active admission, assigned package (from Quotation)
  if (screen === 'n-package') {
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
            <div className="font-semibold mb-4">Package Detail</div>
            <PackageDetailView patient={selectedPatient} />
          </section>
        </div>
      </div>
    )
  }

  // Grooming Chart
  if (screen === 'n-grooming' || screen === 'n-groom') {
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
              <span>Grooming Chart</span>
              <button
                onClick={() => setShowGroomingModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="New Grooming Chart"
              >
                +
              </button>
            </div>
            <GroomingChartList
              patient={selectedPatient}
              refreshKey={groomingRefreshKey}
              onCreateNew={() => setShowGroomingModal(true)}
            />
          </section>
        </div>
        {showGroomingModal && (
          <CreateGroomingChartModal
            patient={selectedPatient}
            onClose={() => setShowGroomingModal(false)}
            onSuccess={() => {
              setShowGroomingModal(false)
              setGroomingRefreshKey((prev) => prev + 1)
              toast.success('Grooming chart saved')
            }}
          />
        )}
      </div>
    )
  }

  // OP Visit Note – reuse Patient Visit page
  if (screen === 'n-op') {
    return <PatientVisitPage />
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

      {/* OP / IP mode: list at top — hides once a patient is selected */}
      {(mode === 'OP' || mode === 'IP') && !selectedPatient ? (
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
          {/* Row 1: Given Medicines + Long Acting Med Reminder (primary nursing focus) */}
          <div className="grid gap-4 md:grid-cols-2 p-4">
            {/* Given Medicines */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                <span>Given Medicines</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReconcileGiven}
                    className="px-3 py-1 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
                    disabled={reconcileLoading}
                    title="Create Stock Entry for remaining medicines"
                  >
                    {reconcileLoading ? 'Reconciling…' : 'Reconcile for Discharge'}
                  </button>
                  <button
                    onClick={() => setShowGivenMedicineModal(true)}
                    className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                    title="Record Given Medicine"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <MedicineGivenList patient={selectedPatient} refreshKey={givenRefreshKey} />
              </div>
            </section>

            {/* Long Acting Med Reminder */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex-shrink-0">
                <span>Long Acting Med Reminder</span>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <LongActingMedReminderList patient={selectedPatient} daysAhead={7} />
              </div>
            </section>
          </div>

          {/* Row 2: Lab Test Reports + Service Requests */}
          <div className="grid gap-4 md:grid-cols-2 px-4 pb-4">
            {/* Lab Test Reports */}
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
                <LabTestList patient={selectedPatient} key={labTestRefreshKey} />
              </div>
            </section>

            {/* Service Requests */}
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
          </div>

          {/* Row 3: Prescription + Doctors Notes */}
          <div className="grid gap-4 md:grid-cols-2 px-4 pb-4">
            {/* Prescription */}
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

            {/* Doctors Notes */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                <span>Doctors Notes</span>
                <button
                  onClick={() => setShowDoctorNoteModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                  title="Add Doctors Note"
                >
                  +
                </button>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <ClinicalNotesList
                  patient={selectedPatient}
                  medicalRole="Doctor"
                  clinicalNoteType="Doctors Note"
                  key={clinicalNotesRefreshKey}
                />
              </div>
            </section>
          </div>

          {/* Row 4: Patient Summary + Warnings & Allergies */}
          <div className="grid gap-4 md:grid-cols-2 px-4 pb-4">
            {/* Patient info */}
            <div className="overflow-auto max-h-[400px]">
              <PatientSummaryCard patient={selectedPatient} />
            </div>

            {/* Warnings & Allergies */}
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
        <div className="grid gap-4 md:grid-cols-2 p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
            <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
              <span>IP Warning Messages / Medications / Allergy</span>
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
              <span>Lab Reports List & Status</span>
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
    </div>
  )
}



