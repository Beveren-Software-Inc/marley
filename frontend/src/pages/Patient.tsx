const patientSections = [
  'My Demographics & Contact',
  'My Appointments (OP & IP)',
  'My Lab Results',
  'My Medications',
  'My Vital Signs History',
  'My Admissions & Discharge Summaries'
]

export const PatientPage = () => {
  return (
    <div>
      <h1>Patient Dashboard</h1>
      <ul>
        {patientSections.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  )
}



