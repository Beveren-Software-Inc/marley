import { useState, useEffect, useRef } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  CreateModalHeader,
  createModalShellClass,
  MODAL_FIELD_CLASS,
  MODAL_LABEL_CLASS,
  MODAL_ERROR_BOX_CLASS,
} from '../ui/CreateModalChrome'
import { fetchPatients, type PatientListItem } from '../../services/patients'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import {
  fetchPatientHealthHistoryTemplate2Details,
  fetchPatientHealthHistoryTemplate2Options,
} from '../../services/patients'
import { toast } from '../../hooks/useToast'
import {
  linkComboboxDropdownClassShort,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'
import { X, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { apiRequest } from '../../services/apiClient'

interface CreatePatientMedicalConsentModalProps {
  onClose: () => void
  onSuccess?: () => void
  /** Prefill patient from the top toolbar / context */
  initialPatient?: string
  /** Prefill admission from context */
  initialAdmission?: string
}

interface HealthHistoryRow {
  _key: string
  history: string
  /** null = unanswered (must pick Yes or No), true = Yes, false = No */
  yes: boolean | null
  remarks: string
  no_format: number
  is_diabetic: boolean
  type: string
}

export const CreatePatientMedicalConsentModal = ({
  onClose,
  onSuccess,
  initialPatient,
  initialAdmission,
}: CreatePatientMedicalConsentModalProps) => {
  const [form, setForm] = useState({
    patient: initialPatient || '',
    inpatient_admission: initialAdmission || '',
    procedure_or_treatment: '',
    consent_text:
      '<p>I confirm that the nature, purpose, benefits and risks of the proposed treatment have been explained to me in a language I understand, and I consent to the treatment described above.</p>',
    procedures_explained: true,
    risks_explained: true,
    alternatives_explained: false,
    questions_answered: false,
    guardian_name: '',
    guardian_relationship: '',
    witness_name: '',
    practitioner: '',
    status: 'Draft',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Patient search
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const patientRef = useRef<HTMLDivElement>(null)
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(null)

  // Admission dropdown
  const [admissionOptions, setAdmissionOptions] = useState<LinkFieldOption[]>([])
  const [admissionOpen, setAdmissionOpen] = useState(false)
  const [admissionQuery, setAdmissionQuery] = useState('')
  const [selectedAdmission, setSelectedAdmission] = useState<LinkFieldOption | null>(null)
  const admissionRef = useRef<HTMLDivElement>(null)

  // Practitioner search
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [selectedPractitioner, setSelectedPractitioner] = useState<LinkFieldOption | null>(null)
  const practitionerRef = useRef<HTMLDivElement>(null)

  // Health History Template 2
  const [template2Options, setTemplate2Options] = useState<LinkFieldOption[]>([])
  const [template2Open, setTemplate2Open] = useState(false)
  const [template2Query, setTemplate2Query] = useState('')
  const [template2Selected, setTemplate2Selected] = useState<LinkFieldOption | null>(null)
  const [template2Loading, setTemplate2Loading] = useState(false)
  const [healthRows, setHealthRows] = useState<HealthHistoryRow[]>([])
  const template2Ref = useRef<HTMLDivElement>(null)

  // Load initial patient if provided
  useEffect(() => {
    if (!initialPatient) return
    // Store as selected patient with just the name
    setSelectedPatient({ name: initialPatient, patient_name: initialPatient })
    setForm((prev) => ({ ...prev, patient: initialPatient }))
    setPatientQuery(initialPatient)
  }, [initialPatient])

  // Load initial admission if provided
  useEffect(() => {
    if (!initialAdmission) return
    setSelectedAdmission({ name: initialAdmission, label: initialAdmission })
    setForm((prev) => ({ ...prev, inpatient_admission: initialAdmission }))
    setAdmissionQuery(initialAdmission)
  }, [initialAdmission])

  // Patient search
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

  // Admission search - fetches inpatient admissions for the selected patient
  useEffect(() => {
    if (!admissionOpen || !form.patient) return
    const id = setTimeout(async () => {
      try {
        const params = new URLSearchParams()
        params.append('patient', form.patient)
        params.append('limit', '20')
        const res = await fetch(`/api/method/healthcare.api.common.get_inpatient_admissions?${params.toString()}`)
        const data = await res.json()
        const list = Array.isArray(data?.message) ? data.message : []
        setAdmissionOptions(
          list.map((a: Record<string, unknown>) => ({
            name: String(a.name || ''),
            label: String(a.name || ''),
          }))
        )
      } catch { setAdmissionOptions([]) }
    }, admissionQuery.trim() ? 300 : 0)
    return () => clearTimeout(id)
  }, [admissionOpen, admissionQuery, form.patient])

  // Practitioner search
  useEffect(() => {
    if (!practitionerOpen) return
    const id = setTimeout(async () => {
      try {
        setPractitionerOptions(await fetchHealthcarePractitioners(practitionerQuery))
      } catch { setPractitionerOptions([]) }
    }, practitionerQuery.trim() ? 300 : 0)
    return () => clearTimeout(id)
  }, [practitionerOpen, practitionerQuery])

  // Template 2 options search
  useEffect(() => {
    if (!template2Open) return
    const id = setTimeout(async () => {
      try {
        const list = await fetchPatientHealthHistoryTemplate2Options(template2Query.trim() || undefined)
        setTemplate2Options(list)
      } catch { setTemplate2Options([]) }
    }, template2Query.trim() ? 300 : 0)
    return () => clearTimeout(id)
  }, [template2Open, template2Query])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (patientRef.current && !patientRef.current.contains(e.target as Node)) setPatientOpen(false)
      if (admissionRef.current && !admissionRef.current.contains(e.target as Node)) setAdmissionOpen(false)
      if (practitionerRef.current && !practitionerRef.current.contains(e.target as Node)) setPractitionerOpen(false)
      if (template2Ref.current && !template2Ref.current.contains(e.target as Node)) setTemplate2Open(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handlePatientSelect = (p: PatientListItem) => {
    setSelectedPatient(p)
    setForm((prev) => ({ ...prev, patient: p.name }))
    setPatientQuery('')
    setPatientOpen(false)
  }

  const clearPatient = () => {
    setSelectedPatient(null)
    setForm((prev) => ({ ...prev, patient: '' }))
    setPatientQuery('')
    setPatientOpen(false)
  }

  const handleAdmissionSelect = (opt: LinkFieldOption) => {
    setSelectedAdmission(opt)
    setForm((prev) => ({ ...prev, inpatient_admission: opt.name }))
    setAdmissionQuery('')
    setAdmissionOpen(false)
  }

  const clearAdmission = () => {
    setSelectedAdmission(null)
    setForm((prev) => ({ ...prev, inpatient_admission: '' }))
    setAdmissionQuery('')
    setAdmissionOpen(false)
  }

  const handlePractitionerSelect = (opt: LinkFieldOption) => {
    setSelectedPractitioner(opt)
    setForm((prev) => ({ ...prev, practitioner: opt.name }))
    setPractitionerQuery('')
    setPractitionerOpen(false)
  }

  const clearPractitioner = () => {
    setSelectedPractitioner(null)
    setForm((prev) => ({ ...prev, practitioner: '' }))
    setPractitionerQuery('')
    setPractitionerOpen(false)
  }

  const handleTemplate2Select = async (opt: LinkFieldOption) => {
    setTemplate2Selected(opt)
    setTemplate2Query(opt.label)
    setTemplate2Open(false)
    setTemplate2Loading(true)
    try {
      const details = await fetchPatientHealthHistoryTemplate2Details(opt.name)
      const items = details?.templates || []
      if (items.length > 0) {
        setHealthRows(
          items.map((r, idx) => ({
            _key: Math.random().toString(36).slice(2),
            history: r.history || '',
            yes: null,
            remarks: r.remarks || '',
            no_format: r.no_format || idx + 1,
            is_diabetic: Boolean(r.is_diabetic),
            type: r.type || '',
          }))
        )
        toast.success(`Loaded ${items.length} item${items.length !== 1 ? 's' : ''} from template.`)
      } else {
        toast.error('Template has no items.')
      }
    } catch {
      toast.error('Failed to load template.')
    } finally {
      setTemplate2Loading(false)
    }
  }

  const clearTemplate2 = () => {
    setTemplate2Selected(null)
    setTemplate2Query('')
    setTemplate2Open(false)
  }

  const addHealthRow = () =>
    setHealthRows((prev) => [
      ...prev,
      { _key: Math.random().toString(36).slice(2), history: '', yes: null, remarks: '', no_format: prev.length + 1, is_diabetic: false, type: '' },
    ])

  const removeHealthRow = (key: string) =>
    setHealthRows((prev) => prev.filter((r) => r._key !== key))

  const updateHealthRow = (key: string, field: keyof Omit<HealthHistoryRow, '_key'>, value: string | boolean | number) =>
    setHealthRows((prev) => prev.map((r) => (r._key === key ? { ...r, [field]: value } : r)))

  /** Force an explicit Yes/No answer; clear dependent detail fields when switching to No */
  const setYesNo = (key: string, value: boolean) =>
    setHealthRows((prev) =>
      prev.map((r) =>
        r._key === key
          ? { ...r, yes: value, ...(value ? {} : { type: '' }) }
          : r
      )
    )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.patient) {
      setError('Patient is required')
      return
    }
    for (const r of healthRows) {
      if (r.yes === null) {
        setError(`Please select Yes or No for "${r.history || 'item'}"`)
        return
      }
      if (r.yes && r.is_diabetic && !r.type.trim()) {
        setError(`Diabetic Type is required for "${r.history || 'item'}"`)
        return
      }
    }
    try {
      setLoading(true)
      setError(null)
      const body: Record<string, unknown> = {
        doctype: 'Patient Medical Consent',
        patient: form.patient,
        patient_name: selectedPatient?.patient_name || undefined,
        inpatient_admission: form.inpatient_admission || undefined,
        procedure_or_treatment: form.procedure_or_treatment || undefined,
        consent_text: form.consent_text || undefined,
        procedures_explained: form.procedures_explained ? 1 : 0,
        risks_explained: form.risks_explained ? 1 : 0,
        alternatives_explained: form.alternatives_explained ? 1 : 0,
        questions_answered: form.questions_answered ? 1 : 0,
        guardian_name: form.guardian_name || undefined,
        guardian_relationship: form.guardian_relationship || undefined,
        witness_name: form.witness_name || undefined,
        practitioner: form.practitioner || undefined,
        status: form.status || 'Draft',
        health_history: healthRows.map((r) => ({
          history: r.history,
          yes: r.yes ? 1 : 0,
          remarks: r.remarks,
          no_format: r.no_format,
          is_diabetic: r.is_diabetic ? 1 : 0,
          type: r.type,
        })),
      }
      await apiRequest<{ name: string }>('/api/resource/Patient%20Medical%20Consent', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      toast.success('Patient Medical Consent created')
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create consent')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('w-full max-w-2xl max-h-[90vh]')}>
        <CreateModalHeader title="New Patient Medical Consent" onClose={onClose} />
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto px-6 py-5 flex-1">
            {/* Patient + Admission */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div ref={patientRef}>
                <label className={MODAL_LABEL_CLASS}>Patient <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input
                    type="text"
                    value={selectedPatient ? (selectedPatient.patient_name || selectedPatient.name) : patientQuery}
                    onChange={(e) => {
                      setPatientQuery(e.target.value)
                      setPatientOpen(true)
                      if (selectedPatient) clearPatient()
                    }}
                    onFocus={() => setPatientOpen(true)}
                    placeholder="Search patient..."
                    className={`${linkComboboxInputWithClearClass} pr-9`}
                  />
                  {selectedPatient ? (
                    <button
                      type="button"
                      onClick={clearPatient}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      title="Clear"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : null}
                  {patientOpen && patientOptions.length > 0 && (
                    <div className={linkComboboxDropdownClassShort}>
                      {patientOptions.map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => handlePatientSelect(p)}
                          className={`${linkComboboxOptionClassCompact} text-slate-900`}
                        >
                          <div className="font-medium">{p.patient_name || p.name}</div>
                          <div className="text-[10px] text-slate-500">{p.name}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div ref={admissionRef}>
                <label className={MODAL_LABEL_CLASS}>Inpatient Admission</label>
                <div className="relative">
                  <input
                    type="text"
                    value={selectedAdmission ? selectedAdmission.label : admissionQuery}
                    onChange={(e) => {
                      setAdmissionQuery(e.target.value)
                      setAdmissionOpen(true)
                      if (selectedAdmission) clearAdmission()
                    }}
                    onFocus={() => setAdmissionOpen(true)}
                    placeholder={form.patient ? 'Search admission...' : 'Select patient first'}
                    disabled={!form.patient}
                    className={`${linkComboboxInputWithClearClass} pr-9 ${!form.patient ? 'bg-slate-50 text-slate-400' : ''}`}
                  />
                  {selectedAdmission ? (
                    <button
                      type="button"
                      onClick={clearAdmission}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      title="Clear"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : null}
                  {admissionOpen && admissionOptions.length > 0 && (
                    <div className={linkComboboxDropdownClassShort}>
                      {admissionOptions.map((opt) => (
                        <button
                          key={opt.name}
                          type="button"
                          onClick={() => handleAdmissionSelect(opt)}
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

            {/* Procedure + Practitioner */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={MODAL_LABEL_CLASS}>Procedure / Treatment</label>
                <input
                  type="text"
                  value={form.procedure_or_treatment}
                  onChange={(e) => setForm({ ...form, procedure_or_treatment: e.target.value })}
                  className={MODAL_FIELD_CLASS}
                  placeholder="e.g. ECT Procedure, Blood Draw"
                />
              </div>

              <div ref={practitionerRef}>
                <label className={MODAL_LABEL_CLASS}>Explaining Practitioner</label>
                <div className="relative">
                  <input
                    type="text"
                    value={selectedPractitioner ? selectedPractitioner.label : practitionerQuery}
                    onChange={(e) => {
                      setPractitionerQuery(e.target.value)
                      setPractitionerOpen(true)
                      if (selectedPractitioner) clearPractitioner()
                    }}
                    onFocus={() => setPractitionerOpen(true)}
                    placeholder="Search practitioner..."
                    className={`${linkComboboxInputWithClearClass} pr-9`}
                  />
                  {selectedPractitioner ? (
                    <button
                      type="button"
                      onClick={clearPractitioner}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      title="Clear"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : null}
                  {practitionerOpen && practitionerOptions.length > 0 && (
                    <div className={linkComboboxDropdownClassShort}>
                      {practitionerOptions.map((opt) => (
                        <button
                          key={opt.name}
                          type="button"
                          onClick={() => handlePractitionerSelect(opt)}
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

            {/* Consent statement */}
            <div className="mt-4">
              <label className={MODAL_LABEL_CLASS}>Consent Statement</label>
              <textarea
                rows={4}
                value={form.consent_text.replace(/<[^>]*>/g, '')}
                onChange={(e) => setForm({ ...form, consent_text: e.target.value })}
                className={`${MODAL_FIELD_CLASS} resize-y min-h-[5rem]`}
              />
            </div>

            {/* Checkboxes */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {([
                ['procedures_explained', 'Procedure Explained'],
                ['risks_explained', 'Risks & Side Effects Explained'],
                ['alternatives_explained', 'Alternatives Explained'],
                ['questions_answered', 'Questions Answered'],
              ] as const).map(([key, label]) => (
                <label key={key} className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(form[key])}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                    className="h-4 w-4"
                  />
                  {label}
                </label>
              ))}
            </div>

            {/* Guardian + Witness */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={MODAL_LABEL_CLASS}>Legal Guardian Name</label>
                <input
                  type="text"
                  value={form.guardian_name}
                  onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
                  className={MODAL_FIELD_CLASS}
                />
              </div>
              <div>
                <label className={MODAL_LABEL_CLASS}>Guardian Relationship</label>
                <input
                  type="text"
                  value={form.guardian_relationship}
                  onChange={(e) => setForm({ ...form, guardian_relationship: e.target.value })}
                  className={MODAL_FIELD_CLASS}
                />
              </div>
              <div>
                <label className={MODAL_LABEL_CLASS}>Witness Name</label>
                <input
                  type="text"
                  value={form.witness_name}
                  onChange={(e) => setForm({ ...form, witness_name: e.target.value })}
                  className={MODAL_FIELD_CLASS}
                />
              </div>
            </div>

            {/* Status */}
            <div className="mt-4">
              <label className={MODAL_LABEL_CLASS}>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={MODAL_FIELD_CLASS}
              >
                <option value="Draft">Draft</option>
                <option value="Signed">Signed</option>
                <option value="Declined">Declined</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            {/* Patient Health History */}
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Patient Health History</h3>
                  <p className="text-xs text-slate-500">Load a template to populate the numbered history items.</p>
                </div>
              </div>

              {/* Template 2 dropdown */}
              <div ref={template2Ref} className="mb-3">
                <label className={MODAL_LABEL_CLASS}>Health History Template 2</label>
                <div className="relative">
                  <input
                    type="text"
                    value={template2Selected ? template2Selected.label : template2Query}
                    onChange={(e) => {
                      setTemplate2Query(e.target.value)
                      setTemplate2Open(true)
                      if (template2Selected) clearTemplate2()
                    }}
                    onFocus={() => setTemplate2Open(true)}
                    placeholder="Search template..."
                    className={`${linkComboboxInputWithClearClass} pr-9`}
                  />
                  {template2Selected ? (
                    <button
                      type="button"
                      onClick={clearTemplate2}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      title="Clear"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : (
                    <ChevronDown className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  )}
                  {template2Open && template2Options.length > 0 && (
                    <div className={linkComboboxDropdownClassShort}>
                      {template2Options.map((opt) => (
                        <button
                          key={opt.name}
                          type="button"
                          onClick={() => handleTemplate2Select(opt)}
                          className={`${linkComboboxOptionClassCompact} text-slate-900`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {template2Loading && (
                  <p className="mt-1.5 text-xs text-slate-500">Loading template items…</p>
                )}
              </div>

              {/* Add row */}
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-600">
                  {healthRows.length} item{healthRows.length !== 1 ? 's' : ''}
                </p>
                <button
                  type="button"
                  onClick={addHealthRow}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </button>
              </div>

              {/* Rows */}
              {healthRows.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-sm text-slate-400">
                  No history items yet — select a template or add manually.
                </p>
              ) : (
                <div className="space-y-2">
                  {healthRows.map((row) => (
                    <div key={row._key} className="rounded-md border border-slate-200 bg-white p-3">
                      <div className="flex items-start gap-2">
                        {/* No Format */}
                        <div className="w-16 shrink-0">
                          <label className={`${MODAL_LABEL_CLASS} text-[10px]`}>No.</label>
                          <input
                            type="number"
                            value={row.no_format}
                            onChange={(e) => updateHealthRow(row._key, 'no_format', Number(e.target.value))}
                            className={`${MODAL_FIELD_CLASS} px-2 py-1 text-sm`}
                            min={0}
                          />
                        </div>
                        {/* History */}
                        <div className="flex-1">
                          <label className={`${MODAL_LABEL_CLASS} text-[10px]`}>History</label>
                          <input
                            type="text"
                            value={row.history}
                            onChange={(e) => updateHealthRow(row._key, 'history', e.target.value)}
                            className={`${MODAL_FIELD_CLASS} px-2 py-1 text-sm`}
                            placeholder="e.g. Diabetic, Hypertension…"
                          />
                        </div>
                        {/* Yes / No */}
                        <div className="pt-5 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setYesNo(row._key, true)}
                            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                              row.yes === true
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <span className={`inline-block h-2 w-2 rounded-full ${row.yes === true ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setYesNo(row._key, false)}
                            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                              row.yes === false
                                ? 'border-red-300 bg-red-50 text-red-700'
                                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <span className={`inline-block h-2 w-2 rounded-full ${row.yes === false ? 'bg-red-500' : 'bg-slate-300'}`} />
                            No
                          </button>
                        </div>
                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeHealthRow(row._key)}
                          className="mt-4 inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50"
                          title="Remove item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Diabetic conditional — only shown when Yes is selected */}
                      {row.yes === true && (
                        <div className="mt-2 flex items-center gap-3">
                          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                            <input
                              type="checkbox"
                              checked={row.is_diabetic}
                              onChange={(e) => {
                                updateHealthRow(row._key, 'is_diabetic', e.target.checked)
                                if (!e.target.checked) updateHealthRow(row._key, 'type', '')
                              }}
                              className="h-4 w-4"
                            />
                            Diabetic
                          </label>
                          {row.is_diabetic && (
                            <select
                              value={row.type}
                              onChange={(e) => updateHealthRow(row._key, 'type', e.target.value)}
                              className={`${MODAL_FIELD_CLASS} w-32 px-2 py-1 text-xs`}
                              required
                            >
                              <option value="">Select Type</option>
                              <option value="Type 1">Type 1</option>
                              <option value="Type 2">Type 2</option>
                            </select>
                          )}
                        </div>
                      )}

                      {/* Remarks */}
                      <div className="mt-2">
                        <label className={`${MODAL_LABEL_CLASS} text-[10px]`}>Remarks</label>
                        <textarea
                          rows={1}
                          value={row.remarks}
                          onChange={(e) => updateHealthRow(row._key, 'remarks', e.target.value)}
                          className={`${MODAL_FIELD_CLASS} resize-y px-2 py-1 text-sm`}
                          placeholder="Optional remarks…"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className={`${MODAL_ERROR_BOX_CLASS} mt-4`}>{error}</div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-3 bg-white">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={CM_BTN_PRIMARY}>
              {loading ? 'Creating…' : 'Create Consent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}