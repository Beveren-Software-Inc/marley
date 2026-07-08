import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  Calendar,
  ClipboardList,
  FileText,
  Stethoscope,
  User,
} from 'lucide-react'
import {
  fetchGAD7Assessment,
  type GAD7AssessmentDetail,
  type GAD7AssessmentRow,
} from '../../services/gad7'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

interface GAD7AssessmentDetailPanelProps {
  name: string
  onClose: () => void
  preview?: GAD7AssessmentRow
  onPatientClick?: (patient: string) => void
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—'
  return String(value)
}

function formatDate(value?: string): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-GB')
  } catch {
    return value
  }
}

function severityClassName(severity?: string): string {
  if (severity === 'Severe anxiety') return 'text-red-700 bg-red-50 border-red-200'
  if (severity === 'Moderate anxiety') return 'text-amber-700 bg-amber-50 border-amber-200'
  if (severity === 'Mild anxiety') return 'text-blue-700 bg-blue-50 border-blue-200'
  return 'text-emerald-700 bg-emerald-50 border-emerald-200'
}

function docstatusLabel(docstatus: number): string {
  if (docstatus === 1) return 'Submitted'
  if (docstatus === 2) return 'Cancelled'
  return 'Draft'
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

export function GAD7AssessmentDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
}: GAD7AssessmentDetailPanelProps) {
  const [doc, setDoc] = useState<GAD7AssessmentDetail | null>(
    preview ? { ...preview, responses: [] } : null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchGAD7Assessment(name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load GAD7 assessment')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [name])

  const source = doc ?? (preview ? { ...preview, responses: [] } : null)
  const responses = doc?.responses ?? []

  const headerSubtitle = useMemo(() => {
    if (!source) return name
    const parts = [
      source.name,
      source.patient_name || source.patient,
      source.assessment_date ? formatDate(source.assessment_date) : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : name
  }, [source, name])

  return (
    <DetailSlideOver
      title="GAD7 Assessment"
      subtitle={headerSubtitle}
      icon={<Activity className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <div className="flex items-center gap-2">
          {source?.severity ? (
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full border ${severityClassName(source.severity)}`}
            >
              {source.total_score != null ? `${source.total_score} · ` : ''}
              {source.severity}
            </span>
          ) : null}
          <PrintFormatDropdown
            doctype="GAD7 Assessment"
            docName={name}
            noLetterhead={0}
            triggerPrint={1}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-700 shadow-sm transition hover:bg-emerald-50"
          />
        </div>
      }
    >
      {loading && !doc ? (
        <div className="flex items-center justify-center py-12">
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          <span className="text-sm text-slate-500">Loading GAD7 assessment…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {source && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          <section className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/70">
              Anxiety severity
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h3 className="text-2xl font-semibold text-emerald-950">{source.severity || '—'}</h3>
              {source.total_score != null ? (
                <span className="text-sm text-slate-600">
                  Total score: <strong>{source.total_score}</strong> / 21
                </span>
              ) : null}
              <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600">
                {docstatusLabel(source.docstatus)}
              </span>
            </div>
          </section>

          {responses.length > 0 ? (
            <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
              <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
                <FileText className="h-5 w-5 text-emerald-600" strokeWidth={2} />
                <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Responses</h3>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase w-10">#</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Question</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase w-36">Response</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase w-16">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {responses.map((row, idx) => (
                      <tr key={`${row.question_no}-${idx}`}>
                        <td className="px-3 py-2.5 text-slate-500">{row.question_no ?? idx + 1}</td>
                        <td className="px-3 py-2.5 text-slate-800">{displayValue(row.question)}</td>
                        <td className="px-3 py-2.5 text-slate-700">{displayValue(row.response)}</td>
                        <td className="px-3 py-2.5 text-slate-700">{displayValue(row.score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {source.notes ? (
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>
                <ClipboardList className="h-4 w-4 text-emerald-600" strokeWidth={2} />
                Notes
              </h3>
              <div
                className="text-sm text-slate-700 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: source.notes }}
              />
            </section>
          ) : null}

          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <ClipboardList className="h-4 w-4 text-emerald-600" strokeWidth={2} />
              Record details
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <InfoTile
                icon={<User className="h-4 w-4" strokeWidth={2} />}
                label="Patient"
                value={displayValue(source.patient_name || source.patient)}
                onClick={
                  source.patient && onPatientClick ? () => onPatientClick(source.patient) : undefined
                }
              />
              <InfoTile
                icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                label="Assessment date"
                value={formatDate(source.assessment_date)}
              />
              <InfoTile
                icon={<Stethoscope className="h-4 w-4" strokeWidth={2} />}
                label="Doctor Name"
                value={displayValue(source.practitioner_name || source.practitioner)}
              />
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Template"
                value={displayValue(source.template)}
              />
              <InfoTile
                icon={<ClipboardList className="h-4 w-4" strokeWidth={2} />}
                label="Inpatient admission"
                value={displayValue(source.inpatient_admission)}
              />
              <InfoTile
                icon={<ClipboardList className="h-4 w-4" strokeWidth={2} />}
                label="Patient visit"
                value={displayValue(source.patient_visit)}
              />
              <InfoTile
                icon={<ClipboardList className="h-4 w-4" strokeWidth={2} />}
                label="Assessment ID"
                value={displayValue(source.name)}
              />
            </div>
          </section>
        </div>
      ) : null}
    </DetailSlideOver>
  )
}
