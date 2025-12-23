const firstScreenLab = ['Pending Sample Collection', 'Pending Lab Testing']

const otherScreensLab = [
  'Patient History (Medical History)',
  'Lab Test Setup (Admin)',
  'Lab Test Request (By Doctor)',
  'Lab Test (Outsourced)',
  'Sample Collection (Lab Person)',
  'Lab Test & Result (Lab Person)',
  'Lab Test Review (Doctor)',
  'Lab Test Report History (Lab & Doctor)'
]

export const LabPage = () => {
  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="bg-primary text-white px-4 py-3 rounded-lg flex items-center justify-between">
        <h1 className="font-semibold text-lg">Lab User Dashboard</h1>
        <span className="text-xs opacity-80">Branch: Main · Dummy</span>
      </header>

      <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <h2 className="font-semibold mb-2">First Screen</h2>
        <ul className="list-disc list-inside text-sm text-slate-800">
          {firstScreenLab.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <h2 className="font-semibold mb-3">Other Screens</h2>
        <ol className="list-decimal list-inside space-y-1 text-sm text-slate-800">
          {otherScreensLab.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
    </div>
  )
}



