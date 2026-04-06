// services/homicideRisk.ts

export interface ContactRow {
  relative_name: string
  relationship_with_patient: string
  cpr__id_no?: string
  relative_phone_no?: string
  relative_alternative_phone_no?: string
  relative_alternative_phone_no_2?: string
  any_remarks?: string
  entered_by?: string
  entered_date?: string
}

export interface HomicideRiskAssessmentRow {
  name: string
  patient: string
  patient_name: string
  assessment_date: string
  clinician: string
  risk_level: string
  docstatus: number
}

export interface CreateHomicideRiskAssessmentInput {
  patient: string
  assessment_date: string
  clinician?: string
  
  // Reason for Assessment
  reason_clinician?: boolean
  reason_referral?: boolean
  reason_social?: boolean
  reason_intake?: boolean
  reason_crisis?: boolean
  reason_current?: boolean
  reason_recent_event?: boolean
  reason_other_check?: boolean
  other_reason?: string
  reason_for?: string
  
  // Current Episode
  intent_subjective?: string
  intent_objective?: string
  plan_when?: string
  plan_where?: string
  plan_how?: string
  intended_victim?: string
  access_to_means?: string
  preparation?: string
  rehearsal?: string
  
  // Ideation Characteristics
  frequency?: string
  intensity?: string
  duration?: string
  
  // History
  history_self_harm?: string
  history_violence?: string
  recent_discharge?: string
  
  // Symptom Severity
  depression?: number
  anxiety?: number
  anger?: number
  agitation?: number
  insomnia?: number
  hopelessness?: number
  burdensomeness?: number
  impulsivity?: number
  
  // Clinical Summary
  subjective_report?: string
  objective_signs?: string
  chronic_risk?: string
  chronic_summary?: string
  
  // Therapeutic Alliance
  therapeutic_alliance?: string
  risk_level?: string
  
  // Crisis Safety Plan
  past_safety_strategies?: string
  coping_strategies?: string
  treatment_preferences?: string
  staff_responsibilities?: string
  
  // Contacts
  contacts?: ContactRow[]
  
  // Signatures
  client_signature?: string
  staff_signature?: string
  guardian_signature?: string
  witness_signature?: string
  
  // Follow Up
  followup_date?: string
  followup_time?: string
}

// ── Create assessment ─────────────────────────────────────────────────────────
export async function createHomicideRiskAssessment(
  input: CreateHomicideRiskAssessmentInput
): Promise<{ success: boolean; name?: string; message?: string }> {
  const res = await fetch(
    '/api/method/healthcare.api.homicide_risk_assessment.create_homicide_risk_assessment',
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
export async function fetchHomicideRiskAssessments(
  patient?: string,
  search?: string
): Promise<HomicideRiskAssessmentRow[]> {
  const filters: any[] = []
  
  if (patient) filters.push(['patient', '=', patient])
  if (search) filters.push(['patient_name', 'like', `%${search}%`])

  const params = new URLSearchParams({
    fields: JSON.stringify([
      'name', 'patient', 'patient_name', 'assessment_date',
      'clinician', 'risk_level', 'docstatus'
    ]),
    filters: JSON.stringify(filters),
    limit: '50',
    order_by: 'assessment_date desc',
  })

  const res = await fetch(`/api/resource/Homicide Risk Assessment?${params}`)
  const data = await res.json()

  if (data?.data) {
    return data.data
  }
  
  if (data?.message) {
    return data.message
  }
  
  return []
}