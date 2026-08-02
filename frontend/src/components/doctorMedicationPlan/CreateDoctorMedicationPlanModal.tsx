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
import { FileText } from 'lucide-react'
import { createDoctorMedicationPlan } from '../../services/doctorMedicationPlan'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import {
  fetchHealthcarePractitioners,
  fetchInpatientAdmissions,
  fetchPatientVisits as fetchPatientVisitOptions,
  getCurrentUserPractitioner,
  type LinkFieldOption,
} from '../../services/common'
import {
  linkComboboxDropdownClassTall,
  linkComboboxInputClass,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClass,
} from '../ui/linkComboboxStyles'
import { toast } from '../../hooks/useToast'
import { CreatePractitionerModal } from '../practitioners/CreatePractitionerModal'
import { useCareContext } from '../../providers/CareContextProvider'
import { toDatetimeLocalValue } from '../../utils/datetimeLocal'

interface CreateDoctorMedicationPlanModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
}

export const CreateDoctorMedicationPlanModal = ({
  onClose,
  onSuccess,
  initialPatient,
}: CreateDoctorMedicationPlanModalProps) => {
  const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  const isOPMode = mode === 'OP'
  const isIPMode = mode === 'IP'

  const [formData, setFormData] = useState({
    patient: initialPatient || contextPatient || '',
    practitioner: '',
    posting_date: toDatetimeLocalValue(),
    patient_visit: isOPMode && activeVisit ? activeVisit : '',
    admission_no: isIPMode && activeAdmission ? activeAdmission : '',
    plan: '',
    recommendation: '',
    reception_note: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreatePractitioner, setShowCreatePractitioner] = useState(false)

  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientQuery, setPatientQuery] = useState(initialPatient || contextPatient || '')
  const [patientLoading, setPatientLoading] = useState(false)

  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [filteredPractitionerOptions, setFilteredPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerLoading, setPractitionerLoading] = useState(false)

  const [visitOptions, setVisitOptions] = useState<{ name: string; label: string }[]>([])
  const [admissionOptions, setAdmissionOptions] = useState<LinkFieldOption[]>([])

  useEffect(() => {
    if (formData.patient) {
      fetchPatientVisitOptions(formData.patient)
        .then(setVisitOptions)
        .catch(() => setVisitOptions([]))
      fetchInpatientAdmissions(formData.patient)
        .then(setAdmissionOptions)
        .catch(() => setAdmissionOptions([]))
    } else {
      setVisitOptions([])
      setAdmissionOptions([])
    }
  }, [formData.patient])

  useEffect(() => {
    const id = initialPatient || contextPatient
    if (!id) return
    fetchPatients(1, 0, id)
      .then((rows) => {
        if (rows.length > 0) setPatientQuery(rows[0].patient_name)
      })
      .catch(() => {})
  }, [initialPatient, contextPatient])

  useEffect(() => {
    const loadPractitioners = async () => {
      try {
        setPractitionerLoading(true)
        const results = await fetchHealthcarePractitioners()
        setPractitionerOptions(results)
        setFilteredPractitionerOptions(results)

        const me = await getCurrentUserPractitioner()
        if (me) {
          const opt = results.find((p) => p.name === me)
          setFormData((prev) => ({
            ...prev,
            practitioner: me,
          }))
          if (opt) setPractitionerQuery(opt.label)
        }
      } catch {
        setPractitionerOptions([])
        setFilteredPractitionerOptions([])
      } finally {
        setPractitionerLoading(false)
      }
    }
    loadPractitioners()
  }, [])

  useEffect(() => {
    if (!practitionerOpen) return
    const timeoutId = setTimeout(() => {
      if (!practitionerQuery.trim()) {
        setFilteredPractitionerOptions(practitionerOptions)
      } else {
        const q = practitionerQuery.toLowerCase()
        setFilteredPractitionerOptions(
          practitionerOptions.filter((p) => p.label.toLowerCase().includes(q))
        )
      }
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [practitionerQuery, practitionerOpen, practitionerOptions])

  useEffect(() => {
    if (!patientOpen || contextPatient) return
    const q = patientQuery.trim()
    const timeoutId = setTimeout(async () => {
      try {
        setPatientLoading(true)
        const results = await searchPatients(q, 20)
        setPatientOptions(results)
      } catch {
        setPatientOptions([])
      } finally {
        setPatientLoading(false)
      }
    }, q === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [patientQuery, patientOpen, contextPatient])

  useEffect(() => {
    if (!isOPMode || !formData.patient || visitOptions.length === 0) return
    setFormData((prev) => {
      const hasVisit = (id: string) => visitOptions.some((v) => v.name === id)
      let vid = prev.patient_visit
      if (activeVisit && hasVisit(activeVisit)) vid = activeVisit
      else if (vid && hasVisit(vid)) {
        /* keep */
      } else vid = visitOptions[0]?.name || ''
      return vid === prev.patient_visit ? prev : { ...prev, patient_visit: vid || '' }
    })
  }, [isOPMode, formData.patient, activeVisit, visitOptions])

  useEffect(() => {
    if (!isIPMode || !formData.patient || admissionOptions.length === 0) return
    setFormData((prev) => {
      const hasAdmission = (id: string) => admissionOptions.some((a) => a.name === id)
      let aid = prev.admission_no
      if (activeAdmission && hasAdmission(activeAdmission)) aid = activeAdmission
      else if (aid && hasAdmission(aid)) {
        /* keep */
      } else aid = admissionOptions[0]?.name || ''
      return aid === prev.admission_no ? prev : { ...prev, admission_no: aid || '' }
    })
  }, [isIPMode, formData.patient, activeAdmission, admissionOptions])

  const handlePatientSelect = (p: PatientListItem) => {
    setFormData((prev) => ({ ...prev, patient: p.name, patient_visit: '', admission_no: '' }))
    setPatientQuery(p.patient_name)
    setPatientOpen(false)
  }

  const handlePractitionerSelect = (pr: LinkFieldOption) => {
    setFormData((prev) => ({ ...prev, practitioner: pr.name }))
    setPractitionerQuery(pr.label)
    setPractitionerOpen(false)
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isOPMode && !isIPMode) {
      setError(`Switch to OP or IP mode in the navbar to create a Doctor's Plan.`)
      return
    }
    if (!formData.patient) {
      setError('Patient is required')
      return
    }
    if (isOPMode && !formData.patient_visit) {
      setError('Please select a patient visit')
      return
    }
    if (isIPMode && !formData.admission_no) {
      setError('Please select an inpatient admission')
      return
    }
    if (!formData.plan.trim()) {
      setError('Plan is required')
      return
    }

    try {
      setLoading(true)
      setError(null)
      await createDoctorMedicationPlan({
        patient: formData.patient,
        practitioner: formData.practitioner || undefined,
        posting_date: formData.posting_date || undefined,
        reference_doctype: isIPMode ? 'Inpatient Admission' : 'Patient Visit',
        reference_document: isIPMode ? formData.admission_no : formData.patient_visit,
        plan: formData.plan.trim(),
        recommendation: formData.recommendation.trim() || undefined,
        reception_note: formData.reception_note.trim() || undefined,
      })
      toast.success("Doctor's plan saved")
      onSuccess?.()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save doctor's plan"
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const submitDisabled =
    loading ||
    (!isOPMode && !isIPMode) ||
    !formData.patient ||
    (isOPMode && !formData.patient_visit) ||
    (isIPMode && !formData.admission_no) ||
    !formData.plan.trim()

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-2xl w-full max-h-[90vh]')}>
        <CreateModalHeader
          title="Add Doctor's Plan"
          icon={<FileText className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          subtitle={
            <>
              {isOPMode ? (
                <span className="mr-2 inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                  OP — linked to visit
                </span>
              ) : isIPMode ? (
                <span className="mr-2 inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                  IP — linked to admission
                </span>
              ) : null}
              Free-text plan for the visit or admission — e.g. review timing, referrals, investigations, trials.
            </>
          }
          onClose={onClose}
        />

        <form
          onSubmit={handleSubmit}
          className={`${CREATE_MODAL_BODY_GRADIENT} flex flex-col flex-1 min-h-0`}
          onClick={(e) => {
            const target = e.target as HTMLElement
            if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
              setPatientOpen(false)
              setPractitionerOpen(false)
            }
          }}
        >
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {!isOPMode && !isIPMode && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
                Switch to <strong>OP</strong> or <strong>IP</strong> mode in the navbar to create a Doctor's Plan.
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Patient <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={patientQuery}
                  onChange={(e) => {
                    setPatientQuery(e.target.value)
                    setPatientOpen(true)
                  }}
                  onFocus={() => setPatientOpen(true)}
                  placeholder="Search patient..."
                  className={linkComboboxInputClass}
                  disabled={Boolean(contextPatient)}
                />
                {contextPatient && (
                  <p className="text-xs text-slate-400 mt-1">Patient auto-selected from context</p>
                )}
                {patientLoading && (
                  <div className="absolute right-3 top-2.5 text-slate-400 text-xs">Loading...</div>
                )}
                {patientOpen && !contextPatient && patientOptions.length > 0 && (
                  <div className={linkComboboxDropdownClassTall}>
                    {patientOptions.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => handlePatientSelect(p)}
                        className={linkComboboxOptionClass}
                      >
                        <div className="font-medium">{p.patient_name}</div>
                        {p.mobile && <div className="text-xs text-slate-500">{p.mobile}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {formData.patient && isOPMode && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Patient Visit <span className="text-red-500">*</span>
                </label>
                {activeVisit ? (
                  <div>
                    <input
                      type="text"
                      value={formData.patient_visit}
                      readOnly
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                    />
                    <p className="text-xs text-slate-400 mt-1">Auto-selected from OP context</p>
                  </div>
                ) : (
                  <select
                    value={formData.patient_visit}
                    onChange={(e) => handleChange('patient_visit', e.target.value)}
                    required
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">— Select visit —</option>
                    {visitOptions.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {formData.patient && isIPMode && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Inpatient Admission <span className="text-red-500">*</span>
                </label>
                {activeAdmission ? (
                  <div>
                    <input
                      type="text"
                      value={formData.admission_no}
                      readOnly
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                    />
                    <p className="text-xs text-slate-400 mt-1">Auto-selected from IP context</p>
                  </div>
                ) : (
                  <select
                    value={formData.admission_no}
                    onChange={(e) => handleChange('admission_no', e.target.value)}
                    required
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">— Select admission —</option>
                    {admissionOptions.map((a) => (
                      <option key={a.name} value={a.name}>
                        {a.label || a.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Doctor Name</label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={practitionerQuery}
                  onChange={(e) => {
                    setPractitionerQuery(e.target.value)
                    setPractitionerOpen(true)
                  }}
                  onFocus={() => setPractitionerOpen(true)}
                  placeholder="Search doctor..."
                  className={linkComboboxInputWithClearClass}
                />
                <button
                  type="button"
                  className="ml-2 text-xs text-primary whitespace-nowrap"
                  onClick={() => setShowCreatePractitioner(true)}
                >
                  + New
                </button>
                {practitionerLoading && (
                  <div className="absolute right-8 top-2.5 text-slate-400 text-xs">Loading...</div>
                )}
                {practitionerOpen && !practitionerLoading && filteredPractitionerOptions.length > 0 && (
                  <div className={`${linkComboboxDropdownClassTall} top-full left-0`}>
                    {filteredPractitionerOptions.map((pr) => (
                      <button
                        key={pr.name}
                        type="button"
                        onClick={() => handlePractitionerSelect(pr)}
                        className={linkComboboxOptionClass}
                      >
                        <div>
                          <div className="font-medium">{pr.label}</div>
                          <div className="text-xs text-slate-500">{pr.name}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Posting Date</label>
              <input
                type="datetime-local"
                value={formData.posting_date}
                onChange={(e) => handleChange('posting_date', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Plan <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.plan}
                onChange={(e) => handleChange('plan', e.target.value)}
                rows={4}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Medication plan..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Recommendation</label>
              <textarea
                value={formData.recommendation}
                onChange={(e) => handleChange('recommendation', e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reception Note</label>
              <textarea
                value={formData.reception_note}
                onChange={(e) => handleChange('reception_note', e.target.value)}
                rows={2}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>Cancel</button>
            <button type="submit" disabled={submitDisabled} className={CM_BTN_PRIMARY}>
              {loading ? 'Saving…' : 'Save Plan'}
            </button>
          </CreateModalFooter>
        </form>
      </div>

      {showCreatePractitioner && (
        <CreatePractitionerModal
          onClose={() => setShowCreatePractitioner(false)}
          onSuccess={(practitionerName) => {
            setFormData((prev) => ({ ...prev, practitioner: practitionerName }))
            fetchHealthcarePractitioners()
              .then((results) => {
                setPractitionerOptions(results)
                setFilteredPractitionerOptions(results)
                const opt = results.find((p) => p.name === practitionerName)
                if (opt) setPractitionerQuery(opt.label)
              })
              .catch(() => {})
            setPractitionerOpen(false)
            setShowCreatePractitioner(false)
          }}
        />
      )}
    </div>
  )
}
