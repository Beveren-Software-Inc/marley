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
  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="bg-primary text-white px-4 py-3 rounded-lg flex items-center justify-between">
        <h1 className="font-semibold text-lg">Nurse Dashboard</h1>
        <span className="text-xs opacity-80">Branch: Main · Dummy</span>
      </header>

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
  )
}



