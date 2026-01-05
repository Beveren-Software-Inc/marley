const adminSections = [
  'Overall Admissions Overview',
  'Branch Switch / Selection',
  'Doctor Activity Summary',
  'Nurse Activity Summary',
  'Lab Workload',
  'Pharmacy Workload',
  'Alerts & Warnings Summary'
]

export const AdminPage = () => {
  return (
    <div className="flex flex-col">
      <header className="bg-primary text-white px-4 py-3 flex items-center justify-between border-b border-white/20">
        <h1 className="font-semibold text-lg">Admin / Overall Dashboard</h1>
        <span className="text-xs opacity-80">System Overview · Dummy</span>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <h2 className="font-semibold mb-3">Key Panels</h2>
          <ul className="list-disc list-inside space-y-1 text-sm text-slate-800">
            {adminSections.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}



