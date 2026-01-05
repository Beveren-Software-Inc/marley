import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PatientSearch } from '../components/patients/PatientSearch'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { LabTestReportsList } from '../components/labTests/LabTestReportsList'
import { LabTestList } from '../components/labTests/LabTestList'
import { ECTDetailsList } from '../components/ect/ECTDetailsList'
import { ClinicalNotesList } from '../components/clinicalNotes/ClinicalNotesList'
import { ObservationList } from '../components/observations/ObservationList'
import { VitalSignsList } from '../components/vitalSigns/VitalSignsList'
import { CreateObservationModal } from '../components/observations/CreateObservationModal'
import { MedicalHistoryView } from '../components/medicalHistory/MedicalHistoryView'
import { PackageDetailsList } from '../components/packageDetails/PackageDetailsList'
import { DischargeList } from '../components/discharges/DischargeList'
import { CreateWarningMessageModal } from '../components/warnings/CreateWarningMessageModal'
import { CreateLabTestModal } from '../components/labTests/CreateLabTestModal'
import { DischargeModal } from '../components/admissions/DischargeModal'
import { AdmissionPage } from './Admission'
import { PatientVisitPage } from './PatientVisit'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'
import { getPatientActiveAdmission } from '../services/inpatientRecords'
import { toast } from '../hooks/useToast'

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
  const [selectedAdmission, setSelectedAdmission] = useState<{ name: string; patient: string; patient_name?: string } | null>(null)
  const [warningRefreshKey, setWarningRefreshKey] = useState(0)
  const [labTestRefreshKey, setLabTestRefreshKey] = useState(0)
  const [observationRefreshKey, setObservationRefreshKey] = useState(0)
  const [dischargeRefreshKey, setDischargeRefreshKey] = useState(0)
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
        <header className="flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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
            <div className="font-semibold mb-4">ECT Details</div>
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
        <header className="flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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
            <div className="font-semibold mb-4">Doctors Note</div>
            <ClinicalNotesList 
              patient={selectedPatient} 
              medicalRole="Doctor"
              noteType="Note"
            />
          </section>
        </div>
      </div>
    )
  }

  // Show Doctors Order (Clinical Note with Clinical Note Type = Order)
  if (screen === 'dos') {
    return (
      <div className="flex flex-col">
        <header className="flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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

  // Show Laboratory (Lab Tests)
  if (screen === 'lab') {
    return (
      <div className="flex flex-col">
        <header className="flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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
            <div className="font-semibold mb-4">Laboratory</div>
            <LabTestList patient={selectedPatient} />
          </section>
        </div>
      </div>
    )
  }

  // Show Psychologist Notes (Clinical Note with Medical Role = Psychologists)
  if (screen === 'psy-n') {
    return (
      <div className="flex flex-col">
        <header className="flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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
            <div className="font-semibold mb-4">Patient Psychologist Notes</div>
            <ClinicalNotesList 
              patient={selectedPatient} 
              medicalRole="Psychologists"
            />
          </section>
        </div>
      </div>
    )
  }

  // Show Therapist Notes (Clinical Note with Medical Role = Physiotherapist or Therapist)
  if (screen === 'ther') {
    return (
      <div className="flex flex-col">
        <header className="flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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
            <div className="font-semibold mb-4">Therapist Note</div>
            <ClinicalNotesList 
              patient={selectedPatient} 
              medicalRole="Physiotherapist"
            />
          </section>
        </div>
      </div>
    )
  }

  // Show Nursing Notes (Clinical Note with Medical Role = Nurse)
  if (screen === 'nurse') {
    return (
      <div className="flex flex-col">
        <header className="flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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

  // Show Observation
  if (screen === 'obs') {
    return (
      <div className="flex flex-col">
        <header className="flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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
        <header className="flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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
            <div className="font-semibold mb-4">Vital Signs</div>
            <VitalSignsList patient={selectedPatient} />
          </section>
        </div>
      </div>
    )
  }

  // Show Nutritionist Notes (Clinical Note with Medical Role = Nutritionist)
  if (screen === 'nut') {
    return (
      <div className="flex flex-col">
        <header className="flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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
            <div className="font-semibold mb-4">Nutritionist Notes</div>
            <ClinicalNotesList 
              patient={selectedPatient} 
              medicalRole="Nutritionist"
            />
          </section>
        </div>
      </div>
    )
  }

  // Show Medical History
  if (screen === 'mh') {
    return (
      <div className="flex flex-col">
        <header className="flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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
        <header className="flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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
            <div className="font-semibold mb-4">Package Details</div>
            <PackageDetailsList patient={selectedPatient} />
          </section>
        </div>
      </div>
    )
  }

  // Show Discharge Form (list of discharges with + button)
  if (screen === 'df') {
    return (
      <div className="flex flex-col">
        <header className="flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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
      <header className="flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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

      <div className="grid gap-4 md:grid-cols-2 p-4">
        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="font-semibold mb-4 flex items-center justify-between">
            <span>Warning Messages (Allergies etc.)</span>
            <button
              onClick={() => setShowWarningModal(true)}
              className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
              title="Add Warning Message"
            >
              +
            </button>
          </div>
          <WarningMessagesList patient={selectedPatient} key={warningRefreshKey} />
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="font-semibold mb-4 flex items-center justify-between">
            <span>Lab Test Reports Pending for Review</span>
            <button
              onClick={() => setShowLabTestModal(true)}
              className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
              title="Add Lab Test Report"
            >
              +
            </button>
          </div>
          <LabTestReportsList patient={selectedPatient} pendingReview={true} key={labTestRefreshKey} />
        </section>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm mx-4 mb-4">
        <div className="font-semibold mb-2">Other Screens (OP / IP actions)</div>
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1 bg-blue-50 text-primary border border-blue-100 rounded-full text-sm">
            Appointment with OP
          </span>
          <span className="px-3 py-1 bg-blue-50 text-primary border border-blue-100 rounded-full text-sm">
            New IP Admission
          </span>
          <span className="px-3 py-1 bg-blue-50 text-primary border border-blue-100 rounded-full text-sm">
            Lab Test (Recommend / Review)
          </span>
        </div>
      </section>

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
    </div>
  )
}


