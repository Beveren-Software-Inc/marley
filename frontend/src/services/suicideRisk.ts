// services/suicideRisk.ts

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
}

export interface CreateSuicideRiskAssessmentInput {
  patient: string
  assessment_date: string
  clinician?: string
  inpatient_admission?: string
  patient_visit?: string

  // Section 1: Suicidal Ideation
  has_ideation: boolean
  ideation_frequency?: string
  ideation_duration?: string
  ideation_increasing?: string
  ideation_24h?: boolean

  // Section 2: Current Plan
  has_plan: boolean
  plan_method?: string
  plan_location?: string
  plan_immediacy?: string
  access_lethal_means?: boolean
  risk_behavior?: boolean

  // Section 3: History
  has_history: boolean
  attempt_count?: number
  last_attempt?: string
  psychiatric_history?: string

  // Section 4: Stressors
  has_stressors: boolean
  stressors_description?: string

  // Section 5: Support
  has_support: boolean
  support_people?: string

  // Section 6: Coping
  has_coping: boolean
  coping_strategies?: string
  reasons_to_live?: string
  personal_strengths?: string

  // Actions
  actions_required?: string
}

// ── Create assessment ─────────────────────────────────────────────────────────
export async function createSuicideRiskAssessment(
  input: CreateSuicideRiskAssessmentInput
): Promise<{ success: boolean; name?: string; message?: string }> {
  const res = await fetch(
    '/api/method/healthcare.api.clinical_suicide.create_suicide_risk_assessment',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Frappe-CSRF-Token': (window as any).csrf_token || '',
      },
      credentials: 'include',
      body: JSON.stringify({ data: JSON.stringify(input) }),
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
