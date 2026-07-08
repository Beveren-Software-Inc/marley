import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Building2,
  Calendar,
  Check,
  ClipboardList,
  FileText,
  Link2,
  Stethoscope,
  User,
  X,
} from 'lucide-react'
import {
  fetchPatientAssessment,
  type PatientAssessmentDoc,
  type PatientAssessmentRow,
} from '../../services/patientAssessment'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

interface PatientAssessmentDetailPanelProps {
  name: string
  onClose: () => void
  preview?: PatientAssessmentRow
  onPatientClick?: (patient: string) => void
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—'
  return String(value)
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('en-GB')
  } catch {
    return value
  }
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

function referenceLabel(doc: PatientAssessmentDoc): string {
  if (!doc.reference_type) return '—'
  if (doc.encounter) return `${doc.reference_type} · ${doc.encounter}`
  return doc.reference_type
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
        onClick ? 'text-primary hover:underline cursor-pointer' : 'text-emerald-950'
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
          <button type="button" onClick={onClick} className="text-left w-full">
            {valueEl}
          </button>
        ) : (
          valueEl
        )}
      </div>
    </div>
  )
}

export function PatientAssessmentDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
}: PatientAssessmentDetailPanelProps) {
  const [doc, setDoc] = useState<PatientAssessmentDoc | null>(
    preview ? { ...preview, name } : null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPatientAssessment(name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load patient assessment')
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
  const status = statusLabel(source?.docstatus)

  const headerSubtitle = useMemo(() => {
    if (!source) return name
    const parts = [
      source.patient_name || source.patient,
      source.assessment_datetime ? formatDateTime(source.assessment_datetime) : null,
      source.assessment_template,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : name
  }, [source, name])

  const sheet = doc?.assessment_sheet ?? []
  const obtained = doc?.total_score_obtained ?? preview?.total_score_obtained ?? 0
  const total = doc?.total_score ?? preview?.total_score ?? 0
  const pct = total > 0 ? Math.round((obtained / total) * 100) : null

  return (
    <DetailSlideOver
      title="Patient Assessment"
      subtitle={headerSubtitle}
      icon={<ClipboardList className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <PrintFormatDropdown
          doctype="Patient Assessment"
          docName={name}
          noLetterhead={0}
          triggerPrint={1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-700 shadow-sm transition hover:bg-emerald-50"
        />
      }
    >
      {loading && !sheet.length && !source?.assessment_description ? (
        <div className="flex items-center justify-center py-12">
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          <span className="text-sm text-slate-500">Loading assessment…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {source && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}
            >
              {status.text}
            </span>
          </div>

          {(total > 0 || obtained > 0) && (
            <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
              <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
                <FileText className="h-5 w-5 text-emerald-600" strokeWidth={2} />
                <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Score</h3>
              </div>
              <div className="flex items-end justify-center gap-6 py-2">
                <div className="text-center">
                  <div className="text-4xl font-bold text-emerald-700">{obtained}</div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 mt-1">
                    Obtained
                  </div>
                </div>
                <div className="text-2xl text-slate-300 pb-2">/</div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-slate-400">{total}</div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 mt-1">
                    Total
                  </div>
                </div>
                {pct != null ? (
                  <div
                    className={`text-sm font-semibold px-3 py-1 rounded-full ${
                      pct >= 70
                        ? 'bg-emerald-100 text-emerald-800'
                        : pct >= 40
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {pct}%
                  </div>
                ) : null}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
              <ClipboardList className="h-5 w-5 text-emerald-600" strokeWidth={2} />
              <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">
                Assessment sheet
              </h3>
              {sheet.length > 0 ? (
                <span className="ml-auto text-xs text-slate-500">{sheet.length} items</span>
              ) : null}
            </div>

            {loading && sheet.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">Loading parameters…</p>
            ) : sheet.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                NO ASSESSMENT PARAMETERS RECORDED.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {sheet.map((line, idx) => {
                  const label = line.parameter_label || line.parameter || `Item ${idx + 1}`
                  const isYes = line.yes === 1 || line.yes === true
                  return (
                    <li
                      key={`${line.parameter}-${idx}`}
                      className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3"
                    >
                      <div className="flex items-start gap-2">
                        {line.yes != null ? (
                          isYes ? (
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.5} />
                          ) : (
                            <X className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" strokeWidth={2.5} />
                          )
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 leading-snug">{label}</p>
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                            {line.time ? <span>Time: {line.time}</span> : null}
                            {line.score != null ? (
                              <span>Score: {line.score}</span>
                            ) : null}
                            {isYes ? <span className="text-emerald-700 font-medium">Yes</span> : null}
                            {line.yes != null && !isYes ? (
                              <span className="text-slate-500">No</span>
                            ) : null}
                          </div>
                          {line.comments ? (
                            <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                              {line.comments}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {doc?.assessment_description || preview?.assessment_description ? (
            <section className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700 mb-2">
                Description
              </h3>
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                {doc?.assessment_description || preview?.assessment_description}
              </p>
            </section>
          ) : null}

          {doc?.family_history ? (
            <section className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700 mb-2">
                Family history
              </h3>
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                {doc.family_history}
              </p>
            </section>
          ) : null}

          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <ClipboardList className="h-4 w-4 text-emerald-600" strokeWidth={2} />
              Details
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <InfoTile
                icon={<User className="h-4 w-4" strokeWidth={2} />}
                label="Patient"
                value={displayValue(doc?.patient_name || doc?.patient || preview?.patient_name || preview?.patient)}
                onClick={
                  (doc?.patient || preview?.patient) && onPatientClick
                    ? () => onPatientClick((doc?.patient || preview?.patient)!)
                    : undefined
                }
              />
              <InfoTile
                icon={<Stethoscope className="h-4 w-4" strokeWidth={2} />}
                label="Doctor Name"
                value={displayValue(
                  doc?.practitioner_name ||
                    doc?.healthcare_practitioner ||
                    preview?.healthcare_practitioner,
                )}
              />
              <InfoTile
                icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                label="Assessed"
                value={formatDateTime(doc?.assessment_datetime || preview?.assessment_datetime)}
              />
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Template"
                value={displayValue(doc?.assessment_template || preview?.assessment_template)}
              />
              {(() => {
                const referenceSource = doc ?? preview
                const reference = referenceSource ? referenceLabel(referenceSource) : '—'
                return reference !== '—' ? (
                  <InfoTile
                    icon={<Link2 className="h-4 w-4" strokeWidth={2} />}
                    label="Reference"
                    value={reference}
                  />
                ) : null
              })()}
              <InfoTile
                icon={<Building2 className="h-4 w-4" strokeWidth={2} />}
                label="Assessment ID"
                value={displayValue(doc?.name || preview?.name || name)}
              />
            </div>
          </section>

          {doc?.creation ? (
            <p className="text-center text-xs text-slate-400">
              Recorded {formatDateTime(doc.creation)}
              {doc.modified && doc.modified !== doc.creation
                ? ` · Updated ${formatDateTime(doc.modified)}`
                : ''}
            </p>
          ) : null}
        </div>
      ) : null}
    </DetailSlideOver>
  )
}
