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
import {
  LOCKED_PRACTITIONER_INPUT_CLASS,
  useLockedLinkedPractitioner,
} from '../../hooks/useLockedLinkedPractitioner'
import { DateFilterInput } from '../ui/DateFilterInput'

interface CreateWarningMessageModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
  defaultSpecialPhoneWarning?: boolean
  title?: string
  submitLabel?: string
}

export const CreateWarningMessageModal = ({
  onClose,
  onSuccess,
  initialPatient,
  defaultSpecialPhoneWarning = false,
  title = 'Create Warning Message',
  submitLabel = 'Create Warning Message',
}: CreateWarningMessageModalProps) => {
  const [formData, setFormData] = useState({
    type_of_warning: 'Medical' as 'Medical' | 'Organisation',
    patient: initialPatient || '',
    warning: '',
    practitioner: '',
    posting_date: new Date().toISOString().slice(0, 10),
    posting_time: new Date().toTimeString().slice(0, 5),
    is_special_phone_warning: defaultSpecialPhoneWarning,
    show_in_standard_warning_popup: false,
    source_type: 'Unknown Caller',
    caller_name: '',
    caller_phone: '',
    relationship_to_patient: '',
    verification_status: 'Unverified',
    verification_method: '',
    clinical_urgency: 'Low',
    requires_follow_up: true,
    follow_up_status: 'Open',
    reported_information: '',
    doctor_review_note: '',
    next_action: '',
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
  const {
    locked: practitionerLocked,
    practitionerId: linkedPractitionerId,
    practitionerLabel: linkedPractitionerLabel,
  } = useLockedLinkedPractitioner()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.is_special_phone_warning && !formData.practitioner) {
      setError('Please select a doctor')
      return
    }
    if ((formData.type_of_warning === 'Medical' || formData.is_special_phone_warning) && !formData.patient) {
      setError('Patient is required for this warning')
      return
    }

    if (!formData.is_special_phone_warning && !formData.warning.trim()) {
      setError('Warning message is required')
      return
    }

    if (formData.is_special_phone_warning && !formData.reported_information.trim()) {
      setError('Reported information is required for a special phone warning')
      return
    }

    try {
      setLoading(true)
      setError(null)

      await createWarningMessage({
        type_of_warning: formData.type_of_warning,
        patient: formData.type_of_warning === 'Organisation' ? (formData.patient || undefined) : formData.patient,
        warning: formData.is_special_phone_warning
          ? formData.warning || formData.reported_information
          : formData.warning,
        practitioner: formData.is_special_phone_warning ? (formData.practitioner || undefined) : formData.practitioner || undefined,
        posting_date: formData.posting_date
          ? `${formData.posting_date} ${formData.posting_time || '00:00'}:00`
          : undefined,
        is_special_phone_warning: formData.is_special_phone_warning ? 1 : 0,
        show_in_standard_warning_popup: formData.show_in_standard_warning_popup ? 1 : 0,
        source_type: formData.is_special_phone_warning ? formData.source_type : undefined,
        caller_name: formData.is_special_phone_warning ? formData.caller_name || undefined : undefined,
        caller_phone: formData.is_special_phone_warning ? formData.caller_phone || undefined : undefined,
        relationship_to_patient: formData.is_special_phone_warning
          ? formData.relationship_to_patient || undefined
          : undefined,
        verification_status: formData.is_special_phone_warning ? formData.verification_status : undefined,
        verification_method: formData.is_special_phone_warning
          ? formData.verification_method || undefined
          : undefined,
        clinical_urgency: formData.is_special_phone_warning ? formData.clinical_urgency : undefined,
        requires_follow_up: formData.is_special_phone_warning ? (formData.requires_follow_up ? 1 : 0) : undefined,
        follow_up_status: formData.is_special_phone_warning ? formData.follow_up_status : undefined,
        reported_information: formData.is_special_phone_warning
          ? formData.reported_information || undefined
          : undefined,
        doctor_review_note: formData.is_special_phone_warning
          ? formData.doctor_review_note || undefined
          : undefined,
        next_action: formData.is_special_phone_warning ? formData.next_action || undefined : undefined,
        received_at: formData.is_special_phone_warning && formData.posting_date
          ? `${formData.posting_date} ${formData.posting_time || '00:00'}:00`
          : undefined,
        received_by_practitioner: formData.is_special_phone_warning ? formData.practitioner || undefined : undefined,
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

  const handleChange = (field: string, value: string | boolean) => {
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
    if (!linkedPractitionerId) return
    setFormData((prev) =>
      prev.practitioner ? prev : { ...prev, practitioner: linkedPractitionerId },
    )
    setPractitionerQuery((q) => q.trim() || linkedPractitionerLabel || linkedPractitionerId)
  }, [linkedPractitionerId, linkedPractitionerLabel])

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
        <CreateModalHeader title={title} onClose={onClose} />

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
                  setFormData((prev) => ({
                    ...prev,
                    type_of_warning: v,
                    patient: '',
                    is_special_phone_warning: false,
                    show_in_standard_warning_popup: false,
                  }))
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
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 uppercase">
              <input
                type="checkbox"
                checked={formData.is_special_phone_warning}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    is_special_phone_warning: e.target.checked,
                    type_of_warning: e.target.checked ? 'Medical' : prev.type_of_warning,
                    show_in_standard_warning_popup: e.target.checked
                      ? prev.show_in_standard_warning_popup
                      : false,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              Special phone warning
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Use this for inbound phone-call information that should stay hidden from normal warning popups unless explicitly allowed.
            </p>
          </div>

          {formData.is_special_phone_warning && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Source Type</label>
                  <select
                    value={formData.source_type}
                    onChange={(e) => handleChange('source_type', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="Patient">Patient</option>
                    <option value="Relative">Relative</option>
                    <option value="Caregiver">Caregiver</option>
                    <option value="Unknown Caller">Unknown Caller</option>
                    <option value="External Provider">External Provider</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="flex items-center">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 uppercase">
                    <input
                      type="checkbox"
                      checked={formData.show_in_standard_warning_popup}
                      onChange={(e) => handleChange('show_in_standard_warning_popup', e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                    />
                    Show in standard warning popup
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Caller Name</label>
                  <input
                    type="text"
                    value={formData.caller_name}
                    onChange={(e) => handleChange('caller_name', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Caller Phone</label>
                  <input
                    type="text"
                    value={formData.caller_phone}
                    onChange={(e) => handleChange('caller_phone', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Relationship To Patient</label>
                  <input
                    type="text"
                    value={formData.relationship_to_patient}
                    onChange={(e) => handleChange('relationship_to_patient', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Verification Status</label>
                  <select
                    value={formData.verification_status}
                    onChange={(e) => handleChange('verification_status', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="Unverified">Unverified</option>
                    <option value="Partially Verified">Partially Verified</option>
                    <option value="Verified">Verified</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Clinical Urgency</label>
                  <select
                    value={formData.clinical_urgency}
                    onChange={(e) => handleChange('clinical_urgency', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Follow Up Status</label>
                  <select
                    value={formData.follow_up_status}
                    onChange={(e) => handleChange('follow_up_status', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="Open">Open</option>
                    <option value="Reviewed">Reviewed</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 uppercase">
                    <input
                      type="checkbox"
                      checked={formData.requires_follow_up}
                      onChange={(e) => handleChange('requires_follow_up', e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                    />
                    Requires follow up
                  </label>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                    Reported Information <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.reported_information}
                    onChange={(e) => handleChange('reported_information', e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Record exactly what the caller reported..."
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Verification Method</label>
                  <textarea
                    value={formData.verification_method}
                    onChange={(e) => handleChange('verification_method', e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Doctor Review Note</label>
                  <textarea
                    value={formData.doctor_review_note}
                    onChange={(e) => handleChange('doctor_review_note', e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Next Action</label>
                  <textarea
                    value={formData.next_action}
                    onChange={(e) => handleChange('next_action', e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>
          )}

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
                <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                  Doctor
                  {!formData.is_special_phone_warning && <span className="text-red-500"> *</span>}
                  {formData.is_special_phone_warning && (
                    <span className="text-slate-400 font-normal"> (optional)</span>
                  )}
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
                  {!practitionerLocked ? (
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
                  ) : null}
                  {practitionerOpen && !practitionerLocked && practitionerOptions.length > 0 && (
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
                  Warning Message
                  {!formData.is_special_phone_warning && <span className="text-red-500"> *</span>}
                  {formData.is_special_phone_warning && (
                    <span className="text-slate-400 font-normal"> (optional)</span>
                  )}
                </label>
                <textarea
                  value={formData.warning}
                  onChange={(e) => handleChange('warning', e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={
                    formData.is_special_phone_warning
                      ? 'Optional summary title for the sticky note...'
                      : 'Enter warning message...'
                  }
                  required={!formData.is_special_phone_warning}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Posting Date</label>
                <DateFilterInput
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
              {loading ? 'Creating...' : submitLabel}
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
