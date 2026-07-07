import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Brain,
  Calendar,
  ClipboardList,
  FileText,
  Stethoscope,
  User,
} from 'lucide-react'
import {
  fetchADHDAssessment,
  type ADHDAssessmentDetail,
  type ADHDAssessmentRow,
} from '../../services/adhd'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

interface ADHDAssessmentDetailPanelProps {
  name: string
  onClose: () => void
  preview?: ADHDAssessmentRow
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

function resultClassName(result?: string): string {
  if (result === 'Positive') return 'text-amber-700 bg-amber-50 border-amber-200'
  if (result === 'Negative') return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  return 'text-slate-700 bg-slate-50 border-slate-200'
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

export function ADHDAssessmentDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
}: ADHDAssessmentDetailPanelProps) {
  const [doc, setDoc] = useState<ADHDAssessmentDetail | null>(
    preview ? { ...preview, responses: [] } : null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchADHDAssessment(name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load ADHD assessment')
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
  const partARows = responses.filter((r) => r.part === 'Part A')
  const partBRows = responses.filter((r) => r.part === 'Part B')

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
      title="ADHD Assessment"
      subtitle={headerSubtitle}
      icon={<Brain className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <div className="flex items-center gap-2">
          {source?.result ? (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${resultClassName(source.result)}`}>
              {source.positive_count != null ? `${source.positive_count} · ` : ''}
              {source.result}
            </span>
          ) : null}
          <PrintFormatDropdown
            doctype="ADHD Assessment"
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
          <span className="text-sm text-slate-500">Loading ADHD assessment…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {source && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          <section className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/70">
              Screening result
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h3 className="text-2xl font-semibold text-emerald-950">
                {source.result || '—'}
              </h3>
              {source.positive_count != null ? (
                <span className="text-sm text-slate-600">
                  Part A positives: <strong>{source.positive_count}</strong>
                </span>
              ) : null}
              <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600">
                {docstatusLabel(source.docstatus)}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              4 or more positives in Part A indicates a positive screening result.
            </p>
          </section>

          {responses.length > 0 ? (
            <>
              {partARows.length > 0 ? (
                <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
                  <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
                    <FileText className="h-5 w-5 text-emerald-600" strokeWidth={2} />
                    <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Part A</h3>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase w-10">#</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Question</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase w-28">Response</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {partARows.map((row, idx) => (
                          <tr key={`${row.question_no}-${idx}`}>
                            <td className="px-3 py-2.5 text-slate-500">{idx + 1}</td>
                            <td className="px-3 py-2.5 text-slate-800">{displayValue(row.question)}</td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                  row.is_positive
                                    ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {displayValue(row.response)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              {partBRows.length > 0 ? (
                <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
                  <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
                    <FileText className="h-5 w-5 text-emerald-600" strokeWidth={2} />
                    <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Part B</h3>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase w-10">#</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Question</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase w-28">Response</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {partBRows.map((row, idx) => (
                          <tr key={`${row.question_no}-${idx}`}>
                            <td className="px-3 py-2.5 text-slate-500">{idx + 1}</td>
                            <td className="px-3 py-2.5 text-slate-800">{displayValue(row.question)}</td>
                            <td className="px-3 py-2.5 text-slate-700">{displayValue(row.response)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
            </>
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
                label="Practitioner"
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
