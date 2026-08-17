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
import { toast } from '../../hooks/useToast'
import {
  linkComboboxDropdownClassShort,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'
import { X } from 'lucide-react'
import { apiRequest } from '../../services/apiClient'

interface CreatePatientMedicalConsentModalProps {
  onClose: () => void
  onSuccess?: () => void
  /** Prefill patient from the top toolbar / context */
  initialPatient?: string
  /** Prefill admission from context */
  initialAdmission?: string
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

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (patientRef.current && !patientRef.current.contains(e.target as Node)) setPatientOpen(false)
      if (admissionRef.current && !admissionRef.current.contains(e.target as Node)) setAdmissionOpen(false)
      if (practitionerRef.current && !practitionerRef.current.contains(e.target as Node)) setPractitionerOpen(false)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.patient) {
      setError('Patient is required')
      return
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