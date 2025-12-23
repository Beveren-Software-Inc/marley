import { useState } from 'react'
import { dummyPatients } from '../config/patients'

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
  const [selectedPatient, setSelectedPatient] = useState('John Doe')
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOpen, setPatientOpen] = useState(false)

  return (
    <div className="flex flex-col">
      <header className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center gap-3 bg-primary text-white px-4 py-3">
        <div className="w-full max-w-xl">
          <div className="relative">
            <input
              value={patientQuery}
              onChange={(e) => {
                setPatientQuery(e.target.value)
                setPatientOpen(true)
              }}
              onFocus={() => setPatientOpen(true)}
              placeholder={selectedPatient || 'Search patient...'}
              className="w-full rounded-md border border-primary/40 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-white focus:border-white"
            />
            {patientOpen && (
              <div className="absolute z-40 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-56 overflow-auto text-slate-900">
                {dummyPatients
                  .filter((p) => p.toLowerCase().includes(patientQuery.toLowerCase()))
                  .map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                      onClick={() => {
                        setSelectedPatient(p)
                        setPatientQuery('')
                        setPatientOpen(false)
                      }}
                    >
                      {p}
                    </button>
                  ))}
                {dummyPatients.filter((p) => p.toLowerCase().includes(patientQuery.toLowerCase())).length === 0 && (
                  <div className="px-3 py-2 text-xs text-slate-500">No patients match your search.</div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end text-xs opacity-80">
          <span>Branch: Main · Dummy</span>
        </div>
      </header>

      <div className="flex flex-col gap-4 p-4">
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
    </div>
  )
}



