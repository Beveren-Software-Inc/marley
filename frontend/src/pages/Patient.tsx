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
    <div className="flex flex-col gap-4 p-4">
      <header className="bg-primary text-white px-4 py-3 rounded-lg flex items-center justify-between">
        <h1 className="font-semibold text-lg">Patient Dashboard</h1>
        <span className="text-xs opacity-80">Welcome, Dummy Patient</span>
      </header>

      <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <h2 className="font-semibold mb-3">My Information</h2>
        <ul className="list-disc list-inside space-y-1 text-sm text-slate-800">
          {patientSections.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}



