import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PatientSearch } from '../components/patients/PatientSearch'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { LabTestReportsList } from '../components/labTests/LabTestReportsList'
import { AdmissionPage } from './Admission'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'

const nurseNav = [
  { label: 'Admission Register', screen: 'n-reg' }
]

export const NursePage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(undefined)
  const screen = searchParams.get('screen')

  const handleNavClick = (screenId: string) => {
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.set('screen', screenId)
    setSearchParams(newSearchParams, { replace: true })
  }

  // Show Admission page when screen=n-reg or screen=admission
  if (screen === 'n-reg' || screen === 'admission') {
    return <AdmissionPage />
  }

  return (
    <div className="flex flex-col">
      <header className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
        <PatientSearch
          selectedPatient={selectedPatient || ''}
          onPatientSelect={(patient) => setSelectedPatient(patient || undefined)}
          patients={[]}
        />
        <nav className="flex gap-2 flex-wrap items-center justify-end">
          {nurseNav.map((item) => (
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
            <span>IP Warning Messages / Medications / Allergy</span>
            <button
              onClick={() => {
                // TODO: Open create warning message modal
                console.log('Add warning message')
              }}
              className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
              title="Add Warning Message"
            >
              +
            </button>
          </div>
          <WarningMessagesList patient={selectedPatient} />
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="font-semibold mb-4 flex items-center justify-between">
            <span>Lab Reports List & Status</span>
            <button
              onClick={() => {
                // TODO: Open create lab test report modal
                console.log('Add lab test report')
              }}
              className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
              title="Add Lab Test Report"
            >
              +
            </button>
          </div>
          <LabTestReportsList patient={selectedPatient} pendingReview={true} />
        </section>
      </div>
    </div>
  )
}



