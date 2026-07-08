import { useEffect, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  BookOpen,
  Building2,
  ClipboardList,
  LogOut,
  NotebookPen,
  Pill,
  Stethoscope,
} from 'lucide-react'
import {
  fetchAdmissionClinicalBundle,
  type AdmissionClinicalBundle,
} from '../../services/patientAdmissionClinical'
import { RichTextContent } from '../ui/RichTextContent'
import { htmlToPlainText } from '../../utils/htmlToPlainText'

interface LastAdmissionClinicalTabProps {
  patient: string
}

function formatDateTime(val?: string | null): string {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleString('en-GB')
  } catch {
    return val
  }
}

/** Fixed card height — content scrolls inside; rows stay aligned. */
const CLINICAL_CARD_HEIGHT_CLASS = 'h-[min(420px,55vh)] max-h-[420px]'

function Section({
  icon,
  title,
  children,
  empty,
  emptyMessage = 'Nothing recorded for this admission.',
}: {
  icon: ReactNode
  title: string
  children: ReactNode
  empty?: boolean
  emptyMessage?: string
}) {
  return (
    <section
      className={`flex ${CLINICAL_CARD_HEIGHT_CLASS} w-full flex-col overflow-hidden rounded-xl border border-emerald-200/80 bg-white shadow-sm ring-1 ring-emerald-100/80`}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-emerald-100 px-4 py-3 sm:px-5">
        <span className="text-emerald-600">{icon}</span>
        <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">{title}</h3>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5"
        style={{ scrollbarWidth: 'thin' }}
      >
        {empty ? (
          <p className="text-sm italic text-slate-400">{emptyMessage}</p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

function ClinicalRow({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className={`${CLINICAL_CARD_HEIGHT_CLASS} min-h-0`}>{left}</div>
      <div className={`${CLINICAL_CARD_HEIGHT_CLASS} min-h-0`}>{right}</div>
    </div>
  )
}

function TextBlock({ label, value }: { label: string; value?: string | null }) {
  const text = (value || '').trim()
  if (!text) return null
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{text}</p>
    </div>
  )
}

function RichBlock({ label, value }: { label: string; value?: string | null }) {
  const text = (value || '').trim()
  if (!text) return null
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 rounded-lg bg-slate-50/80 px-3 py-2 ring-1 ring-slate-100">
        <RichTextContent value={text} className="text-sm leading-relaxed text-slate-800" />
      </div>
    </div>
  )
}

export function LastAdmissionClinicalTab({ patient }: LastAdmissionClinicalTabProps) {
  const [bundle, setBundle] = useState<AdmissionClinicalBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAdmission, setSelectedAdmission] = useState<string>('')

  useEffect(() => {
    setSelectedAdmission('')
  }, [patient])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAdmissionClinicalBundle(patient, selectedAdmission || undefined)
      .then((data) => {
        if (cancelled) return
        setBundle(data)
        if (!selectedAdmission && data.admission) {
          setSelectedAdmission(data.admission)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load admission summary')
          setBundle(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [patient, selectedAdmission])

  if (loading && !bundle) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-slate-500">
        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
        Loading admission clinical summary…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
    )
  }

  if (!bundle?.admission || !bundle.has_data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
        <Building2 className="mx-auto mb-3 h-10 w-10 text-slate-300" strokeWidth={1.5} />
        <p className="font-medium text-slate-700">NO INPATIENT ADMISSION ON RECORD</p>
        <p className="mt-1 text-sm text-slate-500">
          This tab shows clinical documentation from the patient&apos;s most recent hospital stay.
        </p>
      </div>
    )
  }

  const adm = bundle.admission_doc
  const discharge = bundle.discharge
  const allergyLines = [
    adm?.allergies,
    bundle.medical_history?.no_known_allergies
      ? 'No known drug allergies (NKDA)'
      : bundle.medical_history?.allergies,
  ].filter(Boolean)

  const hasDischarge =
    Boolean(discharge) || Boolean(adm?.discharge_note?.trim()) || Boolean(adm?.discharge_instructions?.trim())
  const hasAllergies = allergyLines.length > 0 || bundle.warnings.length > 0
  const hasProgressNotes = bundle.clinical_notes.length > 0
  const hasPrescriptions = bundle.prescriptions.length > 0
  const hasMedicalHistory = Boolean(
    adm?.medical_history?.trim() ||
      adm?.medication_history?.trim() ||
      adm?.surgical_history?.trim() ||
      bundle.medical_history?.other_ongoing_illness?.trim() ||
      bundle.medical_history?.current_and_past_medications?.trim(),
  )
  const hasDiagnosis = bundle.diagnoses.length > 0
  const hasHistoryForm = Boolean(bundle.history_form?.history_detail?.length)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-emerald-200/70 bg-emerald-50/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800/70">Inpatient episode</p>
          <p className="text-sm font-medium text-emerald-950">
            Review clinical documentation from a prior admission — useful for follow-up OP visits.
          </p>
        </div>
        {bundle.admission_options.length > 1 ? (
          <select
            value={selectedAdmission || bundle.admission}
            onChange={(e) => setSelectedAdmission(e.target.value)}
            className="min-w-[220px] rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {bundle.admission_options.map((opt) => (
              <option key={opt.name} value={opt.name}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 ring-1 ring-emerald-200">
            {adm?.name} · {adm?.status}
          </span>
        )}
      </div>

      <div className="space-y-4">
        {/* Row 1: Admission | Discharge */}
        <ClinicalRow
          left={
            <Section icon={<Building2 className="h-5 w-5" strokeWidth={2} />} title="Admission">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Case no</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">{adm?.name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Status</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">{adm?.status || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Admitted</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">
                    {formatDateTime(adm?.admitted_datetime)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Discharged</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">
                    {formatDateTime(adm?.discharge_datetime || discharge?.display_discharge_date)}
                  </p>
                </div>
                {adm?.primary_practitioner_name ? (
                  <div className="sm:col-span-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Primary practitioner
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-slate-900">{adm.primary_practitioner_name}</p>
                  </div>
                ) : null}
                {adm?.medical_department ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Department</p>
                    <p className="mt-0.5 text-sm font-medium text-slate-900">{adm.medical_department}</p>
                  </div>
                ) : null}
                {adm?.bed_no ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Bed</p>
                    <p className="mt-0.5 text-sm font-medium text-slate-900">{adm.bed_no}</p>
                  </div>
                ) : null}
              </div>
            </Section>
          }
          right={
            <Section
              icon={<LogOut className="h-5 w-5" strokeWidth={2} />}
              title="Discharge summary"
              empty={!hasDischarge}
              emptyMessage="No discharge documentation for this admission."
            >
              {!discharge ? (
                <p className="mb-3 text-sm text-amber-800 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                  NO SUBMITTED DISCHARGE FORM — SHOWING ADMISSION DISCHARGE FIELDS IF AVAILABLE.
                </p>
              ) : null}
              <div className="space-y-3">
                {discharge ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {discharge.discharge_type ? (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Type</p>
                          <p className="mt-0.5 text-sm font-medium text-slate-900">{discharge.discharge_type}</p>
                        </div>
                      ) : null}
                      {discharge.display_discharge_date ? (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Discharge date
                          </p>
                          <p className="mt-0.5 text-sm font-medium text-slate-900">
                            {formatDateTime(discharge.display_discharge_date)}
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <RichBlock label="Discharge diagnosis" value={discharge.discharge_diagnosis} />
                    <RichBlock label="Treatment plan" value={discharge.discharge_treatment_plan} />
                    <RichBlock label="Discharge instructions" value={discharge.discharge_instructions} />
                    <RichBlock label="Conditions on discharge" value={discharge.discharge_conditions} />
                    <RichBlock label="Discharge reason" value={discharge.discharge_reason} />
                    {discharge.stopped_medications && discharge.stopped_medications.length > 0 ? (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Stopped medications
                        </p>
                        <ul className="mt-2 space-y-1 text-sm text-slate-700">
                          {discharge.stopped_medications.map((med, idx) => (
                            <li key={idx} className="rounded-md bg-slate-50 px-2 py-1">
                              {String(med.drug_name || med.medication || med.drug || 'Medication')}
                              {med.reason ? ` — ${String(med.reason)}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : null}
                <RichBlock label="Admission discharge note" value={adm?.discharge_note} />
                <TextBlock label="Admission discharge instructions" value={adm?.discharge_instructions} />
              </div>
            </Section>
          }
        />

        {/* Row 2: Allergies | Progress notes */}
        <ClinicalRow
          left={
            <Section
              icon={<AlertTriangle className="h-5 w-5" strokeWidth={2} />}
              title="Allergies & warnings"
              empty={!hasAllergies}
              emptyMessage="NO ALLERGIES OR WARNINGS ON RECORD."
            >
              <div className="space-y-3">
                {allergyLines.map((line, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-red-100 bg-red-50/80 px-3 py-2 text-sm text-red-900"
                  >
                    {htmlToPlainText(String(line))}
                  </div>
                ))}
                {bundle.warnings.length > 0 ? (
                  <ul className="space-y-2">
                    {bundle.warnings.map((w) => (
                      <li key={w.name} className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2">
                        <p className="text-sm text-amber-950">{htmlToPlainText(w.warning || '')}</p>
                        {w.posting_date ? (
                          <p className="mt-1 text-xs text-amber-700/80">{formatDateTime(w.posting_date)}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </Section>
          }
          right={
            <Section
              icon={<NotebookPen className="h-5 w-5" strokeWidth={2} />}
              title="Progress notes"
              empty={!hasProgressNotes}
              emptyMessage="No doctor progress notes for this admission."
            >
              <ul className="space-y-3">
                {bundle.clinical_notes.map((note) => (
                  <li key={note.name} className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">
                        {note.clinical_note_type || 'Clinical note'}
                      </span>
                      {note.posting_date ? <span>{formatDateTime(note.posting_date)}</span> : null}
                      {note.practitioner_name ? <span>{note.practitioner_name}</span> : null}
                    </div>
                    <RichTextContent value={note.note || ''} className="text-sm leading-relaxed text-slate-800" />
                  </li>
                ))}
              </ul>
            </Section>
          }
        />

        {/* Row 3: Prescriptions | Medical history */}
        <ClinicalRow
          left={
            <Section
              icon={<Pill className="h-5 w-5" strokeWidth={2} />}
              title="Prescriptions"
              empty={!hasPrescriptions}
              emptyMessage="No prescriptions linked to this admission."
            >
              <div className="space-y-3">
                {bundle.prescriptions.map((rx) => (
                  <div key={rx.name} className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-3">
                    <p className="text-xs font-semibold text-slate-500">
                      {rx.name}
                      {rx.healthcare_practitioner_name ? ` · ${rx.healthcare_practitioner_name}` : ''}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {(rx.medications || []).map((med, idx) => (
                        <li key={idx} className="text-sm text-slate-800">
                          <span className="font-medium">
                            {med.display_drug_name || med.drug_name || 'Medication'}
                          </span>
                          {[med.display_dosage || med.dosage, med.frequency].filter(Boolean).length > 0 ? (
                            <span className="text-slate-600">
                              {' '}
                              — {[med.display_dosage || med.dosage, med.frequency].filter(Boolean).join(' · ')}
                            </span>
                          ) : null}
                          {med.instructions ? (
                            <p className="mt-0.5 text-xs text-slate-500">{med.instructions}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>
          }
          right={
            <Section
              icon={<ClipboardList className="h-5 w-5" strokeWidth={2} />}
              title="Medical history"
              empty={!hasMedicalHistory}
              emptyMessage="No medical history recorded for this admission."
            >
              <div className="space-y-3">
                <TextBlock label="Medical history" value={adm?.medical_history} />
                <TextBlock label="Medication history" value={adm?.medication_history} />
                <TextBlock label="Surgical history" value={adm?.surgical_history} />
                <TextBlock label="Ongoing illness" value={bundle.medical_history?.other_ongoing_illness} />
                <TextBlock label="Past medications" value={bundle.medical_history?.current_and_past_medications} />
              </div>
            </Section>
          }
        />

        {/* Row 4: Diagnosis | History form */}
        <ClinicalRow
          left={
            <Section
              icon={<Stethoscope className="h-5 w-5" strokeWidth={2} />}
              title="Diagnosis"
              empty={!hasDiagnosis}
              emptyMessage="No diagnoses recorded for this admission."
            >
              <ul className="divide-y divide-slate-100">
                {bundle.diagnoses.map((dx) => (
                  <li key={dx.name} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium text-slate-900">
                      {dx.diagnosis_name || dx.diagnosis || 'Diagnosis'}
                    </p>
                    {dx.details ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                        {htmlToPlainText(dx.details)}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-400">
                      {[dx.posting_date ? formatDateTime(dx.posting_date) : null, dx.practitioner_name]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          }
          right={
            <Section
              icon={<BookOpen className="h-5 w-5" strokeWidth={2} />}
              title="History form"
              empty={!hasHistoryForm}
              emptyMessage="No history form completed for this admission."
            >
              {bundle.history_form ? (
                <ul className="space-y-3">
                  {bundle.history_form.history_detail.map((row, idx) => (
                    <li key={`${row.attribute}-${idx}`} className="rounded-lg border border-emerald-50 px-3 py-2.5">
                      <p className="text-sm font-semibold text-emerald-950">{row.attribute || 'Section'}</p>
                      {row.description ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                          {htmlToPlainText(row.description)}
                        </p>
                      ) : null}
                      {row.field_1 ? (
                        <p className="mt-1 border-l-2 border-emerald-200 pl-2 text-xs text-slate-600">
                          {htmlToPlainText(row.field_1)}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Section>
          }
        />
      </div>

      {loading ? <p className="text-center text-xs text-slate-400">Refreshing…</p> : null}
    </div>
  )
}
