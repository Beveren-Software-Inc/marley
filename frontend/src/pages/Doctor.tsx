import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PatientSearch } from '../components/patients/PatientSearch'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { LabTestReportsList } from '../components/labTests/LabTestReportsList'
import { AdmissionPage } from './Admission'
import { PatientVisitPage } from './PatientVisit'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'

const doctorNav = ['Admission', 'Patient Visits']

export const DoctorPage = () => {
  const [searchParams] = useSearchParams()
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(undefined)
  const screen = searchParams.get('screen')

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
      <header className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center gap-3 bg-primary text-white px-4 py-3">
        <PatientSearch
          selectedPatient={selectedPatient || ''}
          onPatientSelect={(patient) => setSelectedPatient(patient || undefined)}
          patients={[]}
        />
        <nav className="flex gap-2 flex-wrap items-center justify-end">
          {doctorNav.map((item) => (
            <span key={item} className="px-3 py-1 rounded-md bg-white/15 text-sm">
              {item}
            </span>
          ))}
          <UserMenu />
          <NotificationBell />
        </nav>
      </header>

      <div className="grid gap-4 md:grid-cols-2 p-4">
        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="font-semibold mb-4">Warning Messages (Allergies etc.)</div>
          <WarningMessagesList patient={selectedPatient} />
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="font-semibold mb-4">Lab Test Reports Pending for Review</div>
          <LabTestReportsList patient={selectedPatient} pendingReview={true} />
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
    </div>
  )
}


