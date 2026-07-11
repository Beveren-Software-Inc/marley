import { useState, useEffect } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { createWarningMessage } from '../../services/warningMessages'
import {
  fetchHealthcarePractitioners,
  getCurrentUserPractitioner,
  type LinkFieldOption,
} from '../../services/common'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { toast } from '../../hooks/useToast'
import { CreatePractitionerModal } from '../practitioners/CreatePractitionerModal'
import { CreatePatientModal } from '../patients/CreatePatientModal'
import {
  linkComboboxDropdownClassTall,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClass,
} from '../ui/linkComboboxStyles'

interface CreateWarningMessageModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
}

export const CreateWarningMessageModal = ({ onClose, onSuccess, initialPatient }: CreateWarningMessageModalProps) => {
  const [formData, setFormData] = useState({
    type_of_warning: 'Medical' as 'Medical' | 'Organisation',
    patient: initialPatient || '',
    warning: '',
    practitioner: '',
    posting_date: new Date().toISOString().slice(0, 10),
    posting_time: new Date().toTimeString().slice(0, 5),
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreatePractitioner, setShowCreatePractitioner] = useState(false)
  const [showCreatePatient, setShowCreatePatient] = useState(false)

  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientQuery, setPatientQuery] = useState(initialPatient || '')
  const [patientLoading, setPatientLoading] = useState(false)

  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.practitioner) {
      setError('Please select a doctor')
      return
    }
    if (formData.type_of_warning === 'Medical' && !formData.patient) {
      setError('Patient is required for medical warnings')
      return
    }

    if (!formData.warning.trim()) {
      setError('Warning message is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      await createWarningMessage({
        type_of_warning: formData.type_of_warning,
        patient: formData.type_of_warning === 'Organisation' ? (formData.patient || undefined) : formData.patient,
        warning: formData.warning,
        practitioner: formData.practitioner || undefined,
        posting_date: formData.posting_date
          ? `${formData.posting_date} ${formData.posting_time || '00:00'}:00`
          : undefined,
      })

      toast.success('Warning message created successfully')
      onSuccess?.()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create warning message'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    if (initialPatient) {
      const loadInitialPatient = async () => {
        try {
          const patients = await fetchPatients(1, 0, initialPatient)
          if (patients.length > 0) {
            setPatientQuery(patients[0].patient_name)
          }
        } catch (err) {
          console.error('Failed to load initial patient:', err)
        }
      }
      loadInitialPatient()
    }
  }, [initialPatient])

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const practs = await fetchHealthcarePractitioners()
        setPractitionerOptions(practs)
      } catch (err) {
        console.error('Failed to load options:', err)
      }
    }
    loadOptions()
  }, [])

  useEffect(() => {
    const autoPopulatePractitioner = async () => {
      try {
        const practitioner = await getCurrentUserPractitioner()
        if (!practitioner) return

        setFormData((prev) => ({ ...prev, practitioner }))

        const practitionerOption = practitionerOptions.find((p) => p.name === practitioner)
        setPractitionerQuery(practitionerOption?.label || practitioner)
      } catch (err) {
        console.error('Failed to auto-populate practitioner:', err)
      }
    }
    autoPopulatePractitioner()
  }, [practitionerOptions])

  useEffect(() => {
    if (!patientOpen) return

    const search = async () => {
      setPatientLoading(true)
      try {
        let results: PatientListItem[] = []
        if (patientQuery.trim() === '') {
          results = await fetchPatients(20, 0)
        } else {
          results = await searchPatients(patientQuery, 20)
        }
        setPatientOptions(results)
      } catch (err) {
        console.error('Failed to fetch/search patients:', err)
        setPatientOptions([])
      } finally {
        setPatientLoading(false)
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, patientQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [patientQuery, patientOpen])

  useEffect(() => {
    if (!practitionerOpen) return

    const search = async () => {
      try {
        const results = await fetchHealthcarePractitioners(practitionerQuery)
        setPractitionerOptions(results)
      } catch (err) {
        console.error('Failed to search practitioners:', err)
        setPractitionerOptions([])
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, practitionerQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [practitionerQuery, practitionerOpen])

  const handlePatientSelect = (patient: PatientListItem) => {
    setFormData((prev) => ({ ...prev, patient: patient.name }))
    setPatientQuery(patient.patient_name)
    setPatientOpen(false)
  }

  const handlePractitionerSelect = (pract: LinkFieldOption) => {
    setFormData((prev) => ({ ...prev, practitioner: pract.name }))
    setPractitionerQuery(pract.label || pract.name)
    setPractitionerOpen(false)
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-2xl w-full max-h-[90vh] overflow-y-auto')}>
        <CreateModalHeader title="Create Warning Message" onClose={onClose} />

        <form
          onSubmit={handleSubmit}
          className={`${CREATE_MODAL_BODY_GRADIENT} space-y-4 p-6`}
          onClick={(e) => {
            const target = e.target as HTMLElement
            if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
              setPatientOpen(false)
              setPractitionerOpen(false)
            }
          }}
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Type of warning</label>
            <select
              value={formData.type_of_warning}
              onChange={(e) => {
                const v = e.target.value as 'Medical' | 'Organisation'
                if (v === 'Organisation') {
                  setFormData((prev) => ({ ...prev, type_of_warning: v, patient: '' }))
                  setPatientQuery('')
                } else {
                  setFormData((prev) => ({
                    ...prev,
                    type_of_warning: v,
                    patient: initialPatient || prev.patient,
                  }))
                  if (initialPatient) {
                    fetchPatients(1, 0, initialPatient)
                      .then((patients) => {
                        if (patients[0]) setPatientQuery(patients[0].patient_name)
                      })
                      .catch(() => {})
                  }
                }
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="Medical">Medical (patient-specific)</option>
              <option value="Organisation">Organisation (facility-wide notice)</option>
            </select>
          </div>

          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                  Patient {formData.type_of_warning === 'Medical' && <span className="text-red-500">*</span>}
                  {formData.type_of_warning === 'Organisation' && (
                    <span className="text-slate-400 font-normal"> (optional)</span>
                  )}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={patientQuery}
                    onChange={(e) => {
                      setPatientQuery(e.target.value)
                      setPatientOpen(true)
                    }}
                    onFocus={() => setPatientOpen(true)}
                    placeholder="Search patient..."
                    className={linkComboboxInputWithClearClass}
                    required={formData.type_of_warning === 'Medical'}
                  />
                  {patientLoading && (
                    <div className="absolute right-10 top-2.5 text-slate-400 text-sm">Loading...</div>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowCreatePatient(true)
                    }}
                    className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                    title="Create New Patient"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  {patientOpen && patientOptions.length > 0 && (
                    <div className={`${linkComboboxDropdownClassTall} top-full`}>
                      {patientOptions.map((patient) => (
                        <button
                          key={patient.name}
                          type="button"
                          onClick={() => handlePatientSelect(patient)}
                          className={linkComboboxOptionClass}
                        >
                          <div className="font-medium">{patient.patient_name}</div>
                          {patient.mobile && <div className="text-xs text-slate-500">{patient.mobile}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Doctor <span className="text-red-500">*</span></label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={practitionerQuery}
                    onChange={(e) => {
                      setPractitionerQuery(e.target.value)
                      setFormData((prev) => ({ ...prev, practitioner: '' }))
                      setPractitionerOpen(true)
                    }}
                    onFocus={() => setPractitionerOpen(true)}
                    placeholder="Search doctor..."
                    className={linkComboboxInputWithClearClass}
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
                  {practitionerOpen && practitionerOptions.length > 0 && (
                    <div className={`${linkComboboxDropdownClassTall} top-full`}>
                      {practitionerOptions.map((pract) => (
                        <button
                          key={pract.name}
                          type="button"
                          onClick={() => handlePractitionerSelect(pract)}
                          className={linkComboboxOptionClass}
                        >
                          <div>
                            <div className="font-medium">{pract.label}</div>
                            <div className="text-xs text-slate-500">{pract.name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                  Warning Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.warning}
                  onChange={(e) => handleChange('warning', e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter warning message..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Posting Date</label>
                <input
                  type="date"
                  value={formData.posting_date}
                  onChange={(e) => handleChange('posting_date', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Posting Time</label>
                <input
                  type="time"
                  value={formData.posting_time}
                  onChange={(e) => handleChange('posting_time', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</div>
          )}

          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={CM_BTN_PRIMARY}>
              {loading ? 'Creating...' : 'Create Warning Message'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
      {showCreatePractitioner && (
        <CreatePractitionerModal
          onClose={() => setShowCreatePractitioner(false)}
          onSuccess={(practitionerName) => {
            setFormData((prev) => ({ ...prev, practitioner: practitionerName }))
            const newPract = practitionerOptions.find((p) => p.name === practitionerName)
            if (newPract) {
              setPractitionerQuery(newPract.label || newPract.name)
            } else {
              fetchHealthcarePractitioners().then(setPractitionerOptions).catch(console.error)
              setPractitionerQuery(practitionerName)
            }
            setPractitionerOpen(false)
            setShowCreatePractitioner(false)
          }}
        />
      )}
      {showCreatePatient && (
        <CreatePatientModal
          onClose={() => setShowCreatePatient(false)}
          onSuccess={(patientName) => {
            const newPatient: PatientListItem = { name: patientName, patient_name: patientName }
            setFormData((prev) => ({ ...prev, patient: newPatient.name }))
            setPatientQuery(newPatient.patient_name)
            setPatientOpen(false)
            setShowCreatePatient(false)
          }}
        />
      )}
    </div>
  )
}
