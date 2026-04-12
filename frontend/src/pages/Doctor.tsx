import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ADHDAssessmentList } from '../components/adhd/AdhdAssessmentList'
import { CreateADHDAssessmentModal } from '../components/adhd/CreateADHDAssessmentModal'
import { AdmissionList } from '../components/admissions/AdmissionList'
import { DischargeModal } from '../components/admissions/DischargeModal'
import { SuicidalPatientAssessmentModal } from '../components/admissions/SuicidalPatientAssessmentModal'
import { AppointmentList } from '../components/appointments/AppointmentList'
import { CreateAppointmentModal } from '../components/appointments/CreateAppointmentModal'
import { ClinicalNotesList } from '../components/clinicalNotes/ClinicalNotesList'
import { CreateClinicalNoteModal } from '../components/clinicalNotes/CreateClinicalNoteModal'
import { SuicideRiskAssessmentList } from '../components/clinicalSuicide/ClinicalSuicideRiskAssessmentList'
import { CreateSuicideRiskAssessmentModal } from '../components/clinicalSuicide/CreateClinicalSuicideRiskAssessmentModal'
import { CreateDepressionAssessmentModal } from '../components/depression/CreateDepressionAssessmentModal'
import { DepressionAssessmentList } from '../components/depression/DepressionAssessmentList'
import { DiagnosisSymptomsScreen } from '../components/diagnosis/DiagnosisSymptomsScreen'
import { PatientDiagnosisList } from '../components/diagnosis/PatientDiagnosisList'
import { PatientDiagnosisModal } from '../components/diagnosis/PatientDiagnosisModal'
import { DischargeList } from '../components/discharges/DischargeList'
import { ECTDashboard } from '../components/ect/ECTDashboard'
import { ECTChart } from '../components/ect/ECTChart'
import { EnvironmentalChecklistList } from '../components/environmental/EnvironmentalChecklistList'
import { CreateGAD7AssessmentModal } from '../components/gad7/CreateGAD7AssessmentModal'
import { GAD7AssessmentList } from '../components/gad7/GAD7AssessmentList'
import { CreateHomicideRiskAssessmentModal } from '../components/homicide/CreateHomicideRiskAssessmentModal'
import { HomicideRiskAssessmentList } from '../components/homicide/HomicideRiskAssessmentList'
import { IOPDayListWithHeader } from '../components/iop/IOPDayList'
import { IOPEnrollmentListWithHeader } from '../components/iop/IOPEnrollmentList'
// import { CreateLabTestModal } from '../components/labTests/CreateLabTestModal'
import { LabTestList } from '../components/labTests/LabTestList'
import { MedicalHistoryView } from '../components/medicalHistory/MedicalHistoryView'
import { CreateMedicineGivenModal } from '../components/medication/CreateMedicineGivenModal'
import { LongActingMedicineList } from '../components/medication/LongActingMedicineList'
import { MedicineGivenList } from '../components/medication/MedicineGivenList'
import { ReceptionLongActingMedicineList } from '../components/medication/ReceptionLongActingMedicineList'
import { CreateMoodDisorderAssessmentModal } from '../components/mood_disorder/CreateMoodDisorderAssessmentModal'
import { MoodDisorderAssessmentList } from '../components/mood_disorder/MoodDisorderAssessmentList'
import { CreateMorseFallScaleModal } from '../components/morse/CreateMorseFallScaleModal'
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
import { PatientSearch } from '../components/patients/PatientSearch'
import { PatientSummaryCard } from '../components/patients/PatientSummaryCard'
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
import { CreateDoctorServiceModal } from '../components/services/CreateDoctorServiceModal'
import { DoctorServiceDetailsTable } from '../components/services/DoctorServiceDetailsTable'
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
import { useCareContext } from '../providers/CareContextProvider'
import { draftSavedAt, hasDischargeDraft } from '../services/dischargeDraft'
import { getPatientActiveAdmission } from '../services/inpatientRecords'
import { AdmissionPage } from './Admission'
import { PatientVisitPage } from './PatientVisit'


const CreateLabRequestModal = ({ 
  onClose, 
  onSuccess, 
  initialPatient 
}: { 
  onClose: () => void; 
  onSuccess: () => void; 
  initialPatient?: string 
}) => {
  return (
    <CreateServiceRequestModal
      onClose={onClose}
      onSuccess={onSuccess}
      initialPatient={initialPatient}
      initialTemplate="Lab Test Template"
    />
  )
}

export const DoctorPage = () => {
  const { mode, activeVisit, activeAdmission, selectedPatient: globalPatient, setSelectedPatient: setGlobalPatient } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const patientFromUrl = searchParams.get('patient')
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(() => patientFromUrl || globalPatient || undefined)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [showLabTestModal, setShowLabTestModal] = useState(false)
  const [showDischargeModal, setShowDischargeModal] = useState(false)
  const [showCreatePatientModal , setShowCreatePatientModal] = useState(false)
  const [patientRefreshKey, setPatientRefreshKey] = useState(0)
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
  const [showDoctorNoteModal, setShowDoctorNoteModal] = useState(false)
  const [showDoctorOrderModal, setShowDoctorOrderModal] = useState(false)
  const [showNursingNoteModal, setShowNursingNoteModal] = useState(false)
  const [showNutritionNoteModal, setShowNutritionNoteModal] = useState(false)
  const [showTherapistNoteModal, setShowTherapistNoteModal] = useState(false)
  const [showDoctorProgressNoteModal, setShowDoctorProgressNoteModal] = useState(false)
  const [showPsychologistNoteModal, setShowPsychologistNoteModal] = useState(false)
  const [showVitalSignModal, setShowVitalSignModal] = useState(false)
  const [vitalSignsRefreshKey, setVitalSignsRefreshKey] = useState(0)
  const [showSleepingPatternModal, setShowSleepingPatternModal] = useState(false)
  const [sleepingPatternRefreshKey, setSleepingPatternRefreshKey] = useState(0)
  const [showMorseFallModal, setShowMorseFallModal] = useState(false)
  const [morseFallRefreshKey, setMorseFallRefreshKey] = useState(0)
  const [showCreateNurseTaskModal, setShowCreateNurseTaskModal] = useState(false)
  const [longActingRefreshKey] = useState(0)
  const [showPhysicalExamModal, setShowPhysicalExamModal] = useState(false)
  const [physicalExamRefreshKey, setPhysicalExamRefreshKey] = useState(0)
  const [showPatientHistoryModal, setShowPatientHistoryModal] = useState(false)
  const [patientHistoryRefreshKey, setPatientHistoryRefreshKey] = useState(0)
  const screen = searchParams.get('screen')
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
// const [selectedAssessment, setSelectedAssessment] = useState<SuicidalAssessment | null>(null)

const [suicidalRefreshKey, setSuicidalRefreshKey] = useState(0)
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

  // Show Admission page when screen=admission
  if (screen === 'admission') {
    return <AdmissionPage />
  }

  // Show Patient Visit page when screen=op
  if (screen === 'op') {
    return <PatientVisitPage initialPatient={selectedPatient} />
  }


   if (screen === 'suicide') {
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
          <SuicidalAssessmentList
            patient={selectedPatient}
            admission={activeAdmission}
            onAddNew={() => setShowSuicidalModal(true)}
            // onViewDetails={(assessment) => setSelectedAssessment(assessment)}
            key={suicidalRefreshKey}
          />
        </section>
      </div>

      {/* Create New Assessment Modal */}
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

      {/* View Details SlideOver */}
     
    </div>
  )
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
          <ECTDashboard selectedPatient={selectedPatient} />
        </div>
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
                onClick={() => setShowMorseFallModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Create Morse Fall Scale"
              >
                +
              </button>
            </div>
            <MorseFallScaleList patient={selectedPatient} refreshKey={morseFallRefreshKey} />
          </section>
        </div>
        {showMorseFallModal && (
          <CreateMorseFallScaleModal
            patient={selectedPatient}
            defaultAdmission={activeAdmission}
            onClose={() => setShowMorseFallModal(false)}
            onCreated={() => { setShowMorseFallModal(false); setMorseFallRefreshKey((k) => k + 1) }}
          />
        )}
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

  if (screen === 'patients') {
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
              <span>Patients</span>
              <button
                onClick={() => setShowCreatePatientModal(true)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-white text-xs font-medium bg-primary hover:bg-primary/90 transition-colors"
                title="Create new patient"
              >
                + New Patient
              </button>
            </div>
 
            {/* <PatientList refreshKey={patientRefreshKey} /> */}
                        <PatientList refreshKey={patientRefreshKey} />

          </section>
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

        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <ADHDAssessmentList
              refreshKey={adhdRefreshKey}
              onCreateNew={() => setShowCreateADHDModal(true)}
            />
          </section>
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

      <div className="p-4">
        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <DepressionAssessmentList
            refreshKey={depressionRefreshKey}
            onCreateNew={() => setShowCreateDepressionModal(true)}
          />
        </section>
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


if (screen === 'mood') {
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
          <MoodDisorderAssessmentList
            refreshKey={moodRefreshKey}
            onCreateNew={() => setShowCreateMoodModal(true)}
          />
        </section>
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

if (screen === 'gad7') {
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
          <GAD7AssessmentList
            refreshKey={gad7RefreshKey}
            onCreateNew={() => setShowCreateGAD7Modal(true)}
          />
        </section>
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


if (screen === 'phq9') {
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
          <PHQ9AssessmentList
            refreshKey={phq9RefreshKey}
            onCreateNew={() => setShowCreatePHQ9Modal(true)}
          />
        </section>
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

if (screen === 'clinical-suicide-risk') {
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
          <SuicideRiskAssessmentList
            refreshKey={suicideRiskRefreshKey}
            onCreateNew={() => setShowCreateSuicideRiskModal(true)}
          />
        </section>
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

if (screen === 'homicide-risk') {
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
          <HomicideRiskAssessmentList
            refreshKey={homicideRiskRefreshKey}
            onCreateNew={() => setShowCreateHomicideRiskModal(true)}
          />
        </section>
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

if (screen === 'ybocs') {
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
          <YBOCSAssessmentList
            refreshKey={ybocsRefreshKey}
            onCreateNew={() => setShowCreateYBOCSModal(true)}
          />
        </section>
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

if (screen === 'ymrs') {
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
          <YMRSAssessmentList
            refreshKey={ymrsRefreshKey}
            onCreateNew={() => setShowCreateYMRSModal(true)}
          />
        </section>
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

if (screen === 'panss') {
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
          <PANSSAssessmentList
            refreshKey={panssRefreshKey}
            onCreateNew={() => setShowCreatePANSSModal(true)}
          />
        </section>
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


if (screen === 'single-prescription') {
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
          <RxPage 
            // inpatientRecordId={activeInpatientRecordId}  // For IP admissions
            // patientEncounterId={activePatientEncounterId} // For OP visits
          />
        </section>
      </div>
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

            {mode === 'IP' && activeAdmission && (
              <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
                <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                  <span>ECT Chart</span>
                </div>
                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                  <ECTChart patient={selectedPatient} />
                </div>
              </section>
            )}

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

            {/* Card 4: Diagnosis detail */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                <span>Diagnosis Detail</span>
                <button
                  onClick={() => setShowDiagnosisModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                  title="Add / Edit Diagnosis"
                >
                  +
                </button>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <PatientDiagnosisList
                  patient={selectedPatient}
                  refreshKey={diagnosisRefreshKey}
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

          {/* Card: Patient Visits — OP mode only */}
          {mode === 'OP' && (
            <div className="px-4 pb-4">
              <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
                <div className="font-semibold mb-4 flex-shrink-0">
                  <span>Patient Visits (OP)</span>
                </div>
                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                  <PatientVisitList patient={selectedPatient} />
                </div>
              </section>
            </div>
          )}

          {/* Card: Admissions + Discharges — IP mode only */}
          {mode === 'IP' && (
            <>
              {/* <div className="px-4 pb-4">
                <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
                  <div className="font-semibold mb-4 flex-shrink-0">
                    <span>Admissions (IP)</span>
                  </div>
                  <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                    <AdmissionList patient={selectedPatient} />
                  </div>
                </section>
              </div> */}

              <div className="px-4 pb-4">
                <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
                  <div className="font-semibold mb-4 flex-shrink-0">
                    <span>Admission & Discharges</span>
                  </div>
                  <div
                    className="overflow-x-auto overflow-y-auto flex-1 min-h-0"
                    style={{ scrollbarWidth: 'thin' }}
                  >
                    <DischargeList patient={selectedPatient} key={dischargeRefreshKey} />
                  </div>
                </section>
              </div>
            </>
          )}

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
