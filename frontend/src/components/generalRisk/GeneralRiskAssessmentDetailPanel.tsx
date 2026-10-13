// components/generalRisk/GeneralRiskAssessmentDetailPanel.tsx
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Calendar,
  ClipboardList,
  Shield,
  Stethoscope,
  Target,
  User,
  Users,
} from 'lucide-react'
import {
  GENERAL_RISK_ITEMS,
  GENERAL_RISK_SECTIONS,
  fetchGeneralRiskAssessment,
  generalRiskReasonField,
  isGeneralRiskFlagged,
  type GeneralRiskAssessmentDetail,
  type GeneralRiskAssessmentRow,
} from '../../services/generalRisk'
import { riskYesNoLabel } from '../../services/riskYesNo'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { RichTextContent } from '../ui/RichTextContent'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

interface GeneralRiskAssessmentDetailPanelProps {
  name: string
  onClose: () => void
  preview?: GeneralRiskAssessmentRow
  onPatientClick?: (patient: string) => void
}

const SECTION_ICONS: ReactNode[] = [
  <AlertTriangle key="self" className="h-4 w-4 text-emerald-600" strokeWidth={2} />,
  <Target key="others" className="h-4 w-4 text-emerald-600" strokeWidth={2} />,
  <Users key="from" className="h-4 w-4 text-emerald-600" strokeWidth={2} />,
]

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

function yesNo(value: unknown): string {
  // Answers are "Yes" / "No"; a question the clinician left unanswered shows "—".
  return riskYesNoLabel(value)
}

function hasText(value: unknown): boolean {
  return value != null && String(value).trim() !== ''
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

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,40%)_1fr] sm:gap-3 py-2 border-b border-slate-100 last:border-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800 break-words">{value}</dd>
    </div>
  )
}

function AssessmentSection({
  title,
  icon,
  children,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <section className={MODAL_SECTION_CLASS}>
      <h3 className={`${MODAL_SECTION_TITLE_CLASS} flex items-center gap-2`}>
        {icon}
        {title}
      </h3>
      <dl className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1">{children}</dl>
    </section>
  )
}

export function GeneralRiskAssessmentDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
}: GeneralRiskAssessmentDetailPanelProps) {
  const [doc, setDoc] = useState<GeneralRiskAssessmentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchGeneralRiskAssessment(name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load general risk assessment')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [name])

  const detail = doc ?? (preview as GeneralRiskAssessmentDetail | undefined)

  const headerSubtitle = useMemo(() => {
    if (!detail) return name
    const parts = [
      detail.name,
      detail.patient_name || detail.patient,
      detail.assessment_date ? formatDate(detail.assessment_date) : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : name
  }, [detail, name])

  const flagged = useMemo(
    () => GENERAL_RISK_ITEMS.filter((item) => isGeneralRiskFlagged(detail?.[item.key])),
    [detail]
  )


  return (
    <DetailSlideOver
      title="General Risk Assessment"
      subtitle={headerSubtitle}
      icon={<Shield className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <PrintFormatDropdown
          doctype="General Risk Assessment"
          docName={name}
          noLetterhead={0}
          triggerPrint={1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-700 shadow-sm transition hover:bg-emerald-50"
        />
      }
    >
      {loading && !doc ? (
        <div className="flex items-center justify-center py-12">
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          <span className="text-sm text-slate-500">Loading general risk assessment…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {detail && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          <section
            className={`rounded-xl border px-4 py-4 shadow-sm sm:px-5 sm:py-5 ${
              flagged.length
                ? 'text-rose-700 bg-rose-50 border-rose-200'
                : 'text-emerald-700 bg-emerald-50 border-emerald-200'
            }`}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                  Risks flagged
                </p>
                {flagged.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {flagged.map((item) => (
                      <span
                        key={item.key}
                        className="inline-flex items-center rounded-full border border-rose-200 bg-white px-2.5 py-0.5 text-xs font-semibold"
                      >
                        {item.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <h3 className="mt-1 text-lg font-semibold">No risks flagged</h3>
                )}
              </div>
            </div>
          </section>

          {GENERAL_RISK_SECTIONS.map((section, index) => (
            <AssessmentSection key={section.title} title={section.title} icon={SECTION_ICONS[index]}>
              {section.items.map((item) => {
                const reason = detail[generalRiskReasonField(item.key)]
                return (
                  <div key={item.key}>
                    <FieldRow label={item.label} value={yesNo(detail[item.key])} />
                    {isGeneralRiskFlagged(detail[item.key]) && hasText(reason) ? (
                      <div className="pb-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Reason
                        </p>
                        <p className="text-sm text-slate-800 break-words">{String(reason)}</p>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </AssessmentSection>
          ))}

          {hasText(detail.notes) ? (
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Additional notes</h3>
              <RichTextContent value={String(detail.notes)} />
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
                value={displayValue(detail.patient_name || detail.patient)}
                onClick={
                  detail.patient && onPatientClick
                    ? () => onPatientClick(detail.patient as string)
                    : undefined
                }
              />
              <InfoTile
                icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                label="Assessment date"
                value={formatDate(detail.assessment_date)}
              />
              <InfoTile
                icon={<Stethoscope className="h-4 w-4" strokeWidth={2} />}
                label="Clinician"
                value={displayValue(detail.practitioner_name || detail.practitioner)}
              />
              <InfoTile
                icon={<ClipboardList className="h-4 w-4" strokeWidth={2} />}
                label="Inpatient admission"
                value={displayValue(detail.inpatient_admission)}
              />
              <InfoTile
                icon={<ClipboardList className="h-4 w-4" strokeWidth={2} />}
                label="Patient visit"
                value={displayValue(detail.patient_visit)}
              />
              <InfoTile
                icon={<ClipboardList className="h-4 w-4" strokeWidth={2} />}
                label="Assessment ID"
                value={displayValue(detail.name)}
              />
            </div>
          </section>
        </div>
      ) : null}
    </DetailSlideOver>
  )
}

