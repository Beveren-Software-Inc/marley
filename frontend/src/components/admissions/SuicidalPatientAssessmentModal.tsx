

import { useState, useRef, useCallback, useEffect } from 'react'
import { createSuicidalPatientAssessment } from '../../services/suicidalAssessment'
import {
  fetchPatientOptions,
  fetchInpatientAdmissionOptions,
  fetchHealthcarePractitioners,
  fetchIpRiskAnalysisOptions,
  getCurrentUserPractitioner,
  type LinkFieldOption,
} from '../../services/common'
import { toast } from '../../hooks/useToast'
import { AlertTriangle, ChevronDown, FileText, Info } from 'lucide-react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_FOOTER_STICKY,
  CREATE_MODAL_OVERLAY,
  CreateModalHeader,
  createModalShellClass,
  createModalTabButtonClass,
} from '../ui/CreateModalChrome'

interface SuicidalPatientAssessmentModalProps {
  admissionNo: string
  patient: string
  patientName?: string
  onClose: () => void
  onSuccess?: () => void
}

type TabId = 'general' | 'risk-factors' | 'attempt-details'

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'risk-factors', label: 'Risk Factor of Suicide' },
  { id: 'attempt-details', label: 'Suicide Attempt Details' },
]

type SelectValue = '' | 'Yes' | 'No'
type SelectYesNoUnknown = '' | 'Yes' | 'No' | 'Unknown'

interface FormState {
  // Basic Info
  assessment_date: string
  practitioner: string
  // Suicidal Thoughts
  overwhelmed_thoughts_harming: SelectValue
  overwhelmed_thoughts_explanation: string
  thoughts_occurrence_frequency: string
  thoughts_present_duration: string
  thoughts_becoming_stronger: SelectYesNoUnknown
  thoughts_past_24_hours: SelectValue
  active_suicidal_thoughts_plans: SelectValue
  triggering_factors: string
  // Current Plan
  made_current_plans: SelectValue
  general_idea_harm_method: string
  place_thinking_about: string
  risk_timing: string
  risk_timing_other: string
  access_dangerous_means: SelectValue
  access_dangerous_means_details: string
  risk_taking_behaviors: SelectValue
  risk_taking_behaviors_examples: string
  // Coping & Support
  reasons_to_live: string
  strategies_manage_crises: string
  external_supports_available: string
  previous_attempts: SelectValue
  previous_attempts_count: number | ''
  previous_attempts_time_ago: string
  active_suicidal_thoughts_plans_final: SelectValue
  // Reference
  ip_risk_analysis_reference: string
  additional_notes: string
  // Risk Factors
  male_gender: SelectValue
  male_gender_explanation: string
  age_above_45: SelectValue
  age_above_45_explanation: string
  unemployment: SelectValue
  unemployment_explanation: string
  not_married: SelectValue
  not_married_explanation: string
  not_having_kids: SelectValue
  not_having_kids_explanation: string
  chronic_pain: SelectValue
  chronic_pain_explanation: string
  physical_health_condition: SelectValue
  physical_health_condition_explanation: string
  psychiatric_condition: SelectValue
  psychiatric_condition_explanation: string
  substance_misuse_history: SelectValue
  substance_misuse_history_explanation: string
  previous_self_harm: SelectValue
  previous_self_harm_explanation: string
  family_history_depression: SelectValue
  family_history_depression_explanation: string
  family_history_substance_misuse: SelectValue
  family_history_substance_misuse_explanation: string
  family_history_suicide: SelectValue
  family_history_suicide_explanation: string
  // Attempt Details
  present_complaint_attempt: boolean
  precipitate_trigger: string
  planned_or_impulsive: string
  method_used: string
  message_note_left: SelectValue
  under_influence_substance: SelectValue
  substance_details: string
  patient_alone: SelectValue
  actions_reduced_noticing: string
  sought_help_afterward: string
  patient_feelings_reflection: string
  internal_coping_skills: string
  active_suicidal_thoughts_plans_attempt: SelectValue
}

const today = new Date().toISOString().split('T')[0]

const emptyForm = (): FormState => ({
  assessment_date: today,
  practitioner: '',
  overwhelmed_thoughts_harming: '',
  overwhelmed_thoughts_explanation: '',
  thoughts_occurrence_frequency: '',
  thoughts_present_duration: '',
  thoughts_becoming_stronger: '',
  thoughts_past_24_hours: '',
  active_suicidal_thoughts_plans: '',
  triggering_factors: '',
  made_current_plans: '',
  general_idea_harm_method: '',
  place_thinking_about: '',
  risk_timing: '',
  risk_timing_other: '',
  access_dangerous_means: '',
  access_dangerous_means_details: '',
  risk_taking_behaviors: '',
  risk_taking_behaviors_examples: '',
  reasons_to_live: '',
  strategies_manage_crises: '',
  external_supports_available: '',
  previous_attempts: '',
  previous_attempts_count: '',
  previous_attempts_time_ago: '',
  active_suicidal_thoughts_plans_final: '',
  ip_risk_analysis_reference: '',
  additional_notes: '',
  male_gender: '',
  male_gender_explanation: '',
  age_above_45: '',
  age_above_45_explanation: '',
  unemployment: '',
  unemployment_explanation: '',
  not_married: '',
  not_married_explanation: '',
  not_having_kids: '',
  not_having_kids_explanation: '',
  chronic_pain: '',
  chronic_pain_explanation: '',
  physical_health_condition: '',
  physical_health_condition_explanation: '',
  psychiatric_condition: '',
  psychiatric_condition_explanation: '',
  substance_misuse_history: '',
  substance_misuse_history_explanation: '',
  previous_self_harm: '',
  previous_self_harm_explanation: '',
  family_history_depression: '',
  family_history_depression_explanation: '',
  family_history_substance_misuse: '',
  family_history_substance_misuse_explanation: '',
  family_history_suicide: '',
  family_history_suicide_explanation: '',
  present_complaint_attempt: false,
  precipitate_trigger: '',
  planned_or_impulsive: '',
  method_used: '',
  message_note_left: '',
  under_influence_substance: '',
  substance_details: '',
  patient_alone: '',
  actions_reduced_noticing: '',
  sought_help_afterward: '',
  patient_feelings_reflection: '',
  internal_coping_skills: '',
  active_suicidal_thoughts_plans_attempt: '',
})

// ─── Reusable field components ────────────────────────────────────────────────

const labelClass = 'block text-xs font-semibold text-slate-700 mb-1'
const inputClass = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 bg-white text-slate-900'
const textareaClass = `${inputClass} resize-none`
const sectionClass = 'mb-6'
const sectionTitleClass = 'text-sm font-semibold text-slate-800 mb-3 pb-1.5 border-b border-slate-200'
const noteClass = 'text-xs text-slate-500 italic bg-slate-50 border border-slate-200 rounded-md px-3 py-2 mb-3'

function SelectField({
  label, value, onChange, options, required
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  required?: boolean
}) {
  return (
    <div>
      <label className={labelClass}>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={inputClass}
        required={required}
      >
        <option value="">— Select —</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function YesNoField({
  label, fieldname, form, setField, explanation, explanationLabel, showExplanationWhen = 'Yes'
}: {
  label: string
  fieldname: keyof FormState
  form: FormState
  setField: (k: keyof FormState, v: unknown) => void
  explanation?: keyof FormState
  explanationLabel?: string
  showExplanationWhen?: string
}) {
  const value = form[fieldname] as string
  return (
    <div className="space-y-1.5">
      <SelectField
        label={label}
        value={value}
        onChange={v => setField(fieldname, v)}
        options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
      />
      {explanation && value === showExplanationWhen && (
        <div>
          <label className={labelClass}>{explanationLabel ?? 'Explanation'}</label>
          <textarea
            rows={2}
            value={form[explanation] as string}
            onChange={e => setField(explanation, e.target.value)}
            className={textareaClass}
            placeholder="Provide explanation..."
          />
        </div>
      )}
    </div>
  )
}

// ─── Link Combobox ────────────────────────────────────────────────────────────

interface LinkComboboxProps {
  label: string
  value: string
  onSelect: (opt: LinkFieldOption) => void
  onClear: () => void
  fetchOptions: (search: string) => Promise<LinkFieldOption[]>
  placeholder?: string
  required?: boolean
}

const LinkCombobox = ({ label, value, onSelect, onClear, fetchOptions, placeholder, required }: LinkComboboxProps) => {
  const [query, setQuery] = useState(value)
  const [options, setOptions] = useState<LinkFieldOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      setLoading(true)
      try { setOptions(await fetchOptions(query)) }
      catch { setOptions([]) }
      finally { setLoading(false) }
    }, query.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [query, open, fetchOptions])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <label className={labelClass}>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <div className="relative">
        <input 
          type="text" 
          value={query}
          onChange={e => { setQuery(e.target.value); onClear(); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? 'Search...'}
          className={inputClass} 
          autoComplete="off" 
        />
        <span className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-slate-400">
          {loading
            ? <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin" />
            : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
          {options.length === 0
            ? <div className="px-3 py-2 text-xs text-slate-400">{loading ? 'Searching…' : 'NO RESULTS FOUND'}</div>
            : options.map(opt => (
              <button 
                key={opt.name} 
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-emerald-50 focus:outline-none transition-colors"
                onClick={() => { onSelect(opt); setQuery(opt.label); setOpen(false) }}>
                <span className="font-medium">{opt.label}</span>
                {opt.label !== opt.name && <span className="ml-1.5 text-xs text-slate-400">{opt.name}</span>}
              </button>
            ))
          }
        </div>
      )}
    </div>
  )
}

// ─── Tab: General ─────────────────────────────────────────────────────────────

function GeneralTab({
  form, setField,
  currentAdmission, currentPatient, currentPatientName,
  isLockedContext,
  fetchPatientOpts, fetchAdmissionOpts, fetchIpRiskOpts,
  setCurrentAdmission, setCurrentPatient, setCurrentPatientName,
}: {
  form: FormState
  setField: (k: keyof FormState, v: unknown) => void
  currentAdmission: string
  currentPatient: string
  currentPatientName: string
  isLockedContext: boolean
  fetchPatientOpts: (s: string) => Promise<LinkFieldOption[]>
  fetchAdmissionOpts: (s: string) => Promise<LinkFieldOption[]>
  fetchIpRiskOpts: (s: string) => Promise<LinkFieldOption[]>
  setCurrentAdmission: (v: string) => void
  setCurrentPatient: (v: string) => void
  setCurrentPatientName: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      {/* Basic Information */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Basic Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            {isLockedContext ? (
              <>
                <label className={labelClass}>Admission No</label>
                <input type="text" value={currentAdmission} readOnly className={`${inputClass} bg-slate-50 cursor-not-allowed`} />
              </>
            ) : (
              <LinkCombobox
                label="Admission No"
                value={currentAdmission}
                onSelect={opt => setCurrentAdmission(opt.name)}
                onClear={() => setCurrentAdmission('')}
                fetchOptions={fetchAdmissionOpts}
                placeholder="Search admissions..."
              />
            )}
          </div>
          <div>
            <label className={labelClass}>Assessment Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={form.assessment_date}
              onChange={e => setField('assessment_date', e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div>
            {isLockedContext ? (
              <>
                <label className={labelClass}>Patient</label>
                <input type="text" value={currentPatient} readOnly className={`${inputClass} bg-slate-50 cursor-not-allowed`} />
              </>
            ) : (
              <LinkCombobox
                label="Patient"
                value={currentPatient}
                onSelect={opt => {
                  setCurrentPatient(opt.name)
                  const namePart = opt.label.replace(/\s*\([^)]*\)\s*$/, '').trim()
                  setCurrentPatientName(namePart)
                }}
                onClear={() => { setCurrentPatient(''); setCurrentPatientName('') }}
                fetchOptions={fetchPatientOpts}
                placeholder="Search patients..."
              />
            )}
          </div>
          <div>
            <label className={labelClass}>Patient Name</label>
            <input type="text" value={currentPatientName} readOnly className={`${inputClass} bg-slate-50 cursor-not-allowed`} />
          </div>
          <div className="col-span-2">
            <LinkCombobox
              label="Doctor Name"
              value={form.practitioner}
              onSelect={(opt) => setField('practitioner', opt.name)}
              onClear={() => setField('practitioner', '')}
              fetchOptions={async (search) => {
                const result = await fetchHealthcarePractitioners(search || undefined)
                return result
              }}
              placeholder="Search doctor..."
            />
          </div>
        </div>
      </div>

      {/* Suicidal / Self-Harming Thoughts */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Suicidal / Self-Harming Thoughts</h3>
        <p className={noteClass}>
          Has the patient felt so overwhelmed recently that they've had thoughts of harming themselves or not wanting to live?
          Examples include: Relationship breakup, Family conflict, Job loss or unemployment, Abuse or DV, Legal Issues, Chronic pain or illness, Grief or Loss, Trauma.
        </p>
        <div className="space-y-4">
          <SelectField
            label="Has the patient felt so overwhelmed recently that they've had thoughts of harming themselves or not wanting to live?"
            value={form.overwhelmed_thoughts_harming}
            onChange={v => setField('overwhelmed_thoughts_harming', v)}
            options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
          />
          {form.overwhelmed_thoughts_harming === 'Yes' && (
            <>
              <div>
                <label className={labelClass}>Explanation / Triggering Factors</label>
                <textarea rows={3} value={form.overwhelmed_thoughts_explanation} onChange={e => setField('overwhelmed_thoughts_explanation', e.target.value)} className={textareaClass} placeholder="Describe triggering factors..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>How often do these thoughts occur?</label>
                  <input type="text" value={form.thoughts_occurrence_frequency} onChange={e => setField('thoughts_occurrence_frequency', e.target.value)} className={inputClass} placeholder="e.g. Daily, Weekly..." />
                </div>
                <div>
                  <label className={labelClass}>How long have these thoughts been present?</label>
                  <input type="text" value={form.thoughts_present_duration} onChange={e => setField('thoughts_present_duration', e.target.value)} className={inputClass} placeholder="e.g. 2 weeks..." />
                </div>
              </div>
              <SelectField
                label="Are the thoughts becoming stronger or more frequent?"
                value={form.thoughts_becoming_stronger}
                onChange={v => setField('thoughts_becoming_stronger', v)}
                options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }, { value: 'Unknown', label: 'Unknown' }]}
              />
              <SelectField
                label="Have these thoughts occurred within the past 24 hours?"
                value={form.thoughts_past_24_hours}
                onChange={v => setField('thoughts_past_24_hours', v)}
                options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
              />
              <SelectField
                label="Are there any active suicidal thoughts or plans?"
                value={form.active_suicidal_thoughts_plans}
                onChange={v => setField('active_suicidal_thoughts_plans', v)}
                options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
              />
              <div>
                <label className={labelClass}>Other Triggering Factors</label>
                <textarea rows={3} value={form.triggering_factors} onChange={e => setField('triggering_factors', e.target.value)} className={textareaClass} placeholder="Describe other triggering factors..." />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Current Plan */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Current Plan</h3>
        <p className={noteClass}>Has the patient made any current plans or preparations related to harming themselves?</p>
        <div className="space-y-4">
          <SelectField
            label="Has the patient made any current plans or preparations related to harming themselves?"
            value={form.made_current_plans}
            onChange={v => setField('made_current_plans', v)}
            options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
          />
          {form.made_current_plans === 'Yes' && (
            <>
              <div>
                <label className={labelClass}>Is there a general idea of how they might attempt to harm themselves?</label>
                <textarea rows={2} value={form.general_idea_harm_method} onChange={e => setField('general_idea_harm_method', e.target.value)} className={textareaClass} />
              </div>
              <div>
                <label className={labelClass}>Is there a place they have been thinking about?</label>
                <input type="text" value={form.place_thinking_about} onChange={e => setField('place_thinking_about', e.target.value)} className={inputClass} />
              </div>
              <SelectField
                label="How soon do they feel at risk of acting on these thoughts?"
                value={form.risk_timing}
                onChange={v => setField('risk_timing', v)}
                options={[
                  { value: 'Immediate / within 24 hours — requires emergency action', label: 'Immediate / within 24 hours — requires emergency action' },
                  { value: 'Within a week', label: 'Within a week' },
                  { value: 'Non-specific timing', label: 'Non-specific timing' },
                  { value: 'Other', label: 'Other' },
                ]}
              />
              {form.risk_timing === 'Other' && (
                <div>
                  <label className={labelClass}>Other Timing (Specify)</label>
                  <input type="text" value={form.risk_timing_other} onChange={e => setField('risk_timing_other', e.target.value)} className={inputClass} />
                </div>
              )}
            </>
          )}
          <SelectField
            label="Access to Potentially Dangerous Means"
            value={form.access_dangerous_means}
            onChange={v => setField('access_dangerous_means', v)}
            options={[{ value: 'No', label: 'No' }, { value: 'Yes', label: 'Yes' }]}
          />
          {form.access_dangerous_means === 'Yes' && (
            <div>
              <label className={labelClass}>If yes, discuss safety measures to reduce access</label>
              <textarea rows={2} value={form.access_dangerous_means_details} onChange={e => setField('access_dangerous_means_details', e.target.value)} className={textareaClass} />
            </div>
          )}
          <SelectField
            label="Risk-Taking or Impulsive Behaviors"
            value={form.risk_taking_behaviors}
            onChange={v => setField('risk_taking_behaviors', v)}
            options={[{ value: 'No', label: 'No' }, { value: 'Yes', label: 'Yes' }]}
          />
          {form.risk_taking_behaviors === 'Yes' && (
            <div>
              <label className={labelClass}>Examples (Increased substance use, Risky or unsafe driving, Other reckless behaviors)</label>
              <textarea rows={2} value={form.risk_taking_behaviors_examples} onChange={e => setField('risk_taking_behaviors_examples', e.target.value)} className={textareaClass} />
            </div>
          )}
        </div>
      </div>

      {/* Coping Strategies */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Coping Strategies and Support</h3>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Reasons to Live</label>
            <textarea rows={3} value={form.reasons_to_live} onChange={e => setField('reasons_to_live', e.target.value)} className={textareaClass} />
          </div>
          <div>
            <label className={labelClass}>Strategies Used to Manage Previous Crises</label>
            <textarea rows={3} value={form.strategies_manage_crises} onChange={e => setField('strategies_manage_crises', e.target.value)} className={textareaClass} />
          </div>
          <div>
            <label className={labelClass}>What External Supports are Available (family, friends, and professionals)?</label>
            <textarea rows={3} value={form.external_supports_available} onChange={e => setField('external_supports_available', e.target.value)} className={textareaClass} />
          </div>
          <SelectField
            label="Have you ever tried to take your own life before?"
            value={form.previous_attempts}
            onChange={v => setField('previous_attempts', v)}
            options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
          />
          {form.previous_attempts === 'Yes' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>How many attempts?</label>
                <input
                  type="number"
                  min={0}
                  value={form.previous_attempts_count}
                  onChange={e => setField('previous_attempts_count', e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>How long ago?</label>
                <input type="text" value={form.previous_attempts_time_ago} onChange={e => setField('previous_attempts_time_ago', e.target.value)} className={inputClass} placeholder="e.g. 2 years ago..." />
              </div>
            </div>
          )}
          <SelectField
            label="Are there any active suicidal thoughts or plans?"
            value={form.active_suicidal_thoughts_plans_final}
            onChange={v => setField('active_suicidal_thoughts_plans_final', v)}
            options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
          />
        </div>
      </div>

      {/* Reference & Additional Notes */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Reference &amp; Additional Notes</h3>
        <div className="space-y-4">
          <LinkCombobox
            label="IP Risk Analysis Reference"
            value={form.ip_risk_analysis_reference}
            onSelect={(opt) => setField('ip_risk_analysis_reference', opt.name)}
            onClear={() => setField('ip_risk_analysis_reference', '')}
            fetchOptions={fetchIpRiskOpts}
            placeholder="Search IP Risk Analysis..."
          />
          <div>
            <label className={labelClass}>Additional Notes</label>
            <textarea rows={4} value={form.additional_notes} onChange={e => setField('additional_notes', e.target.value)} className={textareaClass} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Risk Factors ────────────────────────────────────────────────────────

function RiskFactorsTab({ form, setField }: { form: FormState; setField: (k: keyof FormState, v: unknown) => void }) {
  const riskFactors: Array<{
    fieldname: keyof FormState
    label: string
    explanation: keyof FormState
  }> = [
    { fieldname: 'male_gender', label: 'Male Gender', explanation: 'male_gender_explanation' },
    { fieldname: 'age_above_45', label: 'Age Above 45 Years', explanation: 'age_above_45_explanation' },
    { fieldname: 'unemployment', label: 'Unemployment', explanation: 'unemployment_explanation' },
    { fieldname: 'not_married', label: 'Not Married', explanation: 'not_married_explanation' },
    { fieldname: 'not_having_kids', label: 'Not Having Kids', explanation: 'not_having_kids_explanation' },
    { fieldname: 'chronic_pain', label: 'Presence of Chronic Pain', explanation: 'chronic_pain_explanation' },
    { fieldname: 'physical_health_condition', label: 'Presence of a Physical Health Condition', explanation: 'physical_health_condition_explanation' },
    { fieldname: 'psychiatric_condition', label: 'Presence of a Psychiatric Condition', explanation: 'psychiatric_condition_explanation' },
    { fieldname: 'substance_misuse_history', label: 'History of Substance Misuse', explanation: 'substance_misuse_history_explanation' },
    { fieldname: 'previous_self_harm', label: 'History of Previous Self-Harm-Related Safety Concerns, or Previous Suicidal Attempts', explanation: 'previous_self_harm_explanation' },
    { fieldname: 'family_history_depression', label: 'Family History of Depression', explanation: 'family_history_depression_explanation' },
    { fieldname: 'family_history_substance_misuse', label: 'Family History of Substance Misuse', explanation: 'family_history_substance_misuse_explanation' },
    { fieldname: 'family_history_suicide', label: 'Family History of Suicide', explanation: 'family_history_suicide_explanation' },
  ]

  return (
    <div>
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Risk Factors of Suicide</h3>
        <p className={noteClass}>Please write Yes or No, then explain (if needed)</p>
        <div className="space-y-4">
          {riskFactors.map(rf => (
            <div key={rf.fieldname} className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <YesNoField
                label={rf.label}
                fieldname={rf.fieldname}
                form={form}
                setField={setField}
                explanation={rf.explanation}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Suicide Attempt Details ─────────────────────────────────────────────

function AttemptDetailsTab({ form, setField }: { form: FormState; setField: (k: keyof FormState, v: unknown) => void }) {
  return (
    <div>
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Suicidal Attempt Details</h3>
        <p className={noteClass}>Complete if the patient is coming with present complaint of attempting suicide.</p>

        <div className="space-y-4">
          {/* Present complaint checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.present_complaint_attempt}
              onChange={e => setField('present_complaint_attempt', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm font-medium text-slate-700">
              Patient is coming with present complaint of attempting suicide
            </span>
          </label>

          {form.present_complaint_attempt && (
            <>
              <div>
                <label className={labelClass}>What seemed to precipitate or trigger the suicide?</label>
                <textarea rows={3} value={form.precipitate_trigger} onChange={e => setField('precipitate_trigger', e.target.value)} className={textareaClass} />
              </div>

              <SelectField
                label="Did the suicide appear planned, or was it more impulsive?"
                value={form.planned_or_impulsive}
                onChange={v => setField('planned_or_impulsive', v)}
                options={[
                  { value: 'Planned', label: 'Planned' },
                  { value: 'Impulsive', label: 'Impulsive' },
                  { value: 'Both', label: 'Both' },
                ]}
              />

              <div>
                <label className={labelClass}>What method was used?</label>
                <textarea rows={2} value={form.method_used} onChange={e => setField('method_used', e.target.value)} className={textareaClass} />
              </div>

              <SelectField
                label="Was any form of message, note or communication left before the suicide?"
                value={form.message_note_left}
                onChange={v => setField('message_note_left', v)}
                options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
              />

              <SelectField
                label="Was the patient under the influence of any substance at the time?"
                value={form.under_influence_substance}
                onChange={v => setField('under_influence_substance', v)}
                options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
              />
              {form.under_influence_substance === 'Yes' && (
                <div>
                  <label className={labelClass}>Substance Details</label>
                  <textarea rows={2} value={form.substance_details} onChange={e => setField('substance_details', e.target.value)} className={textareaClass} />
                </div>
              )}

              <SelectField
                label="Was the patient alone during the suicide?"
                value={form.patient_alone}
                onChange={v => setField('patient_alone', v)}
                options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
              />

              <div>
                <label className={labelClass}>Were there actions that reduced the likelihood of others noticing what was happening?</label>
                <textarea rows={2} value={form.actions_reduced_noticing} onChange={e => setField('actions_reduced_noticing', e.target.value)} className={textareaClass} />
              </div>

              <SelectField
                label="Did the patient seek help afterward, or were they reached by someone else?"
                value={form.sought_help_afterward}
                onChange={v => setField('sought_help_afterward', v)}
                options={[
                  { value: 'Patient sought help', label: 'Patient sought help' },
                  { value: 'Reached by someone else', label: 'Reached by someone else' },
                  { value: 'Both', label: 'Both' },
                  { value: 'Neither', label: 'Neither' },
                ]}
              />

              <div>
                <label className={labelClass}>How does the patient feel when reflecting on what happened? (e.g. regret, relief, distress, confusion)</label>
                <textarea rows={3} value={form.patient_feelings_reflection} onChange={e => setField('patient_feelings_reflection', e.target.value)} className={textareaClass} />
              </div>

              <div>
                <label className={labelClass}>What internal coping skills do they have to stay safe?</label>
                <textarea rows={3} value={form.internal_coping_skills} onChange={e => setField('internal_coping_skills', e.target.value)} className={textareaClass} />
              </div>

              <SelectField
                label="Are there any active suicidal thoughts or plans?"
                value={form.active_suicidal_thoughts_plans_attempt}
                onChange={v => setField('active_suicidal_thoughts_plans_attempt', v)}
                options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export const SuicidalPatientAssessmentModal = ({
  admissionNo,
  patient,
  patientName,
  onClose,
  onSuccess,
}: SuicidalPatientAssessmentModalProps) => {
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [form, setForm] = useState<FormState>(emptyForm())
  const [submitting, setSubmitting] = useState(false)

  const setField = (k: keyof FormState, v: unknown) => {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  const [currentAdmission, setCurrentAdmission] = useState(admissionNo)
  const [currentPatient, setCurrentPatient] = useState(patient)
  const [currentPatientName, setCurrentPatientName] = useState(patientName || '')
  const isLockedContext = Boolean(admissionNo)

  useEffect(() => {
    getCurrentUserPractitioner()
      .then((id) => {
        if (!id) return
        setForm((prev) => (prev.practitioner ? prev : { ...prev, practitioner: id }))
      })
      .catch(() => {})
  }, [])

  const fetchPatientOpts = useCallback((s: string) => fetchPatientOptions(s || undefined), [])
  const fetchAdmissionOpts = useCallback(
    (s: string) => fetchInpatientAdmissionOptions(s || undefined, currentPatient || undefined),
    [currentPatient]
  )
  const fetchIpRiskOpts = useCallback(
    (s: string) =>
      fetchIpRiskAnalysisOptions(
        s || undefined,
        currentPatient || undefined,
        currentAdmission || undefined
      ),
    [currentPatient, currentAdmission]
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!form.assessment_date) {
      toast.error('Assessment Date is required.')
      setActiveTab('general')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        admission_no: currentAdmission,
        patient: currentPatient,
        patient_name: currentPatientName,
        assessment_date: form.assessment_date,
        practitioner: form.practitioner || undefined,
        // Suicidal thoughts
        overwhelmed_thoughts_harming: form.overwhelmed_thoughts_harming || undefined,
        overwhelmed_thoughts_explanation: form.overwhelmed_thoughts_explanation || undefined,
        thoughts_occurrence_frequency: form.thoughts_occurrence_frequency || undefined,
        thoughts_present_duration: form.thoughts_present_duration || undefined,
        thoughts_becoming_stronger: form.thoughts_becoming_stronger || undefined,
        thoughts_past_24_hours: form.thoughts_past_24_hours || undefined,
        active_suicidal_thoughts_plans: form.active_suicidal_thoughts_plans || undefined,
        triggering_factors: form.triggering_factors || undefined,
        // Current plan
        made_current_plans: form.made_current_plans || undefined,
        general_idea_harm_method: form.general_idea_harm_method || undefined,
        place_thinking_about: form.place_thinking_about || undefined,
        risk_timing: form.risk_timing || undefined,
        risk_timing_other: form.risk_timing_other || undefined,
        access_dangerous_means: form.access_dangerous_means || undefined,
        access_dangerous_means_details: form.access_dangerous_means_details || undefined,
        risk_taking_behaviors: form.risk_taking_behaviors || undefined,
        risk_taking_behaviors_examples: form.risk_taking_behaviors_examples || undefined,
        // Coping
        reasons_to_live: form.reasons_to_live || undefined,
        strategies_manage_crises: form.strategies_manage_crises || undefined,
        external_supports_available: form.external_supports_available || undefined,
        previous_attempts: form.previous_attempts || undefined,
        previous_attempts_count: form.previous_attempts_count !== '' ? form.previous_attempts_count : undefined,
        previous_attempts_time_ago: form.previous_attempts_time_ago || undefined,
        active_suicidal_thoughts_plans_final: form.active_suicidal_thoughts_plans_final || undefined,
        // Reference
        ip_risk_analysis_reference: form.ip_risk_analysis_reference || undefined,
        additional_notes: form.additional_notes || undefined,
        // Risk factors
        male_gender: form.male_gender || undefined,
        male_gender_explanation: form.male_gender_explanation || undefined,
        age_above_45: form.age_above_45 || undefined,
        age_above_45_explanation: form.age_above_45_explanation || undefined,
        unemployment: form.unemployment || undefined,
        unemployment_explanation: form.unemployment_explanation || undefined,
        not_married: form.not_married || undefined,
        not_married_explanation: form.not_married_explanation || undefined,
        not_having_kids: form.not_having_kids || undefined,
        not_having_kids_explanation: form.not_having_kids_explanation || undefined,
        chronic_pain: form.chronic_pain || undefined,
        chronic_pain_explanation: form.chronic_pain_explanation || undefined,
        physical_health_condition: form.physical_health_condition || undefined,
        physical_health_condition_explanation: form.physical_health_condition_explanation || undefined,
        psychiatric_condition: form.psychiatric_condition || undefined,
        psychiatric_condition_explanation: form.psychiatric_condition_explanation || undefined,
        substance_misuse_history: form.substance_misuse_history || undefined,
        substance_misuse_history_explanation: form.substance_misuse_history_explanation || undefined,
        previous_self_harm: form.previous_self_harm || undefined,
        previous_self_harm_explanation: form.previous_self_harm_explanation || undefined,
        family_history_depression: form.family_history_depression || undefined,
        family_history_depression_explanation: form.family_history_depression_explanation || undefined,
        family_history_substance_misuse: form.family_history_substance_misuse || undefined,
        family_history_substance_misuse_explanation: form.family_history_substance_misuse_explanation || undefined,
        family_history_suicide: form.family_history_suicide || undefined,
        family_history_suicide_explanation: form.family_history_suicide_explanation || undefined,
        // Attempt details
        present_complaint_attempt: form.present_complaint_attempt ? 1 : 0,
        precipitate_trigger: form.precipitate_trigger || undefined,
        planned_or_impulsive: form.planned_or_impulsive || undefined,
        method_used: form.method_used || undefined,
        message_note_left: form.message_note_left || undefined,
        under_influence_substance: form.under_influence_substance || undefined,
        substance_details: form.substance_details || undefined,
        patient_alone: form.patient_alone || undefined,
        actions_reduced_noticing: form.actions_reduced_noticing || undefined,
        sought_help_afterward: form.sought_help_afterward || undefined,
        patient_feelings_reflection: form.patient_feelings_reflection || undefined,
        internal_coping_skills: form.internal_coping_skills || undefined,
        active_suicidal_thoughts_plans_attempt: form.active_suicidal_thoughts_plans_attempt || undefined,
      }

      const result = await createSuicidalPatientAssessment(payload)
      if (!result.success) {
        throw new Error(result.message || 'Failed to save assessment.')
      }

      toast.success('Suicidal Patient Assessment saved successfully.')
      onSuccess?.()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save assessment.'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const tabIcon = (id: TabId) => {
    if (id === 'general') return <Info className="h-4 w-4" />
    if (id === 'risk-factors') return <AlertTriangle className="h-4 w-4" />
    return <FileText className="h-4 w-4" />
  }

  const subtitle = [
    currentPatientName || patientName,
    currentAdmission || admissionNo,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('w-full max-w-3xl max-h-[92vh] overflow-hidden')}>
        <CreateModalHeader
          title="New Suicidal Patient Assessment"
          icon={<AlertTriangle className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          subtitle={subtitle || undefined}
          onClose={onClose}
        >
          <div className="-mb-px mt-3 flex border-b border-emerald-100/80 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={createModalTabButtonClass(activeTab === tab.id)}
              >
                {tabIcon(tab.id)}
                {tab.label}
              </button>
            ))}
          </div>
        </CreateModalHeader>

        <form onSubmit={handleSubmit} noValidate className={`${CREATE_MODAL_BODY_GRADIENT} flex flex-1 flex-col min-h-0`}>
          <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
            {activeTab === 'general' && (
              <GeneralTab
                form={form}
                setField={setField}
                currentAdmission={currentAdmission}
                currentPatient={currentPatient}
                currentPatientName={currentPatientName}
                isLockedContext={isLockedContext}
                fetchPatientOpts={fetchPatientOpts}
                fetchAdmissionOpts={fetchAdmissionOpts}
                fetchIpRiskOpts={fetchIpRiskOpts}
                setCurrentAdmission={setCurrentAdmission}
                setCurrentPatient={setCurrentPatient}
                setCurrentPatientName={setCurrentPatientName}
              />
            )}
            {activeTab === 'risk-factors' && (
              <RiskFactorsTab form={form} setField={setField} />
            )}
            {activeTab === 'attempt-details' && (
              <AttemptDetailsTab form={form} setField={setField} />
            )}
          </div>

          <div className={`${CREATE_MODAL_FOOTER_STICKY} items-center justify-end`}>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} disabled={submitting} className={CM_BTN_CANCEL}>
                Cancel
              </button>
              <button type="submit" disabled={submitting} className={CM_BTN_PRIMARY}>
                {submitting ? 'Creating…' : 'Create Assessment'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}