import { useState } from 'react'
import { dummyPatients } from '../config/patients'
import { PatientSearch } from '../components/patients/PatientSearch'

const firstScreen = ['IP Warning Messages', 'Medications', 'Allergy']
const secondScreen = ['Lab Reports List & Status']

const otherScreens = [
  'Medication',
  'Given Medicines',
  'Doctors Notes',
  'Diagnoses',
  'Warning Messages',
  'Psychologist Order',
  'Nutritionist Notes',
  'Psychologist Notes',
  'Therapist Notes',
  'Nursing Notes',
  'Laboratory',
  'OP Visit Note',
  'TPR/Vital Signs',
  'ECT Form',
  'Observation Level',
  'IP Medication',
  'IP Services (Transport with Nurse / Transport only etc.)',
  'Referral Services',
  'Daily Medication Chart - Nurse',
  'Medication Sheet (Report) - Update Status - Nurse',
  'Reminder for long acting medicines',
  'Morse Fall Scale',
  'Patient Assessment',
  'Grooming Chart (Daily)',
  'Sleeping Pattern (Daily)',
  'Mental Status (Daily)',
  'Environmental Checklist (Daily)',
  'Discharge Form',
  'Discharge Procedure / Checklists',
  'Other services',
  'PRN',
  'Sick Leave',
  'Package Detail',
  'Session / Session Scheduler',
  'IP Admission',
  'IP Admission Detail',
  'Admission Register (Subject, History Form, Risk Assessment Checklist, Visitors Allowed, Physical Examination, Signature)'
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

      <div className="flex flex-col gap-4 p-4">
        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <h2 className="font-semibold mb-2">First Screen</h2>
          <ul className="list-disc list-inside text-sm text-slate-800">
            {firstScreen.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <h2 className="font-semibold mb-2">Second Screen</h2>
          <ul className="list-disc list-inside text-sm text-slate-800">
            {secondScreen.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <h2 className="font-semibold mb-3">Other Screens</h2>
          <ol className="list-decimal list-inside space-y-1 text-sm text-slate-800">
            {otherScreens.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}



