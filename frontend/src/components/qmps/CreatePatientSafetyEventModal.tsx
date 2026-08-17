import { useState, useEffect, useRef } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  CreateModalHeader,
  createModalShellClass,
  MODAL_FIELD_CLASS,
  MODAL_LABEL_CLASS,
} from '../ui/CreateModalChrome'
import {
  createPatientSafetyEvent,
  fetchPatientSafetyEventTypes,
  createPatientSafetyEventType,
} from '../../services/qmps'
import { fetchPatients, type PatientListItem } from '../../services/patients'
import { fetchMedicalDepartments, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'
import {
  linkComboboxDropdownClassShort,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'
import { X } from 'lucide-react'

interface CreatePatientSafetyEventModalProps {
  onClose: () => void
  onSuccess?: () => void
}

export const CreatePatientSafetyEventModal = ({ onClose, onSuccess }: CreatePatientSafetyEventModalProps) => {
  const [form, setForm] = useState({
    is_anonymous: true,
    event_type: '',
    location: '',
    severity: '',
    patient: '',
    department: '',
    description: '',
    immediate_action: '',
    contributing_factors: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Event type dropdown state
  const [eventTypeOptions, setEventTypeOptions] = useState<LinkFieldOption[]>([])
  const [eventTypeOpen, setEventTypeOpen] = useState(false)
  const [eventTypeQuery, setEventTypeQuery] = useState('')
  const [selectedEventType, setSelectedEventType] = useState<LinkFieldOption | null>(null)
  const eventTypeRef = useRef<HTMLDivElement>(null)

  // Department dropdown state
  const [departmentOptions, setDepartmentOptions] = useState<LinkFieldOption[]>([])
  const [departmentOpen, setDepartmentOpen] = useState(false)
  const [departmentQuery, setDepartmentQuery] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState<LinkFieldOption | null>(null)
  const departmentRef = useRef<HTMLDivElement>(null)

  // Patient search
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const patientRef = useRef<HTMLDivElement>(null)

  // Create event type inline modal (nested)
  const [showCreateEventType, setShowCreateEventType] = useState(false)
  const [newEventTypeName, setNewEventTypeName] = useState('')
  const [creatingEventType, setCreatingEventType] = useState(false)

  // Search effects
  useEffect(() => {
    if (!eventTypeOpen) return
    const id = setTimeout(async () => {
      try {
        setEventTypeOptions(await fetchPatientSafetyEventTypes(eventTypeQuery))
      } catch { setEventTypeOptions([]) }
    }, eventTypeQuery.trim() ? 300 : 0)
    return () => clearTimeout(id)
  }, [eventTypeOpen, eventTypeQuery])

  useEffect(() => {
    if (!departmentOpen) return
    const id = setTimeout(async () => {
      try {
        setDepartmentOptions(await fetchMedicalDepartments(departmentQuery))
      } catch { setDepartmentOptions([]) }
    }, departmentQuery.trim() ? 300 : 0)
    return () => clearTimeout(id)
  }, [departmentOpen, departmentQuery])

  useEffect(() => {
    if (!patientOpen) return
    const id = setTimeout(async () => {
      try {
        const list = patientQuery.trim()
          ? await fetchPatients(20, 0, patientQuery.trim())
          : await fetchPatients(20, 0)
        setPatientOptions(list)
      } catch { setPatientOptions([]) }
    }, patientQuery.trim() ? 300 : 0)
    return () => clearTimeout(id)
  }, [patientOpen, patientQuery])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (eventTypeRef.current && !eventTypeRef.current.contains(e.target as Node)) setEventTypeOpen(false)
      if (departmentRef.current && !departmentRef.current.contains(e.target as Node)) setDepartmentOpen(false)
      if (patientRef.current && !patientRef.current.contains(e.target as Node)) setPatientOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleEventTypeSelect = (opt: LinkFieldOption) => {
    setSelectedEventType(opt)
    setEventTypeQuery('')
    setForm((prev) => ({ ...prev, event_type: opt.name }))
    setEventTypeOpen(false)
  }

  const clearEventType = () => {
    setSelectedEventType(null)
    setEventTypeQuery('')
    setForm((prev) => ({ ...prev, event_type: '' }))
    setEventTypeOpen(false)
  }

  const handleDepartmentSelect = (opt: LinkFieldOption) => {
    setSelectedDepartment(opt)
    setDepartmentQuery('')
    setForm((prev) => ({ ...prev, department: opt.name }))
    setDepartmentOpen(false)
  }

  const clearDepartment = () => {
    setSelectedDepartment(null)
    setDepartmentQuery('')
    setForm((prev) => ({ ...prev, department: '' }))
    setDepartmentOpen(false)
  }

  const handleCreateEventType = async () => {
    if (!newEventTypeName.trim()) return
    setCreatingEventType(true)
    try {
      const created = await createPatientSafetyEventType(newEventTypeName.trim())
      const option: LinkFieldOption = { name: created.name, label: created.event_type || created.name }
      setEventTypeOptions((prev) => [option, ...prev])
      setSelectedEventType(option)
      setForm((prev) => ({ ...prev, event_type: created.name }))
      setEventTypeQuery('')
      setEventTypeOpen(false)
      setShowCreateEventType(false)
      setNewEventTypeName('')
      toast.success('Patient safety event type created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create event type')
    } finally {
      setCreatingEventType(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.event_type.trim()) {
      setError('Patient Safety Event Type is required')
      return
    }
    if (!form.description.trim()) {
      setError('Description is required')
      return
    }
    try {
      setSubmitting(true)
      setError(null)
      await createPatientSafetyEvent({
        event_type: form.event_type.trim(),
        location: form.location.trim() || undefined,
        severity: form.severity || undefined,
        patient: form.patient || undefined,
        department: form.department || undefined,
        description: form.description.trim(),
        immediate_action: form.immediate_action.trim() || undefined,
        contributing_factors: form.contributing_factors.trim() || undefined,
        is_anonymous: form.is_anonymous,
      })
      toast.success('Patient safety event submitted')
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit event')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('w-full max-w-2xl max-h-[90vh]')}>
        <CreateModalHeader title="Report Patient Safety Event" onClose={onClose} />
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto px-6 py-5 flex-1">
            <p className="mb-4 text-sm text-slate-600">
              This form supports anonymous reporting. If "Report Anonymously" is checked, your name
              will not be shown on standard reports.
            </p>

            <div className="mb-4 flex items-center gap-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_anonymous}
                  onChange={(e) => setForm({ ...form, is_anonymous: e.target.checked })}
                  className="h-4 w-4"
                />
                Report Anonymously
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Event Type — link to Patient Safety Event Type with + button */}
              <div ref={eventTypeRef}>
                <label className={MODAL_LABEL_CLASS}>
                  Patient Safety Event Type <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={selectedEventType ? selectedEventType.label : eventTypeQuery}
                    onChange={(e) => {
                      setEventTypeQuery(e.target.value)
                      setEventTypeOpen(true)
                      if (selectedEventType) { setSelectedEventType(null); setForm((prev) => ({ ...prev, event_type: '' })) }
                    }}
                    onFocus={() => setEventTypeOpen(true)}
                    placeholder="Search event type..."
                    className={`${linkComboboxInputWithClearClass} pr-9`}
                  />
                  {selectedEventType ? (
                    <button
                      type="button"
                      onClick={clearEventType}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      title="Clear"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowCreateEventType(true)
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs hover:bg-primary/90"
                      title="Create New Event Type"
                    >
                      +
                    </button>
                  )}
                  {eventTypeOpen && eventTypeOptions.length > 0 && (
                    <div className={linkComboboxDropdownClassShort}>
                      {eventTypeOptions.map((opt) => (
                        <button
                          key={opt.name}
                          type="button"
                          onClick={() => handleEventTypeSelect(opt)}
                          className={`${linkComboboxOptionClassCompact} text-slate-900`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Department — link to Medical Department */}
              <div ref={departmentRef}>
                <label className={MODAL_LABEL_CLASS}>Department / Service</label>
                <div className="relative">
                  <input
                    type="text"
                    value={selectedDepartment ? selectedDepartment.label : departmentQuery}
                    onChange={(e) => {
                      setDepartmentQuery(e.target.value)
                      setDepartmentOpen(true)
                      if (selectedDepartment) { setSelectedDepartment(null); setForm((prev) => ({ ...prev, department: '' })) }
                    }}
                    onFocus={() => setDepartmentOpen(true)}
                    placeholder="Search department..."
                    className={`${linkComboboxInputWithClearClass} pr-9`}
                  />
                  {selectedDepartment ? (
                    <button
                      type="button"
                      onClick={clearDepartment}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      title="Clear"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : null}
                  {departmentOpen && departmentOptions.length > 0 && (
                    <div className={linkComboboxDropdownClassShort}>
                      {departmentOptions.map((opt) => (
                        <button
                          key={opt.name}
                          type="button"
                          onClick={() => handleDepartmentSelect(opt)}
                          className={`${linkComboboxOptionClassCompact} text-slate-900`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className={MODAL_LABEL_CLASS}>Location / Unit</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className={MODAL_FIELD_CLASS}
                  placeholder="e.g. Ward 3B, OPD, Pharmacy"
                />
              </div>

              <div>
                <label className={MODAL_LABEL_CLASS}>Severity</label>
                <select
                  value={form.severity}
                  onChange={(e) => setForm({ ...form, severity: e.target.value })}
                  className={MODAL_FIELD_CLASS}
                >
                  <option value="">Select severity</option>
                  <option value="Near Miss">Near Miss</option>
                  <option value="No Harm">No Harm</option>
                  <option value="Mild">Mild</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Severe">Severe</option>
                  <option value="Sentinel">Sentinel</option>
                </select>
              </div>
            </div>

            {/* Patient (optional) — searchable dropdown */}
            <div className="mt-4" ref={patientRef}>
              <label className={MODAL_LABEL_CLASS}>Patient (optional)</label>
              <div className="relative">
                <input
                  type="text"
                  value={
                    form.patient
                      ? (patientOptions.find((p) => p.name === form.patient)?.patient_name || form.patient)
                      : patientQuery
                  }
                  onChange={(e) => {
                    setPatientQuery(e.target.value)
                    setPatientOpen(true)
                    if (form.patient) setForm({ ...form, patient: '' })
                  }}
                  onFocus={() => setPatientOpen(true)}
                  placeholder="Search patient..."
                  className={MODAL_FIELD_CLASS}
                />
                {patientOpen && patientOptions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-xl border border-emerald-200/80 bg-white py-1 text-slate-900 shadow-lg ring-1 ring-emerald-300/40">
                    {patientOptions.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm transition hover:bg-emerald-50/80 focus:bg-emerald-50/80 focus:outline-none"
                        onClick={() => {
                          setForm({ ...form, patient: p.name })
                          setPatientQuery(p.patient_name || p.name)
                          setPatientOpen(false)
                        }}
                      >
                        <div className="font-medium">{p.patient_name || p.name}</div>
                        <div className="text-xs text-slate-500">{p.name}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4">
              <label className={MODAL_LABEL_CLASS}>
                What happened? <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={`${MODAL_FIELD_CLASS} resize-y min-h-[5rem]`}
                placeholder="Describe the event in your own words. Do not include staff names in this field."
              />
            </div>

            <div className="mt-4">
              <label className={MODAL_LABEL_CLASS}>Immediate action taken</label>
              <textarea
                rows={3}
                value={form.immediate_action}
                onChange={(e) => setForm({ ...form, immediate_action: e.target.value })}
                className={`${MODAL_FIELD_CLASS} resize-y min-h-[5rem]`}
              />
            </div>

            <div className="mt-4">
              <label className={MODAL_LABEL_CLASS}>Contributing factors</label>
              <textarea
                rows={3}
                value={form.contributing_factors}
                onChange={(e) => setForm({ ...form, contributing_factors: e.target.value })}
                className={`${MODAL_FIELD_CLASS} resize-y min-h-[5rem]`}
              />
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-3 bg-white">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={CM_BTN_PRIMARY}>
              {submitting ? 'Submitting…' : 'Submit Event'}
            </button>
          </div>
        </form>
      </div>

      {/* Inline create event type modal (nested) */}
      {showCreateEventType && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-primary/15 p-4 backdrop-blur-[2px]">
          <div className="data-healthcare-modal flex w-full flex-col rounded-2xl border border-emerald-200/60 bg-white shadow-2xl shadow-emerald-600/10 ring-1 ring-emerald-100/80 w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-4">New Patient Safety Event Type</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Event Type Name</label>
              <input
                autoFocus
                type="text"
                value={newEventTypeName}
                onChange={(e) => setNewEventTypeName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateEventType() } }}
                placeholder="e.g. Medication error, Fall, Near miss"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowCreateEventType(false); setNewEventTypeName('') }}
                className={CM_BTN_CANCEL}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newEventTypeName.trim() || creatingEventType}
                onClick={handleCreateEventType}
                className={CM_BTN_PRIMARY}
              >
                {creatingEventType ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}