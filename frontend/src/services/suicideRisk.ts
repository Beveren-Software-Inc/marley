// services/suicideRisk.ts

import type { RiskYesNo } from './riskYesNo'

export interface SuicideRiskAssessmentRow {
  name: string
  patient: string
  patient_name?: string
  assessment_date: string
  clinician?: string
  clinician_name?: string
  inpatient_admission?: string
  patient_visit?: string
  risk_score: number
  risk_level: string
  docstatus: number
  /** Needed by the portal list to decide whether the 24-hour edit window is open. */
  creation?: string
  modified?: string
}

export interface SuicideRiskAssessmentDetail extends SuicideRiskAssessmentRow {
  has_ideation?: RiskYesNo
  ideation_frequency?: string
  ideation_duration?: string
  ideation_increasing?: string
  ideation_24h?: RiskYesNo
  has_plan?: RiskYesNo
  plan_method?: string
  plan_location?: string
  plan_immediacy?: string
  access_lethal_means?: RiskYesNo
  risk_behavior?: RiskYesNo
  risk_behavior_details?: string
  has_history?: RiskYesNo
  attempt_count?: number
  last_attempt?: string
  psychiatric_history?: string
  prior_psychiatric_diagnosis?: string
  has_stressors?: RiskYesNo
  stressors_description?: string
  has_support?: RiskYesNo
  support_people?: string
  has_coping?: RiskYesNo
  coping_strategies?: string
  reasons_to_live?: string
  personal_strengths?: string
  actions_required?: string
}

export interface CreateSuicideRiskAssessmentInput {
  patient: string
  assessment_date: string
  clinician?: string
  inpatient_admission?: string
  patient_visit?: string

  // Answers are "Yes" / "No"; a question left blank stays unanswered.
  // Section 1: Suicidal Ideation
  has_ideation: RiskYesNo
  ideation_frequency?: string
  ideation_duration?: string
  ideation_increasing?: string
  ideation_24h?: RiskYesNo

  // Section 2: Current Plan
  has_plan: RiskYesNo
  plan_method?: string
  plan_location?: string
  plan_immediacy?: string
  access_lethal_means?: RiskYesNo
  risk_behavior?: RiskYesNo
  risk_behavior_details?: string

  // Section 3: History
  has_history: RiskYesNo
  attempt_count?: number
  last_attempt?: string
  psychiatric_history?: string
  prior_psychiatric_diagnosis?: string

  // Section 4: Stressors
  has_stressors: RiskYesNo
  stressors_description?: string

  // Section 5: Support
  has_support: RiskYesNo
  support_people?: string

  // Section 6: Coping
  has_coping: RiskYesNo
  coping_strategies?: string
  reasons_to_live?: string
  personal_strengths?: string

  // Actions
  actions_required?: string
}

/** Update payload — same fields as create, plus the record name; patient is fixed. */
export interface UpdateSuicideRiskAssessmentInput
  extends Omit<CreateSuicideRiskAssessmentInput, 'patient'> {
  /** Name (ID) of the Clinical Suicide Risk Assessment being updated. */
  name: string
}

// ── Create assessment ─────────────────────────────────────────────────────────
export async function createSuicideRiskAssessment(
  input: CreateSuicideRiskAssessmentInput
): Promise<{ success: boolean; name?: string; message?: string }> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()

  const res = await fetch(
    '/api/method/healthcare.api.clinical_suicide.create_suicide_risk_assessment',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ data: JSON.stringify(input) }),
    }
  )
  const data = await res.json()
  const msg = data?.message
  return msg ?? { success: false, message: 'Unknown error' }
}

// ── Update assessment (24-hour window) ────────────────────────────────────────
export async function updateSuicideRiskAssessment(
  input: UpdateSuicideRiskAssessmentInput
): Promise<{ success: boolean; name?: string; message?: string }> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()

  const res = await fetch(
    '/api/method/healthcare.api.clinical_suicide.update_suicide_risk_assessment',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ data: JSON.stringify(input) }),
    }
  )
  const data = await res.json()
  const msg = data?.message
  return msg ?? { success: false, message: 'Unknown error' }
}

// ── Delete assessment (24-hour window) ────────────────────────────────────────
export async function deleteSuicideRiskAssessment(
  name: string
): Promise<{ success: boolean; name?: string; message?: string }> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()

  const res = await fetch(
    '/api/method/healthcare.api.clinical_suicide.delete_suicide_risk_assessment',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ name }),
    }
  )
  const data = await res.json()
  const msg = data?.message
  return msg ?? { success: false, message: 'Unknown error' }
}

// ── Fetch assessments list ────────────────────────────────────────────────────
export async function fetchSuicideRiskAssessments(
  patient?: string,
  search?: string,
  inpatientAdmission?: string,
  patientVisit?: string
): Promise<SuicideRiskAssessmentRow[]> {
  const params = new URLSearchParams()
  if (patient) params.set('patient', patient)
  if (search) params.set('search', search)
  if (inpatientAdmission) params.set('admission', inpatientAdmission)
  if (patientVisit) params.set('patient_visit', patientVisit)

  const res = await fetch(
    `/api/method/healthcare.api.clinical_suicide.get_suicide_risk_assessments?${params}`,
    { credentials: 'include' }
  )
  const data = await res.json()
  if (Array.isArray(data?.message)) {
    return data.message as SuicideRiskAssessmentRow[]
  }
  return []
}

export async function fetchSuicideRiskAssessment(
  name: string
): Promise<SuicideRiskAssessmentDetail> {
  const params = new URLSearchParams({ name })
  const res = await fetch(
    `/api/method/healthcare.api.clinical_suicide.get_suicide_risk_assessment?${params.toString()}`,
    { credentials: 'include' }
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load suicide risk assessment')
  }
  return data?.message as SuicideRiskAssessmentDetail
}
