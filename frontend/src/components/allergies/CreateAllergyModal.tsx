import { useEffect, useState } from 'react'
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
  type LinkFieldOption,
} from '../../services/common'
import { fetchPatients, searchPatients, type PatientListItem } from '../../services/patients'
import { toast } from '../../hooks/useToast'
import {
  linkComboboxDropdownClassTall,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClass,
} from '../ui/linkComboboxStyles'
import {
  LOCKED_PRACTITIONER_INPUT_CLASS,
  useLockedLinkedPractitioner,
} from '../../hooks/useLockedLinkedPractitioner'

interface CreateAllergyModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
}

export function CreateAllergyModal({ onClose, onSuccess, initialPatient }: CreateAllergyModalProps) {
  const [formData, setFormData] = useState({
    patient: initialPatient || '',
    practitioner: '',
    allergy: '',
    posting_date: new Date().toISOString().slice(0, 10),
    posting_time: new Date().toTimeString().slice(0, 5),
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientQuery, setPatientQuery] = useState(initialPatient || '')
  const [patientLoading, setPatientLoading] = useState(false)

  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const {
    locked: practitionerLocked,
    practitionerId: linkedPractitionerId,
    practitionerLabel: linkedPractitionerLabel,
  } = useLockedLinkedPractitioner()

  useEffect(() => {
    if (!initialPatient) return
    const loadInitialPatient = async () => {
      try {
        const patients = await fetchPatients(1, 0, initialPatient)
        if (patients[0]) setPatientQuery(patients[0].patient_name)
      } catch (err) {
        console.error('Failed to load initial patient:', err)
      }
    }
    void loadInitialPatient()
  }, [initialPatient])

  useEffect(() => {
    fetchHealthcarePractitioners().then(setPractitionerOptions).catch((err) => {
      console.error('Failed to load doctors:', err)
    })
  }, [])

  useEffect(() => {
    if (!linkedPractitionerId) return
    setFormData((prev) =>
      prev.practitioner ? prev : { ...prev, practitioner: linkedPractitionerId },
    )
    setPractitionerQuery((q) => q.trim() || linkedPractitionerLabel || linkedPractitionerId)
  }, [linkedPractitionerId, linkedPractitionerLabel])

  useEffect(() => {
    if (!patientOpen) return
    const timeoutId = setTimeout(async () => {
      setPatientLoading(true)
      try {
        const results =
          patientQuery.trim() === ''
            ? await fetchPatients(20, 0)
            : await searchPatients(patientQuery, 20)
        setPatientOptions(results)
      } catch (err) {
        console.error('Failed to search patients:', err)
        setPatientOptions([])
      } finally {
        setPatientLoading(false)
      }
    }, patientQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [patientQuery, patientOpen])

  useEffect(() => {
    if (!practitionerOpen) return
    const timeoutId = setTimeout(async () => {
      try {
        setPractitionerOptions(await fetchHealthcarePractitioners(practitionerQuery))
      } catch (err) {
        console.error('Failed to search doctors:', err)
        setPractitionerOptions([])
      }
    }, practitionerQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [practitionerQuery, practitionerOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.patient) {
      setError('Patient is required')
      return
    }
    if (!formData.practitioner) {
      setError('Please select a doctor')
      return
    }
    if (!formData.allergy.trim()) {
      setError('Allergy is required')
      return
    }

    try {
      setLoading(true)
      setError(null)
      await createWarningMessage({
        type_of_warning: 'Medical',
        patient: formData.patient,
        practitioner: formData.practitioner,
        warning: formData.allergy.trim(),
        is_allergy: 1,
        no_allergy: 0,
        posting_date: formData.posting_date
          ? `${formData.posting_date} ${formData.posting_time || '00:00'}:00`
          : undefined,
      })
      toast.success('Allergy recorded')
      onSuccess?.()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to record allergy'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-2xl w-full max-h-[90vh] overflow-y-auto')}>
        <CreateModalHeader title="Create Allergy" onClose={onClose} />
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                Patient <span className="text-red-500">*</span>
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
                  required
                />
                {patientLoading ? (
                  <div className="absolute right-3 top-2.5 text-slate-400 text-sm">Loading...</div>
                ) : null}
                {patientOpen && patientOptions.length > 0 ? (
                  <div className={`${linkComboboxDropdownClassTall} top-full`}>
                    {patientOptions.map((patient) => (
                      <button
                        key={patient.name}
                        type="button"
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, patient: patient.name }))
                          setPatientQuery(patient.patient_name)
                          setPatientOpen(false)
                        }}
                        className={linkComboboxOptionClass}
                      >
                        <div className="font-medium">{patient.patient_name}</div>
                        {patient.mobile ? (
                          <div className="text-xs text-slate-500">{patient.mobile}</div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                Doctor <span className="text-red-500">*</span>
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={practitionerQuery}
                  readOnly={practitionerLocked}
                  onChange={(e) => {
                    if (practitionerLocked) return
                    setPractitionerQuery(e.target.value)
                    setFormData((prev) => ({ ...prev, practitioner: '' }))
                    setPractitionerOpen(true)
                  }}
                  onFocus={() => {
                    if (!practitionerLocked) setPractitionerOpen(true)
                  }}
                  placeholder="Search doctor..."
                  title={practitionerLocked ? 'Locked to your linked practitioner' : undefined}
                  className={
                    practitionerLocked
                      ? LOCKED_PRACTITIONER_INPUT_CLASS
                      : linkComboboxInputWithClearClass
                  }
                />
                {practitionerOpen && !practitionerLocked && practitionerOptions.length > 0 ? (
                  <div className={`${linkComboboxDropdownClassTall} top-full`}>
                    {practitionerOptions.map((pract) => (
                      <button
                        key={pract.name}
                        type="button"
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, practitioner: pract.name }))
                          setPractitionerQuery(pract.label || pract.name)
                          setPractitionerOpen(false)
                        }}
                        className={linkComboboxOptionClass}
                      >
                        <div className="font-medium">{pract.label}</div>
                        <div className="text-xs text-slate-500">{pract.name}</div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                Allergy <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.allergy}
                onChange={(e) => setFormData((prev) => ({ ...prev, allergy: e.target.value }))}
                rows={4}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Enter allergy..."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Posting Date</label>
              <input
                type="date"
                value={formData.posting_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, posting_date: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Posting Time</label>
              <input
                type="time"
                value={formData.posting_time}
                onChange={(e) => setFormData((prev) => ({ ...prev, posting_time: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {error ? (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</div>
          ) : null}

          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={CM_BTN_PRIMARY}>
              {loading ? 'Saving...' : 'Create Allergy'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}
