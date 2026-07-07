import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Brain,
  Calendar,
  ClipboardList,
  Stethoscope,
  TrendingUp,
  User,
} from 'lucide-react'
import {
  fetchPANSSAssessment,
  POSITIVE_QUESTIONS,
  NEGATIVE_QUESTIONS,
  GENERAL_QUESTIONS,
  RATING_OPTIONS,
  type PANSSAssessmentDetail,
  type PANSSAssessmentRow,
} from '../../services/panss'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

interface PANSSAssessmentDetailPanelProps {
  name: string
  onClose: () => void
  preview?: PANSSAssessmentRow
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

function severityClassName(band?: string): string {
  if (band === 'Severe') return 'text-red-700 bg-red-50 border-red-200'
  if (band === 'Moderate-Severe') return 'text-orange-700 bg-orange-50 border-orange-200'
  if (band === 'Moderate') return 'text-yellow-700 bg-yellow-50 border-yellow-200'
  if (band === 'Mild') return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  return 'text-slate-700 bg-slate-50 border-slate-200'
}

function ratingLabel(score?: number | null): string {
  if (score == null) return '—'
  const option = RATING_OPTIONS.find((row) => row.score === score)
  return option ? option.label : String(score)
}

function parseRatingScore(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  if (typeof value === 'number') return value
  const text = String(value).trim()
  if (!text) return undefined
  const matched = RATING_OPTIONS.find((row) => text.startsWith(String(row.score)))
  if (matched) return matched.score
  const parsed = Number.parseInt(text.split(/\s+/)[0] || '', 10)
  return Number.isFinite(parsed) ? parsed : undefined
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

export function PANSSAssessmentDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
}: PANSSAssessmentDetailPanelProps) {
  const [doc, setDoc] = useState<PANSSAssessmentDetail | null>(preview ? { ...preview } as PANSSAssessmentDetail : null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPANSSAssessment(name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load PANSS assessment')
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

  const headerSubtitle = useMemo(() => {
    if (!source) return name
    const parts = [
      source.name,
      source.patient_name || source.patient,
      source.assessment_date ? formatDate(source.assessment_date) : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : name
  }, [source, name])

  const renderRatingSection = (
    title: string,
    questions: Array<{ code: string; name: string; description: string }>,
    docSource: PANSSAssessmentDetail
  ) => {
    const rows = questions.map((q) => ({
      ...q,
      score: parseRatingScore(docSource[q.code as keyof PANSSAssessmentDetail]),
    }))

    return (
      <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
        <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
          <TrendingUp className="h-5 w-5 text-emerald-600" strokeWidth={2} />
          <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">{title}</h3>
        </div>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.code} className="rounded-lg border border-slate-100 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-xs font-semibold uppercase text-slate-500">{row.code.toUpperCase()}</span>
                  <p className="text-sm font-medium text-slate-800">{row.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{row.description}</p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                  {ratingLabel(row.score)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <DetailSlideOver
      title="PANSS Assessment"
      subtitle={headerSubtitle}
      icon={<Brain className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <div className="flex items-center gap-2">
          {source?.severity_band ? (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${severityClassName(source.severity_band)}`}>
              {source.panss_total != null ? `${source.panss_total} · ` : ''}
              {source.severity_band}
            </span>
          ) : null}
          <PrintFormatDropdown
            doctype="PANSS Assessment"
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
          <span className="text-sm text-slate-500">Loading PANSS assessment…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {source && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          <section className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/70">
              Composite scores
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                <p className="text-[10px] uppercase text-slate-500">Positive</p>
                <p className="text-lg font-bold text-primary">{source.positive_total}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                <p className="text-[10px] uppercase text-slate-500">Negative</p>
                <p className="text-lg font-bold text-primary">{source.negative_total}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                <p className="text-[10px] uppercase text-slate-500">General</p>
                <p className="text-lg font-bold text-primary">{source.general_total}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                <p className="text-[10px] uppercase text-slate-500">Total</p>
                <p className="text-lg font-bold text-primary">{source.panss_total}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                <p className="text-[10px] uppercase text-slate-500">Composite</p>
                <p className={`text-lg font-bold ${source.composite_index >= 0 ? 'text-primary' : 'text-amber-600'}`}>
                  {source.composite_index >= 0 ? `+${source.composite_index}` : source.composite_index}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                <p className="text-[10px] uppercase text-slate-500">Status</p>
                <p className="text-sm font-semibold text-slate-700">{docstatusLabel(source.docstatus)}</p>
              </div>
            </div>
          </section>

          {doc ? (
            <>
              {renderRatingSection('Positive Scale (P1–P7)', POSITIVE_QUESTIONS, doc)}
              {renderRatingSection('Negative Scale (N1–N7)', NEGATIVE_QUESTIONS, doc)}
              {renderRatingSection('General Psychopathology (G1–G16)', GENERAL_QUESTIONS, doc)}
            </>
          ) : loading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              Loading item ratings…
            </div>
          ) : null}

          {source.clinical_notes ? (
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>
                <ClipboardList className="h-4 w-4 text-emerald-600" strokeWidth={2} />
                Clinical notes
              </h3>
              <div
                className="text-sm text-slate-700 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: source.clinical_notes }}
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
                label="Rater"
                value={displayValue(source.practitioner_name || source.rater || source.practitioner)}
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
