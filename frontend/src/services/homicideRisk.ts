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
  patient_name?: string
  assessment_date: string
  clinician?: string
  practitioner_name?: string
  risk_level: string
  docstatus: number
  inpatient_admission?: string
  patient_visit?: string
}

export interface HomicideRiskAssessmentDetail extends HomicideRiskAssessmentRow {
  reason_clinician?: number
  reason_referral?: number
  reason_social?: number
  reason_intake?: number
  reason_crisis?: number
  reason_current?: number
  reason_recent_event?: number
  reason_other_check?: number
  other_reason?: string
  reason_for?: string
  intent_subjective?: string
  intent_objective?: string
  plan_when?: string
  plan_where?: string
  plan_how?: string
  intended_victim?: string
  access_to_means?: string
  preparation?: string
  rehearsal?: string
  frequency?: string
  intensity?: string
  duration?: string
  history_self_harm?: string
  history_violence?: string
  recent_discharge?: string
  depression?: number
  anxiety?: number
  anger?: number
  agitation?: number
  insomnia?: number
  hopelessness?: number
  burdensomeness?: number
  impulsivity?: number
  subjective_report?: string
  objective_signs?: string
  chronic_risk?: string
  chronic_summary?: string
  therapeutic_alliance?: string
  past_safety_strategies?: string
  coping_strategies?: string
  treatment_preferences?: string
  staff_responsibilities?: string
  contacts?: ContactRow[]
  client_signature?: string
  staff_signature?: string
  guardian_signature?: string
  witness_signature?: string
  followup_date?: string
  followup_time?: string
}

export interface HomicideRiskAssessmentListFilters {
  dateFrom?: string
  dateTo?: string
  practitioner?: string
}

export interface CreateHomicideRiskAssessmentInput {
  patient: string
  assessment_date: string
  practitioner?: string
  inpatient_admission?: string
  patient_visit?: string
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
  intent_subjective?: string
  intent_objective?: string
  plan_when?: string
  plan_where?: string
  plan_how?: string
  intended_victim?: string
  access_to_means?: string
  preparation?: string
  rehearsal?: string
  frequency?: string
  intensity?: string
  duration?: string
  history_self_harm?: string
  history_violence?: string
  recent_discharge?: string
  depression?: number
  anxiety?: number
  anger?: number
  agitation?: number
  insomnia?: number
  hopelessness?: number
  burdensomeness?: number
  impulsivity?: number
  subjective_report?: string
  objective_signs?: string
  chronic_risk?: string
  chronic_summary?: string
  therapeutic_alliance?: string
  risk_level?: string
  past_safety_strategies?: string
  coping_strategies?: string
  treatment_preferences?: string
  staff_responsibilities?: string
  contacts?: ContactRow[]
  client_signature?: string
  staff_signature?: string
  guardian_signature?: string
  witness_signature?: string
  followup_date?: string
  followup_time?: string
}

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

export async function fetchHomicideRiskAssessments(
  patient?: string,
  filters: HomicideRiskAssessmentListFilters = {}
): Promise<HomicideRiskAssessmentRow[]> {
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  if (filters.practitioner) params.append('practitioner', filters.practitioner)
  if (filters.dateFrom) params.append('date_from', filters.dateFrom)
  if (filters.dateTo) params.append('date_to', filters.dateTo)

  const res = await fetch(
    `/api/method/healthcare.api.homicide_risk_assessment.get_homicide_risk_assessments?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load homicide risk assessments')
  }
  return data?.message || []
}

export async function fetchHomicideRiskAssessment(
  name: string
): Promise<HomicideRiskAssessmentDetail> {
  const params = new URLSearchParams({ name })
  const res = await fetch(
    `/api/method/healthcare.api.homicide_risk_assessment.get_homicide_risk_assessment?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load homicide risk assessment')
  }
  const detail = data?.message as HomicideRiskAssessmentDetail
  if (detail?.clinician && !detail.practitioner_name) {
    detail.practitioner_name = detail.clinician
  }
  return detail
}
