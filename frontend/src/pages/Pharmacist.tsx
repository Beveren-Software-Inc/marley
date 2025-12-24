import { useState } from 'react'
import { dummyPatients } from '../config/patients'
import { PatientSearch } from '../components/patients/PatientSearch'

const firstScreenPharma = ['Medicine Expiry Alert']

const otherScreensPharma = [
  'Pending Medication Requests',
  'IP Medication Orders',
  'Given Medicines History',
  'Stock Overview (dummy)'
]

export const PharmacistPage = () => {
  const [selectedPatient, setSelectedPatient] = useState('John Doe')

  return (
    <div className="flex flex-col">
      <header className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center gap-3 bg-primary text-white px-4 py-3">
        <PatientSearch
          selectedPatient={selectedPatient}
          onPatientSelect={setSelectedPatient}
          patients={dummyPatients}
        />
        <div className="flex justify-end text-xs opacity-80">
          <span>Branch: Main · Dummy</span>
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



