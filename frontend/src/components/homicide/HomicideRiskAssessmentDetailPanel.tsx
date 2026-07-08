import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Brain,
  Calendar,
  ClipboardList,
  Clock,
  Heart,
  Shield,
  Stethoscope,
  Target,
  User,
  Users,
} from 'lucide-react'
import {
  fetchHomicideRiskAssessment,
  type HomicideRiskAssessmentDetail,
  type HomicideRiskAssessmentRow,
} from '../../services/homicideRisk'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { RichTextContent } from '../ui/RichTextContent'
import { attachFileDisplayUrl } from '../ui/SignaturePad'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

interface HomicideRiskAssessmentDetailPanelProps {
  name: string
  onClose: () => void
  preview?: HomicideRiskAssessmentRow
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

function formatTime(value?: string): string {
  if (!value) return '—'
  return value.length >= 5 ? value.slice(0, 5) : value
}

function isTruthy(value: unknown): boolean {
  return value === 1 || value === true || value === '1'
}

function hasText(value: unknown): boolean {
  if (value == null) return false
  return String(value).trim() !== ''
}

function hasNumber(value: unknown): boolean {
  return value != null && value !== '' && !Number.isNaN(Number(value))
}

function riskClassName(level?: string): string {
  if (level === 'High') return 'text-red-700 bg-red-50 border-red-200'
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
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,38%)_1fr] sm:gap-3 py-2 border-b border-slate-100 last:border-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800 break-words">{value}</dd>
    </div>
  )
}

function TextSection({ title, value }: { title: string; value?: string }) {
  if (!hasText(value)) return null
  return (
    <section className={MODAL_SECTION_CLASS}>
      <h3 className={MODAL_SECTION_TITLE_CLASS}>{title}</h3>
      <RichTextContent value={value!} />
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

function SignatureSection({ title, url }: { title: string; url?: string }) {
  const displayUrl = attachFileDisplayUrl(url)
  if (!displayUrl) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
      <p className="text-xs font-medium text-slate-500 mb-2">{title}</p>
      <img src={displayUrl} alt={title} className="max-h-24 object-contain" />
    </div>
  )
}

export function HomicideRiskAssessmentDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
}: HomicideRiskAssessmentDetailPanelProps) {
  const [doc, setDoc] = useState<HomicideRiskAssessmentDetail | null>(preview ?? null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchHomicideRiskAssessment(name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load homicide risk assessment')
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
  const detail = doc ?? (preview as HomicideRiskAssessmentDetail | undefined)

  const headerSubtitle = useMemo(() => {
    if (!source) return name
    const parts = [
      source.name,
      source.patient_name || source.patient,
      source.assessment_date ? formatDate(source.assessment_date) : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : name
  }, [source, name])

  const reasonLabels = [
    detail?.reason_clinician ? 'Clinician judgment (disclosure)' : null,
    detail?.reason_referral ? 'Referral source identified risk' : null,
    detail?.reason_social ? 'Social support identified risk' : null,
    detail?.reason_intake ? 'Reported on intake paperwork' : null,
    detail?.reason_crisis ? 'Reported to crisis line' : null,
    detail?.reason_current ? 'Current ideation during interview' : null,
    detail?.reason_recent_event ? 'Recent event occurred' : null,
    detail?.reason_other_check ? detail.other_reason || 'Other' : null,
  ].filter(Boolean) as string[]

  const symptomFields = [
    { label: 'Depression', value: detail?.depression },
    { label: 'Anxiety', value: detail?.anxiety },
    { label: 'Anger', value: detail?.anger },
    { label: 'Agitation', value: detail?.agitation },
    { label: 'Insomnia', value: detail?.insomnia },
    { label: 'Hopelessness', value: detail?.hopelessness },
    { label: 'Perceived burdensomeness', value: detail?.burdensomeness },
    { label: 'Impulsivity', value: detail?.impulsivity },
  ]

  const hasSymptoms = symptomFields.some((item) => hasNumber(item.value))

  const hasCurrentEpisode =
    hasText(detail?.intent_subjective) ||
    hasText(detail?.intent_objective) ||
    hasText(detail?.plan_when) ||
    hasText(detail?.plan_where) ||
    hasText(detail?.plan_how) ||
    hasText(detail?.intended_victim) ||
    hasText(detail?.access_to_means) ||
    hasText(detail?.preparation) ||
    hasText(detail?.rehearsal)

  const hasPlanDetails =
    hasText(detail?.plan_when) ||
    hasText(detail?.plan_where) ||
    hasText(detail?.plan_how) ||
    hasText(detail?.intended_victim) ||
    hasText(detail?.access_to_means) ||
    hasText(detail?.preparation) ||
    hasText(detail?.rehearsal)

  const hasIdeation =
    hasText(detail?.frequency) || hasText(detail?.intensity) || hasText(detail?.duration)

  const hasHistory =
    hasText(detail?.history_self_harm) ||
    hasText(detail?.history_violence) ||
    hasText(detail?.recent_discharge)

  const hasClinicalSummary =
    hasText(detail?.subjective_report) ||
    hasText(detail?.objective_signs) ||
    hasText(detail?.chronic_risk) ||
    hasText(detail?.chronic_summary)

  const hasSafetyPlan =
    hasText(detail?.past_safety_strategies) ||
    hasText(detail?.coping_strategies) ||
    hasText(detail?.treatment_preferences) ||
    hasText(detail?.staff_responsibilities)

  const hasFollowUp = hasText(detail?.followup_date) || hasText(detail?.followup_time)

  return (
    <DetailSlideOver
      title="Homicide Risk Assessment"
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
            doctype="Homicide Risk Assessment"
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
          <span className="text-sm text-slate-500">Loading homicide risk assessment…</span>
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
                  {detail?.therapeutic_alliance ? (
                    <span className="text-sm font-medium">
                      Therapeutic alliance: {detail.therapeutic_alliance}
                    </span>
                  ) : null}
                </div>
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
                label="Doctor"
                value={displayValue(source.practitioner_name || source.clinician)}
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

          {reasonLabels.length > 0 || hasText(detail?.reason_for) || hasText(detail?.other_reason) ? (
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Reason for assessment</h3>
              {reasonLabels.length > 0 ? (
                <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
                  {reasonLabels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              ) : null}
              {hasText(detail?.reason_for) ? (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500 mb-1">Additional context</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{detail?.reason_for}</p>
                </div>
              ) : null}
              {isTruthy(detail?.reason_other_check) && hasText(detail?.other_reason) ? (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500 mb-1">Other reason</p>
                  <RichTextContent value={detail!.other_reason!} />
                </div>
              ) : null}
            </section>
          ) : null}

          {hasCurrentEpisode ? (
            <>
              <TextSection title="Current intent (subjective)" value={detail?.intent_subjective} />
              <TextSection title="Current intent (objective)" value={detail?.intent_objective} />
              {hasPlanDetails ? (
                <AssessmentSection
                  title="Current episode — plan & means"
                  icon={<Target className="h-4 w-4 text-emerald-600" strokeWidth={2} />}
                >
                  <FieldRow label="Plan — when" value={displayValue(detail?.plan_when)} />
                  <FieldRow label="Plan — where" value={displayValue(detail?.plan_where)} />
                  <FieldRow label="Plan — how" value={displayValue(detail?.plan_how)} />
                  <FieldRow label="Intended victim" value={displayValue(detail?.intended_victim)} />
                  <FieldRow label="Access to means" value={displayValue(detail?.access_to_means)} />
                  <FieldRow label="Preparation" value={displayValue(detail?.preparation)} />
                  <FieldRow label="Rehearsal" value={displayValue(detail?.rehearsal)} />
                </AssessmentSection>
              ) : null}
            </>
          ) : null}

          {hasIdeation ? (
            <AssessmentSection
              title="Ideation characteristics"
              icon={<Brain className="h-4 w-4 text-emerald-600" strokeWidth={2} />}
            >
              <FieldRow label="Frequency" value={displayValue(detail?.frequency)} />
              <FieldRow label="Intensity" value={displayValue(detail?.intensity)} />
              <FieldRow label="Duration" value={displayValue(detail?.duration)} />
            </AssessmentSection>
          ) : null}

          {hasHistory ? (
            <>
              <TextSection title="History of self harm" value={detail?.history_self_harm} />
              <TextSection title="History of violence" value={detail?.history_violence} />
              {hasText(detail?.recent_discharge) ? (
                <AssessmentSection
                  title="History"
                  icon={<ClipboardList className="h-4 w-4 text-emerald-600" strokeWidth={2} />}
                >
                  <FieldRow
                    label="Recent hospital discharge"
                    value={formatDate(detail?.recent_discharge)}
                  />
                </AssessmentSection>
              ) : null}
            </>
          ) : null}

          {hasSymptoms ? (
            <AssessmentSection
              title="Symptom severity (1–10)"
              icon={<AlertTriangle className="h-4 w-4 text-emerald-600" strokeWidth={2} />}
            >
              {symptomFields.map((item) =>
                hasNumber(item.value) ? (
                  <FieldRow key={item.label} label={item.label} value={String(item.value)} />
                ) : null
              )}
            </AssessmentSection>
          ) : null}

          {hasClinicalSummary ? (
            <>
              <TextSection title="Subjective report" value={detail?.subjective_report} />
              <TextSection title="Objective signs" value={detail?.objective_signs} />
              {(hasText(detail?.chronic_risk) || hasText(detail?.chronic_summary)) ? (
                <AssessmentSection
                  title="Chronic risk"
                  icon={<Heart className="h-4 w-4 text-emerald-600" strokeWidth={2} />}
                >
                  <FieldRow label="Chronic risk present" value={displayValue(detail?.chronic_risk)} />
                  <FieldRow label="Chronic risk summary" value={displayValue(detail?.chronic_summary)} />
                </AssessmentSection>
              ) : null}
            </>
          ) : null}

          {hasSafetyPlan ? (
            <>
              <TextSection title="What has worked in the past" value={detail?.past_safety_strategies} />
              <TextSection title="What I can do now" value={detail?.coping_strategies} />
              <TextSection title="Treatment preferences" value={detail?.treatment_preferences} />
              <TextSection title="Staff responsibilities" value={detail?.staff_responsibilities} />
            </>
          ) : null}

          {detail?.contacts && detail.contacts.length > 0 ? (
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={`${MODAL_SECTION_TITLE_CLASS} flex items-center gap-2`}>
                <Users className="h-4 w-4 text-emerald-600" strokeWidth={2} />
                Emergency contacts
              </h3>
              <div className="space-y-3">
                {detail.contacts.map((contact, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                    <p className="font-medium text-slate-800">{contact.relative_name || '—'}</p>
                    <dl className="mt-2 space-y-1 text-slate-600">
                      <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,38%)_1fr]">
                        <dt>Relationship</dt>
                        <dd>{displayValue(contact.relationship_with_patient)}</dd>
                      </div>
                      {hasText(contact.cpr__id_no) ? (
                        <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,38%)_1fr]">
                          <dt>CPR / ID no.</dt>
                          <dd>{contact.cpr__id_no}</dd>
                        </div>
                      ) : null}
                      {hasText(contact.relative_phone_no) ? (
                        <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,38%)_1fr]">
                          <dt>Phone</dt>
                          <dd>{contact.relative_phone_no}</dd>
                        </div>
                      ) : null}
                      {hasText(contact.relative_alternative_phone_no) ? (
                        <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,38%)_1fr]">
                          <dt>Alt. phone</dt>
                          <dd>{contact.relative_alternative_phone_no}</dd>
                        </div>
                      ) : null}
                      {hasText(contact.relative_alternative_phone_no_2) ? (
                        <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,38%)_1fr]">
                          <dt>Alt. phone 2</dt>
                          <dd>{contact.relative_alternative_phone_no_2}</dd>
                        </div>
                      ) : null}
                      {hasText(contact.any_remarks) ? (
                        <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,38%)_1fr]">
                          <dt>Remarks</dt>
                          <dd className="whitespace-pre-wrap">{contact.any_remarks}</dd>
                        </div>
                      ) : null}
                      {hasText(contact.entered_by) || hasText(contact.entered_date) ? (
                        <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,38%)_1fr] pt-1 border-t border-slate-200">
                          <dt>Entered by</dt>
                          <dd>
                            {[contact.entered_by, contact.entered_date ? formatDate(contact.entered_date) : null]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {(detail?.client_signature ||
            detail?.staff_signature ||
            detail?.guardian_signature ||
            detail?.witness_signature) ? (
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Signatures</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SignatureSection title="Client" url={detail?.client_signature} />
                <SignatureSection title="Staff" url={detail?.staff_signature} />
                <SignatureSection title="Guardian" url={detail?.guardian_signature} />
                <SignatureSection title="Witness" url={detail?.witness_signature} />
              </div>
            </section>
          ) : null}

          {hasFollowUp ? (
            <AssessmentSection
              title="Follow up"
              icon={<Clock className="h-4 w-4 text-emerald-600" strokeWidth={2} />}
            >
              <FieldRow label="Follow up date" value={formatDate(detail?.followup_date)} />
              <FieldRow label="Follow up time" value={formatTime(detail?.followup_time)} />
            </AssessmentSection>
          ) : null}
        </div>
      ) : null}
    </DetailSlideOver>
  )
}
