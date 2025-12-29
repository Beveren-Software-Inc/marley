import { useState } from 'react'
import { CreatePatientModal } from './CreatePatientModal'

interface PatientSearchProps {
  selectedPatient: string
  onPatientSelect: (patient: string) => void
  patients?: string[]
}

export const PatientSearch = ({ selectedPatient, onPatientSelect, patients = [] }: PatientSearchProps) => {
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOpen, setPatientOpen] = useState(false)
  const [showCreatePatient, setShowCreatePatient] = useState(false)

  return (
    <>
      <div className="w-full max-w-xl">
        <div className="relative flex items-center gap-2">
          <div className="flex-1 relative">
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
                        onPatientSelect(p)
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
          <button
            onClick={() => setShowCreatePatient(true)}
            className="flex-shrink-0 w-10 h-10 rounded-md bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
            title="Create New Patient"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {showCreatePatient && (
        <CreatePatientModal
          onClose={() => setShowCreatePatient(false)}
          onSuccess={(patientName) => {
            onPatientSelect(patientName)
            setShowCreatePatient(false)
          }}
        />
      )}
    </>
  )
}




