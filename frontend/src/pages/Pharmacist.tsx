const firstScreenPharma = ['Medicine Expiry Alert']

const otherScreensPharma = [
  'Pending Medication Requests',
  'IP Medication Orders',
  'Given Medicines History',
  'Stock Overview (dummy)'
]

export const PharmacistPage = () => {
  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="bg-primary text-white px-4 py-3 rounded-lg flex items-center justify-between">
        <h1 className="font-semibold text-lg">Pharmacist Dashboard</h1>
        <span className="text-xs opacity-80">Branch: Main · Dummy</span>
      </header>

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
  )
}



