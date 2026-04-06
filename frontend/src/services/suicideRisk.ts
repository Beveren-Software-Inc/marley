// services/suicideRisk.ts

export interface SuicideRiskAssessmentRow {
  name: string
  patient: string
  patient_name: string
  assessment_date: string
  clinician: string
  risk_score: number
  risk_level: string
  docstatus: number
}

export interface CreateSuicideRiskAssessmentInput {
  patient: string
  assessment_date: string
  clinician?: string
  
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
    '/api/method/healthcare.api.suicide_risk_assessment.create_suicide_risk_assessment',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Frappe-CSRF-Token': (window as any).csrf_token || '',
      },
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
  search?: string
): Promise<SuicideRiskAssessmentRow[]> {
  const filters: any[] = []
  
  if (patient) filters.push(['patient', '=', patient])
  if (search) filters.push(['patient_name', 'like', `%${search}%`])

  const params = new URLSearchParams({
    fields: JSON.stringify([
      'name', 'patient', 'patient_name', 'assessment_date',
      'clinician', 'risk_score', 'risk_level', 'docstatus'
    ]),
    filters: JSON.stringify(filters),
    limit: '50',
    order_by: 'assessment_date desc',
  })

  const res = await fetch(`/api/resource/Clinical Suicide Risk Assessment?${params}`)
  const data = await res.json()

  if (data?.data) {
    return data.data
  }
  
  if (data?.message) {
    return data.message
  }
  
  return []
}