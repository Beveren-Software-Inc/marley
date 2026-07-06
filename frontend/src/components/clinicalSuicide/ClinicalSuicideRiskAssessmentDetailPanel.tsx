import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Brain,
  Calendar,
  ClipboardList,
  Heart,
  Shield,
  Stethoscope,
  Target,
  User,
  Users,
} from 'lucide-react'
import {
  fetchSuicideRiskAssessment,
  type SuicideRiskAssessmentDetail,
  type SuicideRiskAssessmentRow,
} from '../../services/suicideRisk'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { RichTextContent } from '../ui/RichTextContent'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

interface ClinicalSuicideRiskAssessmentDetailPanelProps {
  name: string
  onClose: () => void
  preview?: SuicideRiskAssessmentRow
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

function isTruthy(value: unknown): boolean {
  return value === 1 || value === true || value === '1'
}

function yesNo(value: unknown): string {
  return isTruthy(value) ? 'Yes' : 'No'
}

function riskClassName(level?: string): string {
  if (level === 'Emergency') return 'text-red-700 bg-red-50 border-red-200'
  if (level === 'High') return 'text-orange-700 bg-orange-50 border-orange-200'
  if (level === 'Medium') return 'text-yellow-700 bg-yellow-50 border-yellow-200'
  if (level === 'Low') return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  return 'text-slate-700 bg-slate-50 border-slate-200'
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

function TextSection({ title, value }: { title: string; value?: string }) {
  if (!value) return null
  return (
    <section className={MODAL_SECTION_CLASS}>
      <h3 className={MODAL_SECTION_TITLE_CLASS}>{title}</h3>
      <RichTextContent value={value} />
    </section>
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

export function ClinicalSuicideRiskAssessmentDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
}: ClinicalSuicideRiskAssessmentDetailPanelProps) {
  const [doc, setDoc] = useState<SuicideRiskAssessmentDetail | null>(preview ?? null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchSuicideRiskAssessment(name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load suicide risk assessment')
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
  const detail = doc ?? (preview as SuicideRiskAssessmentDetail | undefined)

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
      title="Suicide Risk Assessment"
      subtitle={headerSubtitle}
      icon={<Shield className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <div className="flex items-center gap-2">
          {source?.risk_level ? (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${riskClassName(source.risk_level)}`}>
              {source.risk_level}
            </span>
          ) : null}
          <PrintFormatDropdown
            doctype="Clinical Suicide Risk Assessment"
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
          <span className="text-sm text-slate-500">Loading suicide risk assessment…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {source && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          <section
            className={`rounded-xl border px-4 py-4 shadow-sm sm:px-5 sm:py-5 ${riskClassName(source.risk_level)}`}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Risk outcome</p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <h3 className="text-2xl font-semibold">{source.risk_level || '—'}</h3>
                  <span className="text-sm font-medium">Score: {source.risk_score ?? '—'}/100</span>
                </div>
              </div>
            </div>
          </section>

          <AssessmentSection
            title="1. Suicidal Ideation"
            icon={<Brain className="h-4 w-4 text-emerald-600" strokeWidth={2} />}
          >
            <FieldRow label="Evidence of suicidal ideation" value={yesNo(detail?.has_ideation)} />
            {isTruthy(detail?.has_ideation) ? (
              <>
                <FieldRow label="How often" value={displayValue(detail?.ideation_frequency)} />
                <FieldRow label="How long" value={displayValue(detail?.ideation_duration)} />
                <FieldRow label="Thoughts getting stronger" value={displayValue(detail?.ideation_increasing)} />
                <FieldRow label="Thoughts in past 24 hours" value={yesNo(detail?.ideation_24h)} />
              </>
            ) : null}
          </AssessmentSection>

          <AssessmentSection
            title="2. Current Plan"
            icon={<Target className="h-4 w-4 text-emerald-600" strokeWidth={2} />}
          >
            <FieldRow label="Current plan to take own life" value={yesNo(detail?.has_plan)} />
            {isTruthy(detail?.has_plan) ? (
              <>
                <FieldRow label="Planned method" value={displayValue(detail?.plan_method)} />
                <FieldRow label="Where would it occur" value={displayValue(detail?.plan_location)} />
                <FieldRow label="Plan immediacy" value={displayValue(detail?.plan_immediacy)} />
                <FieldRow label="Access to lethal means" value={yesNo(detail?.access_lethal_means)} />
              </>
            ) : null}
            <FieldRow label="Taking more risks lately" value={yesNo(detail?.risk_behavior)} />
            {isTruthy(detail?.risk_behavior) && detail?.risk_behavior_details ? (
              <FieldRow label="Risk behavior details" value={displayValue(detail.risk_behavior_details)} />
            ) : null}
          </AssessmentSection>

          <AssessmentSection
            title="3. History / Previous Attempts"
            icon={<ClipboardList className="h-4 w-4 text-emerald-600" strokeWidth={2} />}
          >
            <FieldRow label="History of previous attempts" value={yesNo(detail?.has_history)} />
            {isTruthy(detail?.has_history) ? (
              <>
                <FieldRow label="Number of attempts" value={displayValue(detail?.attempt_count)} />
                <FieldRow label="How long ago" value={displayValue(detail?.last_attempt)} />
              </>
            ) : null}
            <FieldRow
              label="Prior diagnosis or psychiatric episode"
              value={displayValue(detail?.psychiatric_history)}
            />
            {detail?.psychiatric_history === 'Yes' && detail?.prior_psychiatric_diagnosis ? (
              <FieldRow
                label="Prior psychiatric diagnosis"
                value={displayValue(detail.prior_psychiatric_diagnosis)}
              />
            ) : null}
          </AssessmentSection>

          <AssessmentSection
            title="4. Current Stressors"
            icon={<AlertTriangle className="h-4 w-4 text-emerald-600" strokeWidth={2} />}
          >
            <FieldRow label="Current stressors present" value={yesNo(detail?.has_stressors)} />
          </AssessmentSection>
          <TextSection title="Stressors description" value={detail?.stressors_description} />

          <AssessmentSection
            title="5. Protective Factors — People"
            icon={<Users className="h-4 w-4 text-emerald-600" strokeWidth={2} />}
          >
            <FieldRow label="Has support system" value={yesNo(detail?.has_support)} />
          </AssessmentSection>
          <TextSection title="Support system" value={detail?.support_people} />

          <AssessmentSection
            title="6. Protective Factors — Coping"
            icon={<Heart className="h-4 w-4 text-emerald-600" strokeWidth={2} />}
          >
            <FieldRow label="Has coping strategies" value={yesNo(detail?.has_coping)} />
          </AssessmentSection>
          <TextSection title="What has helped before" value={detail?.coping_strategies} />
          <TextSection title="Reasons to live" value={detail?.reasons_to_live} />
          <TextSection title="Personal strengths" value={detail?.personal_strengths} />

          <TextSection title="Actions / Referral Notes" value={detail?.actions_required} />

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
                label="Clinician"
                value={displayValue(source.clinician_name || source.clinician)}
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
