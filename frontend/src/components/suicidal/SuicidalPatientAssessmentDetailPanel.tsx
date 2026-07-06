import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Calendar,
  ClipboardList,
  Heart,
  Shield,
  Stethoscope,
  User,
} from 'lucide-react'
import {
  fetchSuicidalAssessmentById,
  type SuicidalAssessment,
  type SuicidalAssessmentDetail,
} from '../../services/suicidalAssessment'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { RichTextContent } from '../ui/RichTextContent'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

interface SuicidalPatientAssessmentDetailPanelProps {
  name: string
  onClose: () => void
  preview?: SuicidalAssessment
  onPatientClick?: (patient: string) => void
}

const RISK_FACTORS: Array<{ field: string; label: string; explanation: string }> = [
  { field: 'male_gender', label: 'Male gender', explanation: 'male_gender_explanation' },
  { field: 'age_above_45', label: 'Age above 45 years', explanation: 'age_above_45_explanation' },
  { field: 'unemployment', label: 'Unemployment', explanation: 'unemployment_explanation' },
  { field: 'not_married', label: 'Not married', explanation: 'not_married_explanation' },
  { field: 'not_having_kids', label: 'Not having kids', explanation: 'not_having_kids_explanation' },
  { field: 'chronic_pain', label: 'Presence of chronic pain', explanation: 'chronic_pain_explanation' },
  {
    field: 'physical_health_condition',
    label: 'Physical health condition',
    explanation: 'physical_health_condition_explanation',
  },
  {
    field: 'psychiatric_condition',
    label: 'Psychiatric condition',
    explanation: 'psychiatric_condition_explanation',
  },
  {
    field: 'substance_misuse_history',
    label: 'History of substance misuse',
    explanation: 'substance_misuse_history_explanation',
  },
  {
    field: 'previous_self_harm',
    label: 'Previous self-harm or suicidal attempts',
    explanation: 'previous_self_harm_explanation',
  },
  {
    field: 'family_history_depression',
    label: 'Family history of depression',
    explanation: 'family_history_depression_explanation',
  },
  {
    field: 'family_history_substance_misuse',
    label: 'Family history of substance misuse',
    explanation: 'family_history_substance_misuse_explanation',
  },
  {
    field: 'family_history_suicide',
    label: 'Family history of suicide',
    explanation: 'family_history_suicide_explanation',
  },
]

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—'
  if (value === 1 || value === true) return 'Yes'
  if (value === 0 || value === false) return 'No'
  return String(value)
}

function asString(value: unknown): string | undefined {
  if (value == null || value === '') return undefined
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

function riskSummary(detail?: SuicidalAssessmentDetail | null): { text: string; className: string } {
  if (detail?.active_suicidal_thoughts_plans === 'Yes' || detail?.active_suicidal_thoughts_plans_final === 'Yes') {
    return { text: 'Active suicidal thoughts', className: 'text-red-700 bg-red-50 border-red-200' }
  }
  if (detail?.made_current_plans === 'Yes') {
    return { text: 'Has current plan', className: 'text-orange-700 bg-orange-50 border-orange-200' }
  }
  if (detail?.overwhelmed_thoughts_harming === 'Yes') {
    return { text: 'Has harmful thoughts', className: 'text-amber-700 bg-amber-50 border-amber-200' }
  }
  return { text: 'No active thoughts', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
}

function yesNoBadge(value?: string) {
  if (value === 'Yes') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        Yes
      </span>
    )
  }
  if (value === 'No') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        No
      </span>
    )
  }
  if (value === 'Unknown') {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
        Unknown
      </span>
    )
  }
  return <span className="text-slate-400">—</span>
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

function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 border-b border-slate-100 py-2 last:border-0 sm:grid-cols-[minmax(0,42%)_1fr] sm:gap-3">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="text-sm break-words text-slate-800">{value}</dd>
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

function TextSection({ title, value }: { title: string; value?: string }) {
  if (!value?.trim()) return null
  return (
    <section className={MODAL_SECTION_CLASS}>
      <h3 className={MODAL_SECTION_TITLE_CLASS}>{title}</h3>
      <RichTextContent value={value} />
    </section>
  )
}

export function SuicidalPatientAssessmentDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
}: SuicidalPatientAssessmentDetailPanelProps) {
  const [doc, setDoc] = useState<SuicidalAssessmentDetail | null>(
    preview ? ({ ...preview } as SuicidalAssessmentDetail) : null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchSuicidalAssessmentById(name)
      .then((data) => {
        if (!cancelled) setDoc(data as SuicidalAssessmentDetail)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load assessment')
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
  const detail = doc
  const risk = riskSummary(detail ?? (preview as SuicidalAssessmentDetail | undefined))

  const headerSubtitle = useMemo(() => {
    if (!source) return name
    const parts = [
      source.name,
      source.patient_name || source.patient,
      source.assessment_date ? formatDate(source.assessment_date) : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : name
  }, [source, name])

  const visibleRiskFactors = RISK_FACTORS.filter((rf) => {
    const value = detail?.[rf.field as keyof SuicidalAssessmentDetail]
    const explanation = detail?.[rf.explanation as keyof SuicidalAssessmentDetail]
    return value != null && value !== '' || (explanation != null && String(explanation).trim() !== '')
  })

  return (
    <DetailSlideOver
      title="Suicidal Patient Assessment"
      subtitle={headerSubtitle}
      icon={<AlertTriangle className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${risk.className}`}>
            {risk.text}
          </span>
          <PrintFormatDropdown
            doctype="Suicidal Patient Assessment"
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
          <span className="text-sm text-slate-500">Loading assessment…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {source && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          <section className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/70">
              Key indicators
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                <p className="text-[10px] uppercase text-slate-500">Suicidal thoughts</p>
                <div className="mt-1">{yesNoBadge(detail?.overwhelmed_thoughts_harming)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                <p className="text-[10px] uppercase text-slate-500">Current plan</p>
                <div className="mt-1">{yesNoBadge(detail?.made_current_plans)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                <p className="text-[10px] uppercase text-slate-500">Active plans</p>
                <div className="mt-1">{yesNoBadge(detail?.active_suicidal_thoughts_plans)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                <p className="text-[10px] uppercase text-slate-500">Previous attempts</p>
                <div className="mt-1">{yesNoBadge(detail?.previous_attempts)}</div>
              </div>
            </div>
          </section>

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
                label="Assessed by"
                value={displayValue(source.assessed_by_name || source.assessed_by)}
              />
              <InfoTile
                icon={<ClipboardList className="h-4 w-4" strokeWidth={2} />}
                label="Admission no"
                value={displayValue(source.admission_no)}
              />
            </div>
          </section>

          {detail ? (
            <>
              <AssessmentSection title="Suicidal / self-harming thoughts" icon={<AlertTriangle className="h-4 w-4" />}>
                <FieldRow label="Overwhelming thoughts" value={yesNoBadge(asString(detail.overwhelmed_thoughts_harming))} />
                {detail.overwhelmed_thoughts_explanation ? (
                  <FieldRow label="Explanation / triggers" value={displayValue(detail.overwhelmed_thoughts_explanation)} />
                ) : null}
                <FieldRow label="Thought frequency" value={displayValue(detail.thoughts_occurrence_frequency)} />
                <FieldRow label="Duration of thoughts" value={displayValue(detail.thoughts_present_duration)} />
                <FieldRow label="Thoughts becoming stronger" value={yesNoBadge(asString(detail.thoughts_becoming_stronger))} />
                <FieldRow label="Thoughts in past 24 hours" value={yesNoBadge(asString(detail.thoughts_past_24_hours))} />
                <FieldRow label="Active suicidal thoughts or plans" value={yesNoBadge(asString(detail.active_suicidal_thoughts_plans))} />
                {detail.triggering_factors ? (
                  <FieldRow label="Other triggering factors" value={displayValue(detail.triggering_factors)} />
                ) : null}
              </AssessmentSection>

              <AssessmentSection title="Current plan" icon={<Shield className="h-4 w-4" />}>
                <FieldRow label="Made current plans" value={yesNoBadge(asString(detail.made_current_plans))} />
                {detail.general_idea_harm_method ? (
                  <FieldRow label="Idea of harm method" value={displayValue(detail.general_idea_harm_method)} />
                ) : null}
                {detail.place_thinking_about ? (
                  <FieldRow label="Place thinking about" value={displayValue(detail.place_thinking_about)} />
                ) : null}
                <FieldRow label="Risk timing" value={displayValue(detail.risk_timing || detail.risk_timing_other)} />
                <FieldRow label="Access to dangerous means" value={yesNoBadge(asString(detail.access_dangerous_means))} />
                {detail.access_dangerous_means_details ? (
                  <FieldRow label="Means details / safety" value={displayValue(detail.access_dangerous_means_details)} />
                ) : null}
                <FieldRow label="Risk-taking behaviors" value={yesNoBadge(asString(detail.risk_taking_behaviors))} />
                {detail.risk_taking_behaviors_examples ? (
                  <FieldRow label="Risk behavior examples" value={displayValue(detail.risk_taking_behaviors_examples)} />
                ) : null}
              </AssessmentSection>

              <AssessmentSection title="Coping strategies & support" icon={<Heart className="h-4 w-4" />}>
                {detail.reasons_to_live ? (
                  <FieldRow label="Reasons to live" value={displayValue(detail.reasons_to_live)} />
                ) : null}
                {detail.strategies_manage_crises ? (
                  <FieldRow label="Crisis management strategies" value={displayValue(detail.strategies_manage_crises)} />
                ) : null}
                {detail.external_supports_available ? (
                  <FieldRow label="External supports" value={displayValue(detail.external_supports_available)} />
                ) : null}
                <FieldRow label="Previous attempts" value={yesNoBadge(asString(detail.previous_attempts))} />
                {detail.previous_attempts === 'Yes' ? (
                  <>
                    <FieldRow label="Attempt count" value={displayValue(detail.previous_attempts_count)} />
                    <FieldRow label="Time since last attempt" value={displayValue(detail.previous_attempts_time_ago)} />
                  </>
                ) : null}
                <FieldRow
                  label="Active suicidal thoughts or plans (final)"
                  value={yesNoBadge(asString(detail.active_suicidal_thoughts_plans_final))}
                />
              </AssessmentSection>

              {visibleRiskFactors.length > 0 ? (
                <AssessmentSection title="Risk factors of suicide" icon={<AlertTriangle className="h-4 w-4" />}>
                  {visibleRiskFactors.map((rf) => (
                    <div key={rf.field}>
                      <FieldRow
                        label={rf.label}
                        value={yesNoBadge(String(detail[rf.field as keyof SuicidalAssessmentDetail] ?? ''))}
                      />
                      {detail[rf.explanation as keyof SuicidalAssessmentDetail] ? (
                        <FieldRow
                          label={`${rf.label} — explanation`}
                          value={displayValue(detail[rf.explanation as keyof SuicidalAssessmentDetail])}
                        />
                      ) : null}
                    </div>
                  ))}
                </AssessmentSection>
              ) : null}

              {detail.present_complaint_attempt ? (
                <AssessmentSection title="Suicide attempt details" icon={<Shield className="h-4 w-4" />}>
                  <FieldRow label="Present complaint of attempt" value="Yes" />
                  {detail.precipitate_trigger ? (
                    <FieldRow label="Precipitating trigger" value={displayValue(detail.precipitate_trigger)} />
                  ) : null}
                  {detail.planned_or_impulsive ? (
                    <FieldRow label="Planned or impulsive" value={displayValue(detail.planned_or_impulsive)} />
                  ) : null}
                  {detail.method_used ? (
                    <FieldRow label="Method used" value={displayValue(detail.method_used)} />
                  ) : null}
                  {detail.message_note_left ? (
                    <FieldRow label="Message / note left" value={displayValue(detail.message_note_left)} />
                  ) : null}
                  {detail.internal_coping_skills ? (
                    <FieldRow label="Internal coping skills" value={displayValue(detail.internal_coping_skills)} />
                  ) : null}
                  <FieldRow label="Under influence of substance" value={yesNoBadge(asString(detail.under_influence_substance))} />
                  {detail.substance_details ? (
                    <FieldRow label="Substance details" value={displayValue(detail.substance_details)} />
                  ) : null}
                  <FieldRow label="Patient alone" value={yesNoBadge(asString(detail.patient_alone))} />
                  {detail.actions_reduced_noticing ? (
                    <FieldRow label="Actions to reduce noticing" value={displayValue(detail.actions_reduced_noticing)} />
                  ) : null}
                  {detail.sought_help_afterward ? (
                    <FieldRow label="Sought help afterward" value={displayValue(detail.sought_help_afterward)} />
                  ) : null}
                  {detail.patient_feelings_reflection ? (
                    <FieldRow label="Patient feelings / reflection" value={displayValue(detail.patient_feelings_reflection)} />
                  ) : null}
                  <FieldRow
                    label="Active suicidal thoughts or plans"
                    value={yesNoBadge(asString(detail.active_suicidal_thoughts_plans_attempt))}
                  />
                </AssessmentSection>
              ) : null}

              {detail.ip_risk_analysis_reference ? (
                <TextSection title="IP Risk Analysis reference" value={String(detail.ip_risk_analysis_reference)} />
              ) : null}
              <TextSection title="Additional notes" value={asString(detail.additional_notes)} />
            </>
          ) : null}
        </div>
      ) : null}
    </DetailSlideOver>
  )
}
