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
    <div>
      <h1>Nurse Dashboard</h1>

      <section>
        <h2>First Screen</h2>
        <ul>
          {firstScreen.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Second Screen</h2>
        <ul>
          {secondScreen.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Other Screens</h2>
        <ol>
          {otherScreens.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
    </div>
  )
}



