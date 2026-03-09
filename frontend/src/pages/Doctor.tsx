import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PatientSearch } from '../components/patients/PatientSearch'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { LabTestList } from '../components/labTests/LabTestList'
import { ECTDetailsList } from '../components/ect/ECTDetailsList'
import { ClinicalNotesList } from '../components/clinicalNotes/ClinicalNotesList'
import { ObservationList } from '../components/observations/ObservationList'
import { VitalSignsList } from '../components/vitalSigns/VitalSignsList'
import { CreateObservationModal } from '../components/observations/CreateObservationModal'
import { MedicalHistoryView } from '../components/medicalHistory/MedicalHistoryView'
import { PackageDetailsList } from '../components/packageDetails/PackageDetailsList'
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
import { CreateMedicineGivenModal } from '../components/medication/CreateMedicineGivenModal'
import { MedicineGivenList } from '../components/medication/MedicineGivenList'
import { reconcileDischargeMedicines } from '../services/medicineGiven'
import { CreateVitalSignModal } from '../components/vitalSigns/CreateVitalSignModal'

const doctorNav = [
  { label: 'Admission', screen: 'admission' },
  { label: 'Patient Visits', screen: 'op' },
  { label: 'Discharge', screen: 'discharge' }
]

export const DoctorPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const patientFromUrl = searchParams.get('patient')
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(patientFromUrl || undefined)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [showLabTestModal, setShowLabTestModal] = useState(false)
  const [showDischargeModal, setShowDischargeModal] = useState(false)
  const [showObservationModal, setShowObservationModal] = useState(false)
  const [showDiagnosisModal, setShowDiagnosisModal] = useState(false)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [selectedAdmission, setSelectedAdmission] = useState<{ name: string; patient: string; patient_name?: string } | null>(null)
  const [warningRefreshKey, setWarningRefreshKey] = useState(0)
  const [labTestRefreshKey, setLabTestRefreshKey] = useState(0)
  const [observationRefreshKey, setObservationRefreshKey] = useState(0)
  const [dischargeRefreshKey, setDischargeRefreshKey] = useState(0)
  const [diagnosisRefreshKey, setDiagnosisRefreshKey] = useState(0)
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

  const handleNavClick = async (screenId: string) => {
    if (screenId === 'discharge') {
      // Handle discharge button - need to check if patient has active admission
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
    } else {
      const newSearchParams = new URLSearchParams(searchParams)
      newSearchParams.set('screen', screenId)
      setSearchParams(newSearchParams, { replace: true })
    }
  }

  const handleCreateDischarge = async () => {
    // Handle create discharge from Discharge Form screen
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

  // Show Admission page when screen=admission
  if (screen === 'admission') {
    return <AdmissionPage />
  }

  // Show Patient Visit page when screen=op
  if (screen === 'op') {
    return <PatientVisitPage />
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
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>ECT Details</span>
              <button
                onClick={() => {
                  if (!selectedPatient) {
                    toast.error('Please select a patient first')
                    return
                  }
                  window.open(
                    `/app/ect-details/new?patient=${encodeURIComponent(selectedPatient)}`,
                    '_blank'
                  )
                }}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add ECT Detail"
              >
                +
              </button>
            </div>
            <ECTDetailsList patient={selectedPatient} />
          </section>
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

  // Show Package Details
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
            <PackageDetailsList patient={selectedPatient} />
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
        <nav className="flex gap-2 flex-shrink-0 items-center">
          {doctorNav.map((item) => (
            <button
              key={item.screen}
              onClick={() => handleNavClick(item.screen)}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                screen === item.screen
                  ? 'bg-white text-primary'
                  : 'bg-white/15 hover:bg-white/25'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3 flex-shrink-0">
          <UserMenu />
          <NotificationBell />
        </div>
      </header>

      {selectedPatient ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 p-4">
            {/* Card 1: Patient info */}
            <div className="overflow-auto max-h-[400px]">
              <PatientSummaryCard patient={selectedPatient} />
            </div>

            {/* Card 2: Warnings & Allergies */}
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

          <div className="grid gap-4 md:grid-cols-2 px-4 pb-4">
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
                <LabTestList patient={selectedPatient} defaultStatus="Pending Review" key={labTestRefreshKey} />
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
          onClose={() => {
            setShowDischargeModal(false)
            setSelectedAdmission(null)
          }}
          onSuccess={() => {
            setShowDischargeModal(false)
            setSelectedAdmission(null)
            toast.success('Discharge completed successfully')
          }}
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
