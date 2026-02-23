import { useState, useEffect } from 'react'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { fetchPatientVisitTypes, type PatientVisitTypeOption } from '../../services/patientVisits'
import { 
  fetchHealthcarePractitioners, 
  type LinkFieldOption 
} from '../../services/common'
import { CreatePatientModal } from '../patients/CreatePatientModal'
import { CreatePractitionerModal } from '../practitioners/CreatePractitionerModal'

interface CreatePatientVisitModalProps {
  onClose: () => void
  onSuccess: (visitName: string) => void
  /** Pre-fill patient (e.g. from IOP enrollment). */
  initialPatient?: string
  /** Link new visit to this IOP Enrollment. */
  initialIOPEnrollment?: string
}

export const CreatePatientVisitModal = ({ onClose, onSuccess, initialPatient, initialIOPEnrollment }: CreatePatientVisitModalProps) => {
  const [patientQuery, setPatientQuery] = useState(initialPatient || '')
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(null)
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreatePatient, setShowCreatePatient] = useState(false)
  const [showCreatePractitioner, setShowCreatePractitioner] = useState(false)

  // Link field options
  const [practitioners, setPractitioners] = useState<LinkFieldOption[]>([])
  const [practOpen, setPractOpen] = useState(false)
  const [practQuery, setPractQuery] = useState('')

  const [formData, setFormData] = useState({
    practitioner: '',
    encounter_date: new Date().toISOString().split('T')[0],
    encounter_time: new Date().toTimeString().slice(0, 5),
    visit_type: initialIOPEnrollment ? 'IOP' : '',
    appointment: ''
  })
  const [visitTypeOptions, setVisitTypeOptions] = useState<PatientVisitTypeOption[]>([])

  // When opening from IOP enrollment, default visit type to IOP
  useEffect(() => {
    if (initialIOPEnrollment) {
      setFormData((prev) => (prev.visit_type === '' ? { ...prev, visit_type: 'IOP' } : prev))
    }
  }, [initialIOPEnrollment])

  // Load initial options (practitioners + visit types)
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [practs, visitTypes] = await Promise.all([
          fetchHealthcarePractitioners(),
          fetchPatientVisitTypes()
        ])
        setPractitioners(practs)
        setVisitTypeOptions(visitTypes)
      } catch (err) {
        console.error('Failed to load options:', err)
      }
    }
    loadOptions()
  }, [])

  // Pre-fill patient when initialPatient (e.g. from IOP enrollment) is provided
  useEffect(() => {
    if (!initialPatient) return
    fetchPatients(1, 0, initialPatient).then((list) => {
      if (list.length > 0) {
        const p = list[0]
        setSelectedPatient(p)
        setPatientQuery((p as { patient_name?: string }).patient_name || p.name)
      } else {
        setPatientQuery(initialPatient)
      }
    }).catch(() => setPatientQuery(initialPatient))
  }, [initialPatient])

  // Search/fetch patients
  useEffect(() => {
    if (!patientOpen) return

    const search = async () => {
      setLoading(true)
      try {
        let results: PatientListItem[] = []
        if (patientQuery.trim() === '') {
          results = await fetchPatients(20, 0)
        } else {
          results = await searchPatients(patientQuery, 20)
        }
        setPatients(results)
      } catch (err) {
        console.error('Failed to fetch/search patients:', err)
        setPatients([])
      } finally {
        setLoading(false)
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, patientQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [patientQuery, patientOpen])

  // Search practitioners
  useEffect(() => {
    if (practOpen || practQuery) {
      const search = async () => {
        try {
          const results = await fetchHealthcarePractitioners(practQuery || undefined)
          setPractitioners(results)
        } catch (err) {
          console.error('Failed to search practitioners:', err)
        }
      }
      const timeoutId = setTimeout(search, 300)
      return () => clearTimeout(timeoutId)
    }
  }, [practQuery, practOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedPatient) {
      setError('Please select a patient')
      return
    }

    if (!formData.practitioner) {
      setError('Please select a practitioner')
      return
    }

    try {
      setSubmitting(true)

      const { ensureCSRF } = await import('../../services/apiClient')
      const csrf = await ensureCSRF()
      const response = await fetch('/api/resource/Patient Visit', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
        },
        body: JSON.stringify({
          patient: selectedPatient.name,
          practitioner: formData.practitioner,
          encounter_date: formData.encounter_date,
          encounter_time: formData.encounter_time,
          visit_type: formData.visit_type,
          appointment: formData.appointment || undefined,
          iop_enrollment: initialIOPEnrollment || undefined,
          status: 'Open'
        })
      })

      const resData = await response.json()

      if (resData.data && resData.data.name) {
        onSuccess(resData.data.name)
      } else if (resData.exc) {
        throw new Error(resData.exc || 'Failed to create patient visit')
      } else {
        throw new Error('Visit created but no name returned')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create patient visit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Create New Patient Visit</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4" onClick={(e) => {
          const target = e.target as HTMLElement
          if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
            setPatientOpen(false)
            setPractOpen(false)
          }
        }}>
          {/* Patient Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Patient <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={selectedPatient ? (selectedPatient.patient_name || selectedPatient.name) : patientQuery}
                onChange={(e) => {
                  setPatientQuery(e.target.value)
                  setPatientOpen(true)
                }}
                onFocus={() => setPatientOpen(true)}
                placeholder="Search patient..."
                className="w-full rounded-md border border-slate-300 pr-9 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowCreatePatient(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs hover:bg-primary/90"
                title="Add Patient"
              >
                +
              </button>
              {patientOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                  {loading ? (
                    <div className="px-3 py-2 text-xs text-slate-500">Loading patients...</div>
                  ) : patients.length > 0 ? (
                    patients.map((patient) => (
                      <button
                        key={patient.name}
                        type="button"
                        className="w-full text-left px-[11px] py-2 text-sm hover:bg-blue-50"
                        onClick={() => {
                          setSelectedPatient(patient)
                          setPatientQuery(patient.patient_name || patient.name)
                          setPatientOpen(false)
                        }}
                      >
                        <div className="font-medium">{patient.patient_name || patient.name}</div>
                        <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {patient.file_number && <span>File: {patient.file_number}</span>}
                          {patient.id_number && <span>ID: {patient.id_number}</span>}
                          {patient.mobile && <span>{patient.mobile}</span>}
                        </div>
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Practitioner */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Practitioner <span className="text-red-500">*</span>
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={formData.practitioner ? practitioners.find(p => p.name === formData.practitioner)?.label || formData.practitioner : practQuery}
                  onChange={(e) => {
                    setPractQuery(e.target.value)
                    setPractOpen(true)
                  }}
                  onFocus={() => setPractOpen(true)}
                  placeholder="Search Healthcare Practitioner..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowCreatePractitioner(true)
                  }}
                  className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                  title="Create New Practitioner"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                {practOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto top-full">
                    {practitioners.length > 0 ? (
                      practitioners.map((pract) => (
                        <button
                          key={pract.name}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                          onClick={() => {
                            setFormData({ ...formData, practitioner: pract.name })
                            setPractQuery(pract.label)
                            setPractOpen(false)
                          }}
                        >
                          <div className="font-medium">{pract.label}</div>
                          {pract.department && (
                            <div className="text-xs text-slate-500">{pract.department}</div>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-slate-500">No practitioners found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Visit Type (ECG, ECT, IOP, follow-up, lab visit, etc.) */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Visit Type
              </label>
              <select
                value={formData.visit_type}
                onChange={(e) => setFormData({ ...formData, visit_type: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select visit type</option>
                {visitTypeOptions.map((vt) => (
                  <option key={vt.name} value={vt.name}>
                    {vt.visit_type || vt.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Encounter Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Encounter Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.encounter_date}
                onChange={(e) => setFormData({ ...formData, encounter_date: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            {/* Encounter Time */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Encounter Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={formData.encounter_time}
                onChange={(e) => setFormData({ ...formData, encounter_time: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Visit'}
            </button>
          </div>
        </form>
      </div>
      {showCreatePatient && (
        <CreatePatientModal
          onClose={() => setShowCreatePatient(false)}
          onSuccess={(patientName) => {
            const newPatient: PatientListItem = { name: patientName, patient_name: patientName }
            setSelectedPatient(newPatient)
            setPatientQuery(newPatient.patient_name)
            setPatientOpen(false)
            setShowCreatePatient(false)
          }}
        />
      )}
      {showCreatePractitioner && (
        <CreatePractitionerModal
          onClose={() => setShowCreatePractitioner(false)}
          onSuccess={(practitionerName) => {
            setFormData({ ...formData, practitioner: practitionerName })
            const newPract = practitioners.find(p => p.name === practitionerName)
            if (newPract) {
              setPractQuery(newPract.label)
            } else {
              // Refresh practitioners list to get the new one
              fetchHealthcarePractitioners().then(setPractitioners).catch(console.error)
              setPractQuery(practitionerName)
            }
            setPractOpen(false)
            setShowCreatePractitioner(false)
          }}
        />
      )}
    </div>
  )
}

