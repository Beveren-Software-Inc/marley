import { useState, useEffect } from 'react'
import { CreatePatientModal } from './CreatePatientModal'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'

interface PatientSearchProps {
  selectedPatient: string
  onPatientSelect: (patient: string | undefined) => void
  patients?: string[]
}

export const PatientSearch = ({ selectedPatient, onPatientSelect }: PatientSearchProps) => {
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOpen, setPatientOpen] = useState(false)
  const [showCreatePatient, setShowCreatePatient] = useState(false)
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedPatientName, setSelectedPatientName] = useState<string>('')

  // Load patient name when selectedPatient changes (e.g., from URL)
  useEffect(() => {
    if (selectedPatient) {
      const loadPatientName = async () => {
        try {
          const response = await fetch(
            `/api/method/healthcare.api.patient.get_patient?name=${encodeURIComponent(selectedPatient)}`
          )
          const resData = await response.json()
          if (resData?.message?.patient_name) {
            setSelectedPatientName(resData.message.patient_name)
            setPatientQuery(resData.message.patient_name)
          } else {
            setSelectedPatientName(selectedPatient)
            setPatientQuery(selectedPatient)
          }
        } catch (error) {
          console.error('Failed to load patient name:', error)
          setSelectedPatientName(selectedPatient)
          setPatientQuery(selectedPatient)
        }
      }
      loadPatientName()
    } else {
      setSelectedPatientName('')
      setPatientQuery('')
    }
  }, [selectedPatient])

  // Fetch or search patients when dropdown is open
  useEffect(() => {
    if (!patientOpen) return

    const search = async () => {
      setLoading(true)
      try {
        let results: PatientListItem[] = []
        if (patientQuery.trim() === '') {
          // If empty, fetch initial list
          results = await fetchPatients(20, 0)
        } else {
          // Search with query
          results = await searchPatients(patientQuery, 20)
        }
        setPatients(results)
      } catch (error) {
        console.error('Failed to fetch/search patients:', error)
        setPatients([])
      } finally {
        setLoading(false)
      }
    }

    // Debounce search by 300ms
    const timeoutId = setTimeout(() => {
      search()
    }, patientQuery.trim() === '' ? 0 : 300) // No delay for initial load

    return () => clearTimeout(timeoutId)
  }, [patientQuery, patientOpen])

  return (
    <>
      <div className="w-full max-w-xl">
        <div className="relative flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              value={patientQuery}
              onChange={(e) => {
                const value = e.target.value
                setPatientQuery(value)
                setPatientOpen(true)
                // Clear selection when user clears the input or types something different
                if (selectedPatient && (value === '' || value !== selectedPatientName)) {
                  if (value === '') {
                    onPatientSelect(undefined)
                    setSelectedPatientName('')
                  } else if (value !== selectedPatientName) {
                    onPatientSelect(undefined)
                  }
                }
              }}
              onFocus={() => setPatientOpen(true)}
              placeholder={selectedPatientName || 'Search patient...'}
              className="w-full rounded-md border border-primary/40 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-white focus:border-white"
            />
            {selectedPatient && patientQuery === selectedPatientName && (
              <button
                type="button"
                onClick={() => {
                  onPatientSelect(undefined)
                  setSelectedPatientName('')
                  setPatientQuery('')
                  setPatientOpen(false)
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                title="Clear selection"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            {patientOpen && (
              <div className="absolute z-40 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-56 overflow-auto text-slate-900">
                {loading ? (
                  <div className="px-3 py-2 text-xs text-slate-500">Loading patients...</div>
                ) : patients.length > 0 ? (
                  patients.map((patient) => (
                    <button
                      key={patient.name}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                      onClick={() => {
                        const patientName = patient.patient_name || patient.name
                        onPatientSelect(patient.name)
                        setSelectedPatientName(patientName)
                        setPatientQuery(patientName)
                        setPatientOpen(false)
                      }}
                    >
                      <div className="font-medium">{patient.patient_name || patient.name}</div>
                      {patient.mobile && (
                        <div className="text-xs text-slate-500">{patient.mobile}</div>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-slate-500">
                    {patientQuery ? 'No patients match your search.' : 'No patients found.'}
                  </div>
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





