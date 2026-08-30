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
import { createDoctypeRow, updateDoctypeRow } from '../../services/doctypeResource'
import {
  fetchDoc,
  fetchHealthcarePractitioners,
  fetchInpatientAdmissionOptions,
  type LinkFieldOption,
} from '../../services/common'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import {
  fetchAdmissionClinicalBundle,
  type AdmissionClinicalDiagnosis,
} from '../../services/patientAdmissionClinical'
import { toast } from '../../hooks/useToast'
import {
  LOCKED_PRACTITIONER_INPUT_CLASS,
  useLockedLinkedPractitioner,
} from '../../hooks/useLockedLinkedPractitioner'
import {
  linkComboboxDropdownClass,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClass,
} from '../ui/linkComboboxStyles'
import { htmlToPlainText } from '../../utils/htmlToPlainText'
import { FileText } from 'lucide-react'
import { DateFilterInput } from '../ui/DateFilterInput'

function toDateInput(value?: string | null): string {
  if (!value) return ''
  const s = String(value).trim()
  if (!s) return ''
  return s.slice(0, 10)
}

function formatAdmissionDiagnoses(rows: AdmissionClinicalDiagnosis[]): string {
  return rows
    .map((dx) => {
      const title = (dx.diagnosis_name || dx.diagnosis || '').trim()
      const details = htmlToPlainText(dx.details || '').trim()
      if (title && details) return `${title}\n${details}`
      return title || details
    })
    .filter(Boolean)
    .join('\n\n')
}

interface CreateIPMedicalReportModalProps {
  onClose: () => void
  onSuccess?: () => void
  /** When set, modal loads and updates this report instead of creating. */
  editName?: string
  initialPatient?: string
  initialAdmission?: string
  initialAdmissionDate?: string
  initialDischargeDate?: string
  initialPractitioner?: string
}

export function CreateIPMedicalReportModal({
  onClose,
  onSuccess,
  editName,
  initialPatient,
  initialAdmission,
  initialAdmissionDate,
  initialDischargeDate,
  initialPractitioner,
}: CreateIPMedicalReportModalProps) {
  const isEdit = Boolean(editName?.trim())
  const {
    locked: practitionerLocked,
    practitionerId: linkedPractitionerId,
    practitionerLabel: linkedPractitionerLabel,
  } = useLockedLinkedPractitioner()

  const patientLocked = Boolean(initialPatient?.trim()) || isEdit
  const admissionLocked = Boolean(initialAdmission?.trim()) || isEdit

  const [saving, setSaving] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(isEdit)
  const [error, setError] = useState<string | null>(null)

  const [patient, setPatient] = useState(initialPatient || '')
  const [patientQuery, setPatientQuery] = useState(initialPatient || '')
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)

  const [admission, setAdmission] = useState(initialAdmission || '')
  const [admissionQuery, setAdmissionQuery] = useState(initialAdmission || '')
  const [admissionOptions, setAdmissionOptions] = useState<LinkFieldOption[]>([])
  const [admissionOpen, setAdmissionOpen] = useState(false)

  const [admissionDate, setAdmissionDate] = useState(toDateInput(initialAdmissionDate))
  const [dischargeDate, setDischargeDate] = useState(toDateInput(initialDischargeDate))
  const admissionDateLocked =
    Boolean(admissionDate) && (admissionLocked || Boolean(initialAdmissionDate) || isEdit)

  const [practitioner, setPractitioner] = useState(initialPractitioner || '')
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)

  const [reasonForAdmission, setReasonForAdmission] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [clinicalCourse, setClinicalCourse] = useState('')
  const [treatmentGiven, setTreatmentGiven] = useState('')
  const [conditionOnDischarge, setConditionOnDischarge] = useState('')
  const [recommendations, setRecommendations] = useState('')
  const [reportStatus, setReportStatus] = useState('Draft')

  useEffect(() => {
    if (!editName) return
    let cancelled = false
    setLoadingEdit(true)
    fetchDoc('IP Medical Report', editName)
      .then((doc) => {
        if (cancelled) return
        setPatient(String(doc.patient || ''))
        setPatientQuery(String(doc.patient_name || doc.patient || ''))
        setAdmission(String(doc.inpatient_admission || ''))
        setAdmissionQuery(String(doc.inpatient_admission || ''))
        setAdmissionDate(toDateInput(doc.admission_date as string))
        setDischargeDate(toDateInput(doc.discharge_date as string))
        setPractitioner(String(doc.practitioner || ''))
        setPractitionerQuery(String(doc.practitioner || doc.consultation_doctor_name || ''))
        setReasonForAdmission(String(doc.reason_for_admission || ''))
        setDiagnosis(String(doc.diagnosis || ''))
        setClinicalCourse(String(doc.clinical_course || ''))
        setTreatmentGiven(String(doc.treatment_given || ''))
        setConditionOnDischarge(String(doc.condition_on_discharge || ''))
        setRecommendations(String(doc.recommendations || ''))
        setReportStatus(String(doc.report_status || 'Draft'))
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load report')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEdit(false)
      })
    return () => {
      cancelled = true
    }
  }, [editName])

  useEffect(() => {
    if (isEdit) return
    if (!linkedPractitionerId || practitioner) return
    setPractitioner(linkedPractitionerId)
    setPractitionerQuery(linkedPractitionerLabel || linkedPractitionerId)
  }, [linkedPractitionerId, linkedPractitionerLabel, practitioner, isEdit])

  useEffect(() => {
    if (patientLocked) return
    const t = setTimeout(async () => {
      try {
        const rows =
          patientQuery.trim().length >= 2
            ? await searchPatients(patientQuery, 20)
            : await fetchPatients(20, 0)
        setPatientOptions(rows)
      } catch {
        setPatientOptions([])
      }
    }, patientQuery.trim() ? 300 : 0)
    return () => clearTimeout(t)
  }, [patientQuery, patientOpen, patientLocked])

  useEffect(() => {
    if (admissionLocked || !patient) {
      if (!patient) setAdmissionOptions([])
      return
    }
    fetchInpatientAdmissionOptions(admissionQuery || undefined, patient)
      .then(setAdmissionOptions)
      .catch(() => setAdmissionOptions([]))
  }, [admissionQuery, admissionOpen, patient, admissionLocked])

  useEffect(() => {
    if (practitionerLocked) return
    if (!practitionerOpen) return
    fetchHealthcarePractitioners(practitionerQuery || undefined)
      .then(setPractitionerOptions)
      .catch(() => setPractitionerOptions([]))
  }, [practitionerQuery, practitionerOpen, practitionerLocked])

  // When admission is chosen on create, pull dates + clinical text from admission diagnosis / discharge.
  useEffect(() => {
    if (isEdit) return
    const adm = (admission || '').trim()
    const patientId = (patient || initialPatient || '').trim()
    if (!adm) {
      setReasonForAdmission('')
      setDiagnosis('')
      setTreatmentGiven('')
      setConditionOnDischarge('')
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        const doc = await fetchDoc('Inpatient Admission', adm)
        if (cancelled) return
        const admit =
          toDateInput(doc.admitted_datetime as string) ||
          toDateInput(doc.admission_date as string) ||
          toDateInput(doc.scheduled_date as string)
        const dischargeDt =
          toDateInput(doc.discharge_datetime as string) ||
          toDateInput(doc.discharge_ordered_date as string)
        if (admit) setAdmissionDate((prev) => prev || admit)
        if (dischargeDt) setDischargeDate((prev) => prev || dischargeDt)
        if (!patient && doc.patient) {
          setPatient(String(doc.patient))
          setPatientQuery(String(doc.patient_name || doc.patient))
        }
      } catch {
        /* dates optional */
      }

      const bundlePatient = patientId || patient
      if (!bundlePatient) return
      try {
        const bundle = await fetchAdmissionClinicalBundle(bundlePatient, adm)
        if (cancelled) return
        const dxText = formatAdmissionDiagnoses(bundle.diagnoses || [])
        setReasonForAdmission(dxText)
        setDiagnosis(dxText)
        const discharge = bundle.discharge
        setTreatmentGiven(htmlToPlainText(discharge?.discharge_treatment_plan || '').trim())
        setConditionOnDischarge(htmlToPlainText(discharge?.discharge_conditions || '').trim())
        const dischargeDt =
          toDateInput(discharge?.display_discharge_date) ||
          toDateInput(discharge?.discharge_date) ||
          toDateInput(discharge?.final_discharge_date)
        if (dischargeDt) setDischargeDate((prev) => prev || dischargeDt)
      } catch {
        /* leave report fields blank if clinical summary fails */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [admission, patient, initialPatient, isEdit])

  const handleSave = async () => {
    if (!patient.trim()) {
      setError('Patient is required')
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      patient: patient.trim(),
      inpatient_admission: admission.trim() || undefined,
      admission_date: admissionDate || undefined,
      discharge_date: dischargeDate || undefined,
      practitioner: practitioner.trim() || undefined,
      reason_for_admission: reasonForAdmission.trim() || undefined,
      diagnosis: diagnosis.trim() || undefined,
      clinical_course: clinicalCourse.trim() || undefined,
      treatment_given: treatmentGiven.trim() || undefined,
      condition_on_discharge: conditionOnDischarge.trim() || undefined,
      recommendations: recommendations.trim() || undefined,
      report_status: reportStatus || 'Draft',
    }
    try {
      if (isEdit && editName) {
        await updateDoctypeRow('IP Medical Report', editName, payload)
        toast.success('IP Medical Report updated')
      } else {
        await createDoctypeRow('IP Medical Report', payload)
        toast.success('IP Medical Report created')
      }
      onSuccess?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${isEdit ? 'update' : 'create'} IP Medical Report`)
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white'
  const labelClass = 'block text-xs font-semibold text-slate-600 mb-1'

  return (
    <div className={CREATE_MODAL_OVERLAY} onClick={onClose}>
      <div
        className={createModalShellClass('max-w-2xl max-h-[min(90dvh,calc(100vh-1.5rem))] overflow-hidden my-auto')}
        onClick={(e) => e.stopPropagation()}
      >
        <CreateModalHeader
          title={isEdit ? 'Edit IP Medical Report' : 'Create IP Medical Report'}
          icon={<FileText className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
        />

        <div className={`${CREATE_MODAL_BODY_GRADIENT} space-y-4 p-5 sm:p-6 overflow-y-auto min-h-0 flex-1`}>
          {loadingEdit ? (
            <div className="flex items-center justify-center py-10 text-sm text-slate-500">
              Loading report…
            </div>
          ) : null}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loadingEdit ? (
          <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!patientLocked ? (
              <div className="relative sm:col-span-2">
                <label className={labelClass}>
                  Patient <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={patientQuery}
                  onChange={(e) => {
                    setPatientQuery(e.target.value)
                    setPatient('')
                    setPatientOpen(true)
                  }}
                  onFocus={() => setPatientOpen(true)}
                  placeholder="Search patient…"
                  className={linkComboboxInputWithClearClass}
                />
                {patientOpen && patientOptions.length > 0 && (
                  <div className={linkComboboxDropdownClass}>
                    {patientOptions.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        className={linkComboboxOptionClass}
                        onClick={() => {
                          setPatient(p.name)
                          setPatientQuery(p.patient_name || p.name)
                          setPatientOpen(false)
                          setAdmission('')
                          setAdmissionQuery('')
                          setAdmissionDate('')
                          setDischargeDate('')
                        }}
                      >
                        <div className="font-medium">{p.patient_name || p.name}</div>
                        <div className="text-xs text-slate-500">{p.name}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {!admissionLocked ? (
              <div className="relative sm:col-span-2">
                <label className={labelClass}>Admission</label>
                <input
                  type="text"
                  value={admissionQuery}
                  onChange={(e) => {
                    setAdmissionQuery(e.target.value)
                    setAdmission('')
                    setAdmissionOpen(true)
                  }}
                  onFocus={() => setAdmissionOpen(true)}
                  placeholder={patient ? 'Search admission…' : 'Select patient first'}
                  disabled={!patient}
                  className={linkComboboxInputWithClearClass}
                />
                {admissionOpen && admissionOptions.length > 0 && (
                  <div className={linkComboboxDropdownClass}>
                    {admissionOptions.map((opt) => (
                      <button
                        key={opt.name}
                        type="button"
                        className={linkComboboxOptionClass}
                        onClick={() => {
                          setAdmission(opt.name)
                          setAdmissionQuery(opt.label || opt.name)
                          setAdmissionOpen(false)
                        }}
                      >
                        {opt.label || opt.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {!admissionDateLocked ? (
              <div>
                <label className={labelClass}>Admission Date</label>
                <DateFilterInput
                  value={admissionDate}
                  onChange={(e) => setAdmissionDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            ) : null}

            <div className={!admissionDateLocked ? undefined : 'sm:col-span-2'}>
              <label className={labelClass}>Discharge Date</label>
              <DateFilterInput
                value={dischargeDate}
                onChange={(e) => setDischargeDate(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="relative sm:col-span-2">
              <label className={labelClass}>Consultant</label>
              <input
                type="text"
                value={practitionerQuery}
                readOnly={practitionerLocked}
                onChange={(e) => {
                  if (practitionerLocked) return
                  setPractitionerQuery(e.target.value)
                  setPractitioner('')
                  setPractitionerOpen(true)
                }}
                onFocus={() => {
                  if (!practitionerLocked) setPractitionerOpen(true)
                }}
                placeholder="Search consultant…"
                title={practitionerLocked ? 'Locked to your linked practitioner' : undefined}
                className={practitionerLocked ? LOCKED_PRACTITIONER_INPUT_CLASS : linkComboboxInputWithClearClass}
              />
              {practitionerOpen && !practitionerLocked && practitionerOptions.length > 0 && (
                <div className={linkComboboxDropdownClass}>
                  {practitionerOptions.map((opt) => (
                    <button
                      key={opt.name}
                      type="button"
                      className={linkComboboxOptionClass}
                      onClick={() => {
                        setPractitioner(opt.name)
                        setPractitionerQuery(opt.label || opt.name)
                        setPractitionerOpen(false)
                      }}
                    >
                      <div className="font-medium">{opt.label || opt.name}</div>
                      <div className="text-xs text-slate-500">{opt.name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className={labelClass}>Status</label>
              <select
                value={reportStatus}
                onChange={(e) => setReportStatus(e.target.value)}
                className={inputClass}
              >
                {['Draft', 'Issued', 'Cancelled'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3 border-t border-emerald-100/80 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800/70">Report</p>
            <p className="text-[11px] text-slate-500">
              Reason for Admission and Diagnosis fill from admission diagnoses. Treatment Given and
              Condition on Discharge fill from the Discharge record when available — you can edit
              before saving.
            </p>
            {(
              [
                ['Reason for Admission', reasonForAdmission, setReasonForAdmission],
                ['Diagnosis', diagnosis, setDiagnosis],
                ['Clinical Course', clinicalCourse, setClinicalCourse],
                ['Treatment Given', treatmentGiven, setTreatmentGiven],
                ['Condition on Discharge', conditionOnDischarge, setConditionOnDischarge],
                ['Recommendations', recommendations, setRecommendations],
              ] as const
            ).map(([label, value, setter]) => (
              <div key={label}>
                <label className={labelClass}>{label}</label>
                <textarea
                  rows={2}
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
          </>
          ) : null}
        </div>

        <CreateModalFooter>
          <button type="button" onClick={onClose} className={CM_BTN_CANCEL} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={CM_BTN_PRIMARY}
            disabled={saving || loadingEdit}
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Report'}
          </button>
        </CreateModalFooter>
      </div>
    </div>
  )
}
