import { useState } from 'react'

const warningMessages = [
  { id: 1, patient: 'John Doe', type: 'Allergy', details: 'Penicillin' },
  { id: 2, patient: 'Jane Smith', type: 'Suicide Risk', details: 'High risk flag' }
]

const pendingLabs = [
  { id: 'LAB-0001', patient: 'John Doe', test: 'CBC', requestedBy: 'Dr. House' },
  { id: 'LAB-0002', patient: 'Jane Smith', test: 'LFT', requestedBy: 'Dr. Wilson' }
]

const doctorNav = ['Dashboard', 'Warnings', 'Labs', 'Admissions']
const patients = ['John Doe', 'Jane Smith', 'Mary Johnson', 'Ahmed Ali', 'Sara Khan']

export const DoctorPage = () => {
  const [selectedPatient, setSelectedPatient] = useState('John Doe')
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOpen, setPatientOpen] = useState(false)

  return (
    <div className="flex flex-col">
      <header className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center gap-3 bg-primary text-white px-4 py-3">
        {/* Patient search moved into navbar */}
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
                {patients
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
                {patients.filter((p) => p.toLowerCase().includes(patientQuery.toLowerCase())).length === 0 && (
                  <div className="px-3 py-2 text-xs text-slate-500">No patients match your search.</div>
                )}
              </div>
            )}
          </div>
        </div>
        <nav className="flex gap-2 flex-wrap justify-end">
          {doctorNav.map((item) => (
            <span key={item} className="px-3 py-1 rounded-md bg-white/15 text-sm">
              {item}
            </span>
          ))}
        </nav>
      </header>

      <div className="grid gap-4 md:grid-cols-2 p-4">
        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="font-semibold mb-2">Warning Messages (Allergies etc.)</div>
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
          <div className="font-semibold mb-2">Lab Test Reports Pending for Review</div>
          <ul className="space-y-2">
            {pendingLabs.map((lab) => (
              <li key={lab.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                <div className="font-semibold">
                  {lab.id} · {lab.test}
                </div>
                <div className="text-sm text-slate-600">{lab.patient}</div>
                <div className="text-sm text-slate-700">Requested by {lab.requestedBy}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm mx-4 mb-4">
        <div className="font-semibold mb-2">Other Screens (OP / IP actions)</div>
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1 bg-blue-50 text-primary border border-blue-100 rounded-full text-sm">
            Appointment with OP
          </span>
          <span className="px-3 py-1 bg-blue-50 text-primary border border-blue-100 rounded-full text-sm">
            New IP Admission
          </span>
          <span className="px-3 py-1 bg-blue-50 text-primary border border-blue-100 rounded-full text-sm">
            Lab Test (Recommend / Review)
          </span>
        </div>
      </section>
    </div>
  )
}


