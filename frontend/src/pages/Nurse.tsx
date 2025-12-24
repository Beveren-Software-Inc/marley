import { useState } from 'react'
import { dummyPatients } from '../config/patients'
import { PatientSearch } from '../components/patients/PatientSearch'

const warningMessages = [
  { id: 1, patient: 'John Doe', type: 'Allergy', details: 'Penicillin' },
  { id: 2, patient: 'Jane Smith', type: 'Medication Alert', details: 'High risk medication' },
  { id: 3, patient: 'Mary Johnson', type: 'Suicide Risk', details: 'High risk flag' }
]

const labReports = [
  { id: 'LAB-0001', patient: 'John Doe', test: 'CBC', status: 'Pending Review' },
  { id: 'LAB-0002', patient: 'Jane Smith', test: 'LFT', status: 'Completed' },
  { id: 'LAB-0003', patient: 'Mary Johnson', test: 'Blood Culture', status: 'In Progress' }
]

export const NursePage = () => {
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

      <div className="grid gap-4 md:grid-cols-2 p-4">
        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="font-semibold mb-2">IP Warning Messages / Medications / Allergy</div>
          <ul className="space-y-2">
            {warningMessages.map((w) => (
              <li key={w.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                <div className="font-semibold">{w.patient}</div>
                <div className="text-sm text-slate-600">{w.type}</div>
                <div className="text-sm text-slate-700">{w.details}</div>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="font-semibold mb-2">Lab Reports List & Status</div>
          <ul className="space-y-2">
            {labReports.map((lab) => (
              <li key={lab.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                <div className="font-semibold">
                  {lab.id} · {lab.test}
                </div>
                <div className="text-sm text-slate-600">{lab.patient}</div>
                <div className="text-sm text-slate-700">Status: {lab.status}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      
    </div>
  )
}



