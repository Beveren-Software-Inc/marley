import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Building2,
  Calendar,
  ClipboardList,
  FileText,
  Link2,
  LogOut,
  Stethoscope,
  User,
  Users,
} from 'lucide-react'
import {
  fetchDischarge,
  type Discharge,
  type DischargeDoc,
  type DischargePatientDocument,
  type DischargePatientRelative,
} from '../../services/discharges'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'
import { DischargeChecklistStatusCard } from './DischargeChecklistStatusCard'
import { DischargePrescriptionCardsReadonly } from './DischargePrescriptionCards'
import { RichTextContent } from '../ui/RichTextContent'
import { formatDateTimeDisplay } from '../../utils/admissionDateTime'
import { resolveDischargeDisplayDate, resolveSpendDays } from '../../utils/dischargeDisplay'

interface DischargeDetailPanelProps {
  name: string
  onClose: () => void
  preview?: Discharge
  onPatientClick?: (patient: string) => void
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—'
  return String(value)
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return value
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

function formatTime(value?: string | null): string {
  if (!value) return '—'
  if (value.includes('T') || value.includes('-')) {
    return formatDateTime(value)
  }
  return value
}

function statusLabel(docstatus: number | undefined): { text: string; className: string } {
  if (docstatus === 1) {
    return { text: 'Submitted', className: 'bg-emerald-100 text-emerald-800' }
  }
  if (docstatus === 2) {
    return { text: 'Cancelled', className: 'bg-red-100 text-red-800' }
  }
  return { text: 'Draft', className: 'bg-amber-100 text-amber-800' }
}

function InfoTile({
  icon,
  label,
  value,
  onClick,
}: {
  icon: ReactNode
  label: string
  value: string
  onClick?: () => void
}) {
  const valueEl = (
    <p
      className={`mt-0.5 text-sm font-medium leading-snug break-words ${
        onClick ? 'cursor-pointer text-primary hover:underline' : 'text-emerald-950'
      }`}
    >
      {value}
    </p>
  )

  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-lg border border-emerald-100/70 bg-white/80 px-3 py-2.5 shadow-sm ring-1 ring-emerald-50/80">
      <div className="mt-0.5 shrink-0 text-emerald-600/80">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/65">{label}</p>
        {onClick ? (
          <button type="button" onClick={onClick} className="w-full text-left">
            {valueEl}
          </button>
        ) : (
          valueEl
        )}
      </div>
    </div>
  )
}

function ClinicalBlock({ title, value }: { title: string; value?: string | null }) {
  const text = value?.trim() || '—'
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</h4>
      {text === '—' ? (
        <p className="text-sm text-slate-400">—</p>
      ) : (
        <RichTextContent value={text} />
      )}
    </div>
  )
}

function DocumentsSection({ documents }: { documents: DischargePatientDocument[] }) {
  if (documents.length === 0) return null

  return (
    <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
      <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
        <FileText className="h-5 w-5 text-emerald-600" strokeWidth={2} />
        <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Documents</h3>
      </div>
      <ul className="space-y-2">
        {documents.map((doc, index) => {
          const label = doc.file_name || doc.document_type || 'Document'
          const url = doc.document
          return (
            <li
              key={doc.name || `doc-${index}`}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{label}</p>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                  {doc.document_type ? <span>Type: {doc.document_type}</span> : null}
                  {doc.transaction_no != null && doc.transaction_no !== '' ? (
                    <span>Txn: {doc.transaction_no}</span>
                  ) : null}
                </div>
                {doc.upload_remarks ? (
                  <p className="mt-1 text-xs text-slate-600">{doc.upload_remarks}</p>
                ) : null}
              </div>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-medium text-primary hover:underline"
                >
                  Open
                </a>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function RelativesSection({ relatives }: { relatives: DischargePatientRelative[] }) {
  if (relatives.length === 0) return null

  return (
    <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
      <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
        <Users className="h-5 w-5 text-emerald-600" strokeWidth={2} />
        <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Patient relatives</h3>
      </div>
      <ul className="space-y-2">
        {relatives.map((relative, index) => (
          <li
            key={relative.name || `relative-${index}`}
            className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2.5"
          >
            <p className="text-sm font-medium text-slate-900">{relative.relative_name || '—'}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-600">
              {relative.relationship_with_patient ? (
                <span>{relative.relationship_with_patient}</span>
              ) : null}
              {relative.relative_phone_no ? <span>{relative.relative_phone_no}</span> : null}
              {relative.cpr__id_no ? <span>CPR: {relative.cpr__id_no}</span> : null}
            </div>
            {relative.any_remarks ? (
              <p className="mt-1 text-xs text-slate-600">{relative.any_remarks}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function DischargeDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
}: DischargeDetailPanelProps) {
  const [doc, setDoc] = useState<DischargeDoc | null>(preview ? { ...preview, name } : null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reloadDoc = useCallback(() => {
    setLoading(true)
    setError(null)
    return fetchDischarge(name)
      .then((data) => setDoc(data))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load discharge')
      })
      .finally(() => setLoading(false))
  }, [name])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchDischarge(name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load discharge')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [name])

  const source = doc ?? preview
  const status = statusLabel(doc?.docstatus ?? preview?.docstatus)

  const headerSubtitle = useMemo(() => {
    if (!source) return name
    const dischargeDate = resolveDischargeDisplayDate(source)
    const parts = [
      source.patient_name || source.file_no,
      source.discharge_type,
      dischargeDate ? formatDateTimeDisplay(dischargeDate) : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : name
  }, [source, name])

  const detail = doc ?? (preview as DischargeDoc | undefined)

  const dischargePlanFields = detail
    ? [
        { title: 'Discharge treatment plan', value: detail.discharge_treatment_plan },
        { title: 'Discharge reason', value: detail.discharge_reason },
        { title: 'Discharge condition', value: detail.discharge_conditions },
        { title: 'Discharge instructions', value: detail.discharge_instructions },
      ]
    : []

  const otherClinicalFields = detail
    ? [
        { title: 'Discharge diagnosis', value: detail.discharge_diagnosis },
        { title: 'Mental status summary', value: detail.final_exam_mental_status_summary },
        { title: 'Management in hospital', value: detail.management_in_hospital },
        { title: 'Prognosis', value: detail.prognosis },
      ].filter((field) => field.value?.trim())
    : []

  const hasOtherClinical = otherClinicalFields.length > 0
  const dischargeChecklist = doc?.discharge_checklist ?? []
  const nursingChecklist = doc?.nursing_checklist ?? []
  const documents = doc?.patient_documents ?? []
  const relatives = doc?.patient_relatives ?? []
  const currentMedications = doc?.current_medications ?? []
  const dischargedMedications = doc?.discharged_medications ?? []
  const stoppedMedications = doc?.stopped_medications ?? []
  const hasFollowUp = Boolean(doc?.next_appointment_date || doc?.next_appointment_time)
  const spendDays = resolveSpendDays(doc || preview || {})

  return (
    <DetailSlideOver
      title="Discharge"
      subtitle={headerSubtitle}
      icon={<LogOut className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <PrintFormatDropdown
          doctype="Discharge"
          docName={name}
          noLetterhead={0}
          triggerPrint={1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-700 shadow-sm transition hover:bg-emerald-50"
        />
      }
    >
      {loading && !source ? (
        <div className="flex items-center justify-center py-12">
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          <span className="text-sm text-slate-500">Loading discharge…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {source && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-emerald-100 pb-3">
              <LogOut className="h-5 w-5 text-emerald-600" strokeWidth={2} />
              <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Discharge summary</h3>
              <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>
                {status.text}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Discharge type</p>
                <p className="mt-0.5 text-sm font-medium text-slate-900">
                  {displayValue(doc?.discharge_type || preview?.discharge_type)}
                </p>
              </div>
              {doc?.ama_type ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">DAMA type</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">{doc.ama_type}</p>
                </div>
              ) : null}
            </div>
          </section>

          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <ClipboardList className="h-4 w-4 text-emerald-600" strokeWidth={2} />
              Details
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <InfoTile
                icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                label="Discharge date"
                value={formatDateTimeDisplay(
                  doc?.display_discharge_date ||
                    resolveDischargeDisplayDate(doc || preview || {})
                )}
              />
              {doc?.discharge_date && doc?.final_discharge_date ? (
                <InfoTile
                  icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                  label="Final discharge"
                  value={`${formatDateTimeDisplay(doc.final_discharge_date)}${doc.final_discharge_time ? ` · ${formatTime(doc.final_discharge_time)}` : ''}`}
                />
              ) : null}
              {spendDays ? (
                <InfoTile
                  icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                  label="Spend days"
                  value={spendDays}
                />
              ) : null}
              {doc?.discharge_template || preview?.discharge_template ? (
                <InfoTile
                  icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                  label="Discharge template"
                  value={displayValue(
                    doc?.template_name || doc?.discharge_template || preview?.template_name || preview?.discharge_template
                  )}
                />
              ) : null}
              {doc?.nurse_discharge_template ? (
                <InfoTile
                  icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                  label="Nursing template"
                  value={displayValue(doc.nurse_discharge_template)}
                />
              ) : null}
              <InfoTile
                icon={<User className="h-4 w-4" strokeWidth={2} />}
                label="Discharged by"
                value={displayValue(
                  doc?.user_name ||
                    doc?.discharged_by_user_name ||
                    doc?.discharged_by_user ||
                    preview?.discharged_by_user_name ||
                    preview?.discharged_by_user
                )}
              />
              <InfoTile
                icon={<User className="h-4 w-4" strokeWidth={2} />}
                label="Final discharge by"
                value={displayValue(
                  doc?.final_discharger_username ||
                    doc?.final_discharge_user_name ||
                    doc?.final_discharge_user_id ||
                    preview?.final_discharge_user_name ||
                    preview?.final_discharge_user_id
                )}
              />
              <InfoTile
                icon={<Stethoscope className="h-4 w-4" strokeWidth={2} />}
                label="Receiving doctor"
                value={displayValue(
                  doc?.receiving_doctor_name ||
                    doc?.receiving_doctors ||
                    preview?.receiving_doctor_name ||
                    preview?.receiving_doctors
                )}
              />
              {doc?.discharge_doctor ? (
                <InfoTile
                  icon={<Stethoscope className="h-4 w-4" strokeWidth={2} />}
                  label="Discharge doctor"
                  value={displayValue(doc.discharge_doctor)}
                />
              ) : null}
              {doc?.discharge_nurse ? (
                <InfoTile
                  icon={<Stethoscope className="h-4 w-4" strokeWidth={2} />}
                  label="Discharge nurse"
                  value={displayValue(doc.discharge_nurse)}
                />
              ) : null}
              {doc?.discharge_receptionist ? (
                <InfoTile
                  icon={<User className="h-4 w-4" strokeWidth={2} />}
                  label="Receptionist"
                  value={displayValue(doc.discharge_receptionist)}
                />
              ) : null}
              <InfoTile
                icon={<User className="h-4 w-4" strokeWidth={2} />}
                label="Patient"
                value={displayValue(doc?.patient_name || doc?.file_no || preview?.patient_name || preview?.file_no)}
                onClick={
                  (doc?.file_no || preview?.file_no) && onPatientClick
                    ? () => onPatientClick((doc?.file_no || preview?.file_no)!)
                    : undefined
                }
              />
              <InfoTile
                icon={<Link2 className="h-4 w-4" strokeWidth={2} />}
                label="Admission"
                value={displayValue(doc?.admission || preview?.admission)}
              />
              {doc?.cost_center || preview?.cost_center ? (
                <InfoTile
                  icon={<Building2 className="h-4 w-4" strokeWidth={2} />}
                  label="Branch"
                  value={displayValue(doc?.cost_center || preview?.cost_center)}
                />
              ) : null}
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Discharge ID"
                value={displayValue(doc?.name || preview?.name || name)}
              />
            </div>

            <div className="mt-5 border-t border-slate-200 pt-5">
              <DischargePrescriptionCardsReadonly
                currentMedications={currentMedications}
                dischargedMedications={dischargedMedications}
                stoppedMedications={stoppedMedications}
                allowEditDischarged
                patient={doc?.file_no || preview?.file_no || undefined}
                onDischargedChanged={reloadDoc}
              />
            </div>
          </section>

          <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
              <ClipboardList className="h-5 w-5 text-emerald-600" strokeWidth={2} />
              <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Discharge plan & instructions</h3>
            </div>
            <div className="space-y-3">
              {dischargePlanFields.map((field) => (
                <ClinicalBlock
                  key={field.title}
                  title={field.title}
                  value={field.value?.trim() ? field.value : '—'}
                />
              ))}
            </div>
          </section>

          {hasOtherClinical ? (
            <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
              <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
                <ClipboardList className="h-5 w-5 text-emerald-600" strokeWidth={2} />
                <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Clinical information</h3>
              </div>
              <div className="space-y-3">
                {otherClinicalFields.map((field) => (
                  <ClinicalBlock key={field.title} title={field.title} value={field.value} />
                ))}
              </div>
            </section>
          ) : null}

          <DischargeChecklistStatusCard
            dischargeChecklist={dischargeChecklist}
            nursingChecklist={nursingChecklist}
            loading={loading}
            className="border-emerald-200/80 bg-white shadow-sm ring-1 ring-emerald-100/80"
          />

          <DocumentsSection documents={documents} />

          <RelativesSection relatives={relatives} />

          {hasFollowUp ? (
            <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
              <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
                <Calendar className="h-5 w-5 text-emerald-600" strokeWidth={2} />
                <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Follow-up</h3>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Next appointment</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">
                    {formatDate(doc?.next_appointment_date)}
                    {doc?.next_appointment_time ? ` · ${formatTime(doc.next_appointment_time)}` : ''}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {doc?.creation ? (
            <p className="text-center text-xs text-slate-400">
              Recorded {formatDateTime(doc.creation)}
              {doc.modified && doc.modified !== doc.creation ? ` · Updated ${formatDateTime(doc.modified)}` : ''}
            </p>
          ) : null}
        </div>
      ) : null}
    </DetailSlideOver>
  )
}
