import { useState, useEffect, useRef, useMemo } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  CreateModalHeader,
  createModalShellClass,
  MODAL_FIELD_CLASS,
  MODAL_LABEL_CLASS,
} from '../ui/CreateModalChrome'
import { createPatientSafetyEvent } from '../../services/qmps'
import { fetchPatients, type PatientListItem } from '../../services/patients'
import { fetchMedicalDepartments, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'
import {
  linkComboboxDropdownClassShort,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'
import { X } from 'lucide-react'
import { DateFilterInput } from '../ui/DateFilterInput'

interface CreatePatientSafetyEventModalProps {
  onClose: () => void
  onSuccess?: () => void
}

const CLINICAL_TYPES = [
  'Patient identification error',
  'Device and Medical',
  'Anesthesia',
  'Fall',
  'Blood, blood products',
  'Clinical Practice / Procedure',
  'Other',
]

const NON_CLINICAL_TYPES = [
  'Building safety event',
  'Absconded',
  'Fire Events',
  'Security Events',
  'Medical Record Related Event',
  'Hazard Material Events',
  'Other',
]

const SENTINEL_TYPES = [
  'Wrong Patient',
  'Unexpected Death',
  'Suicide in an inpatient unit',
  'Retained instruments or a sponge',
  'Unexpected loss of a limb or a function',
  'Patient Escaped',
  'Patient Escaped and got harm',
  'Major Medication Error Leading to Death or Major Morbidity',
  'Any Harm to Patient While Shifting Patient From Home to Hospital',
]

const PROBABILITY_HELP: Record<string, string> = {
  '1': 'Never happened before or every 5+ years',
  '2': 'Every 2–5 years',
  '3': 'Every 1–2 years',
  '4': 'More than once per year',
  '5': 'Monthly',
}

const IMPACT_HELP: Record<string, string> = {
  '1': 'Negligible — barely noticeable',
  '2': 'Minor — minor reduction in function',
  '3': 'Moderate — moderate effect',
  '4': 'Major — great reduction in function',
  '5': 'Extreme — complete loss / death',
}

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function nowTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const CreatePatientSafetyEventModal = ({ onClose, onSuccess }: CreatePatientSafetyEventModalProps) => {
  const [form, setForm] = useState({
    report_type: '',
    harm_evidence: '',
    event_category: '',
    clinical_event_type: '',
    non_clinical_event_type: '',
    sentinel_event_type: '',
    other_event_specify: '',
    event_discovery_date: todayISO(),
    event_discovery_time: nowTime(),
    report_date: todayISO(),
    location: '',
    department: '',
    description: '',
    immediate_action: '',
    affected_person: '',
    is_anonymous: false,
    reporter_first_name: '',
    reporter_middle_name: '',
    reporter_last_name: '',
    reporter_mobile: '',
    reporter_email: '',
    reporter_position: '',
    patients_reached: '',
    patient: '',
    risk_probability: '',
    risk_impact: '',
    analysis_possible_causes: '',
    corrective_action: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [departmentOptions, setDepartmentOptions] = useState<LinkFieldOption[]>([])
  const [departmentOpen, setDepartmentOpen] = useState(false)
  const [departmentQuery, setDepartmentQuery] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState<LinkFieldOption | null>(null)
  const departmentRef = useRef<HTMLDivElement>(null)

  const [patientQuery, setPatientQuery] = useState('')
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(null)
  const patientRef = useRef<HTMLDivElement>(null)

  const riskScore = useMemo(() => {
    const p = Number(form.risk_probability)
    const i = Number(form.risk_impact)
    if (!p || !i) return null
    return p * i
  }, [form.risk_probability, form.risk_impact])

  const riskRate = useMemo(() => {
    if (riskScore == null) return ''
    if (riskScore <= 8) return 'Low Risk'
    if (riskScore <= 15) return 'Medium Risk'
    return 'High Risk'
  }, [riskScore])

  const showOtherSpecify =
    form.event_category === 'Other' ||
    form.clinical_event_type === 'Other' ||
    form.non_clinical_event_type === 'Other'

  useEffect(() => {
    if (!departmentOpen) return
    const id = setTimeout(async () => {
      try {
        setDepartmentOptions(await fetchMedicalDepartments(departmentQuery))
      } catch {
        setDepartmentOptions([])
      }
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
      } catch {
        setPatientOptions([])
      }
    }, patientQuery.trim() ? 300 : 0)
    return () => clearTimeout(id)
  }, [patientOpen, patientQuery])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (departmentRef.current && !departmentRef.current.contains(e.target as Node)) setDepartmentOpen(false)
      if (patientRef.current && !patientRef.current.contains(e.target as Node)) setPatientOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.report_type) {
      setError('Select what is being reported')
      return
    }
    if (!form.event_category) {
      setError('Event category is required')
      return
    }
    if (!form.event_discovery_date) {
      setError('Event discovery date is required')
      return
    }
    if (!form.description.trim()) {
      setError('Please briefly describe the event')
      return
    }
    if (form.event_category === 'Clinical' && !form.clinical_event_type) {
      setError('Select a clinical event type')
      return
    }
    if (form.event_category === 'Non Clinical' && !form.non_clinical_event_type) {
      setError('Select a non-clinical event type')
      return
    }
    if (form.event_category === 'Sentinel Events' && !form.sentinel_event_type) {
      setError('Select a sentinel event type')
      return
    }
    if (showOtherSpecify && !form.other_event_specify.trim()) {
      setError('Please specify the other event')
      return
    }
    if (form.report_type === 'An Incident' && !form.harm_evidence) {
      setError('Indicate whether there was evidence of harm')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      await createPatientSafetyEvent({
        report_type: form.report_type,
        harm_evidence: form.harm_evidence || undefined,
        event_category: form.event_category,
        clinical_event_type: form.clinical_event_type || undefined,
        non_clinical_event_type: form.non_clinical_event_type || undefined,
        sentinel_event_type: form.sentinel_event_type || undefined,
        other_event_specify: form.other_event_specify.trim() || undefined,
        event_discovery_date: form.event_discovery_date,
        event_discovery_time: form.event_discovery_time || undefined,
        report_date: form.report_date || undefined,
        location: form.location.trim() || undefined,
        department: form.department || undefined,
        description: form.description.trim(),
        immediate_action: form.immediate_action.trim() || undefined,
        affected_person: form.affected_person || undefined,
        is_anonymous: form.is_anonymous,
        reporter_first_name: form.is_anonymous ? undefined : form.reporter_first_name.trim() || undefined,
        reporter_middle_name: form.is_anonymous ? undefined : form.reporter_middle_name.trim() || undefined,
        reporter_last_name: form.is_anonymous ? undefined : form.reporter_last_name.trim() || undefined,
        reporter_mobile: form.is_anonymous ? undefined : form.reporter_mobile.trim() || undefined,
        reporter_email: form.is_anonymous ? undefined : form.reporter_email.trim() || undefined,
        reporter_position: form.is_anonymous ? undefined : form.reporter_position.trim() || undefined,
        patients_reached: form.patients_reached ? Number(form.patients_reached) : undefined,
        patient: form.patient || undefined,
        risk_probability: form.risk_probability || undefined,
        risk_impact: form.risk_impact || undefined,
        analysis_possible_causes: form.analysis_possible_causes.trim() || undefined,
        corrective_action: form.corrective_action.trim() || undefined,
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
      <div className={createModalShellClass('w-full max-w-3xl max-h-[92vh]')}>
        <CreateModalHeader title="Event Reporting Form" onClose={onClose} />
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto px-6 py-5 flex-1 space-y-6">
            <p className="text-xs text-slate-500 border border-amber-200 bg-amber-50/80 rounded-lg px-3 py-2">
              Confidential — for study and quality improvement only. Not a legal document and not part of the
              medical staff file.
            </p>

            {/* 1–4 Report type & discovery */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1">
                Reporter section
              </h3>
              <div>
                <label className={MODAL_LABEL_CLASS}>
                  1. What is being reported? <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.report_type}
                  onChange={(e) => setField('report_type', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                >
                  <option value="">Select…</option>
                  <option value="An Incident">An incident (reached the patient, with or without harm)</option>
                  <option value="Near Miss">Near Miss (did not reach the patient)</option>
                  <option value="Sentinel Event">Sentinel event (death, permanent or severe temporary harm)</option>
                  <option value="Other Events">Other Events</option>
                </select>
              </div>

              {form.report_type === 'An Incident' && (
                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    2. Evidence of harm to the patient? <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-800 mt-1">
                    {['Yes', 'No', 'Unknown'].map((opt) => (
                      <label key={opt} className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="harm_evidence"
                          checked={form.harm_evidence === opt}
                          onChange={() => setField('harm_evidence', opt)}
                          className="h-4 w-4"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    3. Event Discovery Date <span className="text-red-500">*</span>
                  </label>
                  <DateFilterInput
                    value={form.event_discovery_date}
                    onChange={(e) => setField('event_discovery_date', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className={MODAL_LABEL_CLASS}>4. Event Discovery Time</label>
                  <input
                    type="time"
                    value={form.event_discovery_time}
                    onChange={(e) => setField('event_discovery_time', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className={MODAL_LABEL_CLASS}>9. Report Date</label>
                  <DateFilterInput
                    value={form.report_date}
                    onChange={(e) => setField('report_date', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                  />
                </div>
              </div>
            </section>

            {/* 5 Location */}
            <section className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={MODAL_LABEL_CLASS}>5a. Where did the event occur?</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setField('location', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                    placeholder="Location / unit"
                  />
                </div>
                <div ref={departmentRef}>
                  <label className={MODAL_LABEL_CLASS}>5b. Department / Section Responsible</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={selectedDepartment ? selectedDepartment.label : departmentQuery}
                      onChange={(e) => {
                        setDepartmentQuery(e.target.value)
                        setDepartmentOpen(true)
                        if (selectedDepartment) {
                          setSelectedDepartment(null)
                          setField('department', '')
                        }
                      }}
                      onFocus={() => setDepartmentOpen(true)}
                      placeholder="Search department…"
                      className={`${linkComboboxInputWithClearClass} pr-9`}
                    />
                    {selectedDepartment ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDepartment(null)
                          setDepartmentQuery('')
                          setField('department', '')
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
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
                            onClick={() => {
                              setSelectedDepartment(opt)
                              setDepartmentQuery('')
                              setField('department', opt.name)
                              setDepartmentOpen(false)
                            }}
                            className={`${linkComboboxOptionClassCompact} text-slate-900`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* 6 Description */}
            <div>
              <label className={MODAL_LABEL_CLASS}>
                6. Briefly describe the event or unsafe condition <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                className={`${MODAL_FIELD_CLASS} resize-y min-h-[5rem]`}
              />
            </div>

            {/* 7 Classification */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1">
                7. Clinical / Non Clinical / Sentinel
              </h3>
              <div>
                <label className={MODAL_LABEL_CLASS}>
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.event_category}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      event_category: e.target.value,
                      clinical_event_type: '',
                      non_clinical_event_type: '',
                      sentinel_event_type: '',
                      other_event_specify: '',
                    }))
                  }
                  className={MODAL_FIELD_CLASS}
                >
                  <option value="">Select…</option>
                  <option value="Clinical">A — Clinical</option>
                  <option value="Non Clinical">B — Non Clinical</option>
                  <option value="Sentinel Events">C — Sentinel Events</option>
                  <option value="Other">D — Other</option>
                </select>
              </div>

              {form.event_category === 'Clinical' && (
                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    A — Clinical event <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.clinical_event_type}
                    onChange={(e) => setField('clinical_event_type', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                  >
                    <option value="">Select…</option>
                    {CLINICAL_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {form.event_category === 'Non Clinical' && (
                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    B — Non Clinical <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.non_clinical_event_type}
                    onChange={(e) => setField('non_clinical_event_type', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                  >
                    <option value="">Select…</option>
                    {NON_CLINICAL_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {form.event_category === 'Sentinel Events' && (
                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    C — Sentinel Events <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.sentinel_event_type}
                    onChange={(e) => setField('sentinel_event_type', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                  >
                    <option value="">Select…</option>
                    {SENTINEL_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {showOtherSpecify && (
                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    Other (Specify) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.other_event_specify}
                    onChange={(e) => setField('other_event_specify', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                  />
                </div>
              )}
            </section>

            {/* 8 Affected person */}
            <div>
              <label className={MODAL_LABEL_CLASS}>8. Affected Person</label>
              <div className="flex flex-wrap gap-4 text-sm text-slate-800 mt-1">
                {['Patient', 'Family / Visitor', 'Staff / Employee'].map((opt) => (
                  <label key={opt} className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="affected_person"
                      checked={form.affected_person === opt}
                      onChange={() => setField('affected_person', opt)}
                      className="h-4 w-4"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            {/* Reporter 9–14 */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1">
                Report and Event Reporter Information
              </h3>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_anonymous}
                  onChange={(e) => setField('is_anonymous', e.target.checked)}
                  className="h-4 w-4"
                />
                10. Anonymous Reporter
              </label>

              {!form.is_anonymous && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className={MODAL_LABEL_CLASS}>11. First Name</label>
                    <input
                      type="text"
                      value={form.reporter_first_name}
                      onChange={(e) => setField('reporter_first_name', e.target.value)}
                      className={MODAL_FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={MODAL_LABEL_CLASS}>Middle Name</label>
                    <input
                      type="text"
                      value={form.reporter_middle_name}
                      onChange={(e) => setField('reporter_middle_name', e.target.value)}
                      className={MODAL_FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={MODAL_LABEL_CLASS}>Last Name</label>
                    <input
                      type="text"
                      value={form.reporter_last_name}
                      onChange={(e) => setField('reporter_last_name', e.target.value)}
                      className={MODAL_FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={MODAL_LABEL_CLASS}>12. Mobile No</label>
                    <input
                      type="text"
                      value={form.reporter_mobile}
                      onChange={(e) => setField('reporter_mobile', e.target.value)}
                      className={MODAL_FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={MODAL_LABEL_CLASS}>13. E-mail Address</label>
                    <input
                      type="email"
                      value={form.reporter_email}
                      onChange={(e) => setField('reporter_email', e.target.value)}
                      className={MODAL_FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={MODAL_LABEL_CLASS}>14. Position Title</label>
                    <input
                      type="text"
                      value={form.reporter_position}
                      onChange={(e) => setField('reporter_position', e.target.value)}
                      className={MODAL_FIELD_CLASS}
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Patient 15–17 */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1">
                Patient Information (complete only if patient is involved)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={MODAL_LABEL_CLASS}>15. How many patients did the incident reach?</label>
                  <input
                    type="number"
                    min={0}
                    value={form.patients_reached}
                    onChange={(e) => setField('patients_reached', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                  />
                </div>
                <div ref={patientRef}>
                  <label className={MODAL_LABEL_CLASS}>16. Patient</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={
                        selectedPatient
                          ? selectedPatient.patient_name || selectedPatient.name
                          : patientQuery
                      }
                      onChange={(e) => {
                        setPatientQuery(e.target.value)
                        setPatientOpen(true)
                        if (selectedPatient) {
                          setSelectedPatient(null)
                          setField('patient', '')
                        }
                      }}
                      onFocus={() => setPatientOpen(true)}
                      placeholder="Search name / file no…"
                      className={MODAL_FIELD_CLASS}
                    />
                    {patientOpen && patientOptions.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-xl border border-emerald-200/80 bg-white py-1 text-slate-900 shadow-lg ring-1 ring-emerald-300/40">
                        {patientOptions.map((p) => (
                          <button
                            key={p.name}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm transition hover:bg-emerald-50/80"
                            onClick={() => {
                              setSelectedPatient(p)
                              setField('patient', p.name)
                              setPatientQuery(p.patient_name || p.name)
                              setPatientOpen(false)
                            }}
                          >
                            <div className="font-medium">{p.patient_name || p.name}</div>
                            <div className="text-xs text-slate-500">
                              {[p.file_number || p.name, p.id_number].filter(Boolean).join(' · ')}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedPatient && (
                    <p className="mt-1 text-xs text-slate-500">
                      CPR: {selectedPatient.id_number || '—'} · File:{' '}
                      {selectedPatient.file_number || selectedPatient.name} · Gender:{' '}
                      {selectedPatient.sex || '—'}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* 18–19 Risk */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1">
                18–19. Risk Score (Probability × Severity of Impact)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={MODAL_LABEL_CLASS}>Probability (1–5)</label>
                  <select
                    value={form.risk_probability}
                    onChange={(e) => setField('risk_probability', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                  >
                    <option value="">Select…</option>
                    {Object.entries(PROBABILITY_HELP).map(([k, v]) => (
                      <option key={k} value={k}>
                        {k} — {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={MODAL_LABEL_CLASS}>Severity of Impact (1–5)</label>
                  <select
                    value={form.risk_impact}
                    onChange={(e) => setField('risk_impact', e.target.value)}
                    className={MODAL_FIELD_CLASS}
                  >
                    <option value="">Select…</option>
                    {Object.entries(IMPACT_HELP).map(([k, v]) => (
                      <option key={k} value={k}>
                        {k} — {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {riskScore != null && (
                <p className="text-sm text-slate-800">
                  Score: <span className="font-semibold">{riskScore}</span>
                  {' · '}
                  Risk Rate:{' '}
                  <span
                    className={
                      riskRate === 'High Risk'
                        ? 'font-semibold text-red-700'
                        : riskRate === 'Medium Risk'
                          ? 'font-semibold text-amber-700'
                          : 'font-semibold text-emerald-700'
                    }
                  >
                    {riskRate}
                  </span>
                  <span className="text-xs text-slate-500 ml-2">(1–8 Low · 9–15 Medium · 16–25 High)</span>
                </p>
              )}
            </section>

            <div>
              <label className={MODAL_LABEL_CLASS}>Immediate action taken</label>
              <textarea
                rows={6}
                value={form.immediate_action}
                onChange={(e) => setField('immediate_action', e.target.value)}
                className={`${MODAL_FIELD_CLASS} resize-y min-h-[9rem]`}
                placeholder="Describe immediate actions taken…"
              />
            </div>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1">
                To be filled by the management
              </h3>
              <div>
                <label className={MODAL_LABEL_CLASS}>Analysis / Possible Causes</label>
                <textarea
                  rows={6}
                  value={form.analysis_possible_causes}
                  onChange={(e) => setField('analysis_possible_causes', e.target.value)}
                  className={`${MODAL_FIELD_CLASS} resize-y min-h-[9rem]`}
                  placeholder="Analysis and possible causes…"
                />
              </div>
              <div>
                <label className={MODAL_LABEL_CLASS}>Corrective Action</label>
                <textarea
                  rows={6}
                  value={form.corrective_action}
                  onChange={(e) => setField('corrective_action', e.target.value)}
                  className={`${MODAL_FIELD_CLASS} resize-y min-h-[9rem]`}
                  placeholder="Corrective action…"
                />
              </div>
            </section>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
    </div>
  )
}
