import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PatientSearch } from '../components/patients/PatientSearch'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { LabTestReportsList } from '../components/labTests/LabTestReportsList'
import { CreateWarningMessageModal } from '../components/warnings/CreateWarningMessageModal'
import { CreateLabTestModal } from '../components/labTests/CreateLabTestModal'
import { AdmissionPage } from './Admission'
import { PatientVisitPage } from './PatientVisit'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'

const doctorNav = [
  { label: 'Admission', screen: 'admission' },
  { label: 'Patient Visits', screen: 'op' }
]

export const DoctorPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const patientFromUrl = searchParams.get('patient')
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(patientFromUrl || undefined)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [showLabTestModal, setShowLabTestModal] = useState(false)
  const [warningRefreshKey, setWarningRefreshKey] = useState(0)
  const [labTestRefreshKey, setLabTestRefreshKey] = useState(0)
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

  const handleNavClick = (screenId: string) => {
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.set('screen', screenId)
    setSearchParams(newSearchParams, { replace: true })
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

  return (
    <div className="flex flex-col">
      <header className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
        <PatientSearch
          selectedPatient={selectedPatient || ''}
          onPatientSelect={handlePatientSelect}
          patients={[]}
        />
        <nav className="flex gap-2 flex-wrap items-center justify-end">
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
          <UserMenu />
          <NotificationBell />
        </nav>
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
    </div>
  )
}


