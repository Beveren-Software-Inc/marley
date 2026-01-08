import { useState } from 'react'
import { dummyPatients } from '../config/patients'
import { PatientSearch } from '../components/patients/PatientSearch'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'

const firstScreenPharma = ['Medicine Expiry Alert']

const otherScreensPharma = [
  'Pending Medication Requests',
  'IP Medication Orders',
  'Given Medicines History',
  'Stock Overview (dummy)'
]

export const PharmacistPage = () => {
  const [selectedPatient, setSelectedPatient] = useState<string>('John Doe')

  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient || '')
  }

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
        <div className="flex-1 min-w-0">
          <PatientSearch
            selectedPatient={selectedPatient}
            onPatientSelect={handlePatientSelect}
            patients={dummyPatients}
          />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <UserMenu />
          <NotificationBell />
        </div>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <h2 className="font-semibold mb-2">First Screen</h2>
          <ul className="list-disc list-inside text-sm text-slate-800">
            {firstScreenPharma.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <h2 className="font-semibold mb-3">Other Screens</h2>
          <ul className="list-disc list-inside space-y-1 text-sm text-slate-800">
            {otherScreensPharma.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}



