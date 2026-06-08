// services/phq9.ts

export interface PHQ9TemplateQuestion {
  question_no: number
  question: string
  question_type: string
  response_options: string
}

export interface PHQ9TemplateData {
  name: string
  template_name: string
  description?: string
  questions: PHQ9TemplateQuestion[]
}

export interface PHQ9ResponseRow {
  question: string
  question_type: string
  response?: string
  score: number
}

export interface PHQ9AssessmentRow {
  name: string
  patient: string
  patient_name?: string
  assessment_date: string
  template: string
  practitioner?: string
  practitioner_name?: string
  total_score: number
  severity: string
  docstatus: number
  notes?: string
  inpatient_admission?: string
  patient_visit?: string
}

export interface PHQ9AssessmentDetail extends PHQ9AssessmentRow {
  responses: PHQ9ResponseRow[]
}

export interface PHQ9AssessmentListFilters {
  dateFrom?: string
  dateTo?: string
  practitioner?: string
}

export interface PHQ9TemplateListItem {
  name: string
  label: string
  description?: string
  default?: boolean
}

export interface CreatePHQ9AssessmentInput {
  patient: string
  assessment_date: string
  template: string
  notes?: string
  practitioner?: string
  inpatient_admission?: string
  patient_visit?: string
  responses: PHQ9ResponseRow[]
}

export const RESPONSE_OPTIONS = [
  '0 - Not at all',
  '1 - Several days',
  '2 - More than half the days',
  '3 - Nearly every day',
] as const

export type ResponseOption = (typeof RESPONSE_OPTIONS)[number]

export const RESPONSE_SCORE: Record<ResponseOption, number> = {
  '0 - Not at all': 0,
  '1 - Several days': 1,
  '2 - More than half the days': 2,
  '3 - Nearly every day': 3,
}

export async function fetchPHQ9Templates(
  search?: string
): Promise<PHQ9TemplateListItem[]> {
  const params = new URLSearchParams()
  if (search?.trim()) params.append('search', search.trim())

  const res = await fetch(
    `/api/method/healthcare.api.phq9_assessment.get_phq9_assessment_templates?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load PHQ9 templates')
  }
  return data?.message || []
}

export async function fetchDefaultPHQ9Template(): Promise<PHQ9TemplateListItem | null> {
  const res = await fetch(
    '/api/method/healthcare.api.phq9_assessment.get_default_phq9_assessment_template'
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load default PHQ9 template')
  }
  return data?.message || null
}

export async function fetchPHQ9TemplateQuestions(
  templateName: string
): Promise<PHQ9TemplateData> {
  const params = new URLSearchParams({ template_name: templateName })
  const res = await fetch(
    `/api/method/healthcare.api.phq9_assessment.get_phq9_template_questions?${params}`
  )
  const data = await res.json()
  const msg = data?.message

  if (msg && Array.isArray(msg.questions)) {
    return {
      name: msg.name,
      template_name: msg.template_name,
      description: msg.description,
      questions: msg.questions,
    }
  }

  return {
    name: templateName,
    template_name: templateName,
    description: undefined,
    questions: [],
  }
}

export async function fetchPHQ9Assessments(
  patient?: string,
  filters: PHQ9AssessmentListFilters = {}
): Promise<PHQ9AssessmentRow[]> {
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  if (filters.practitioner) params.append('practitioner', filters.practitioner)
  if (filters.dateFrom) params.append('date_from', filters.dateFrom)
  if (filters.dateTo) params.append('date_to', filters.dateTo)

  const res = await fetch(
    `/api/method/healthcare.api.phq9_assessment.get_phq9_assessments?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load PHQ9 assessments')
  }
  return data?.message || []
}

export async function fetchPHQ9Assessment(name: string): Promise<PHQ9AssessmentDetail> {
  const params = new URLSearchParams({ name })
  const res = await fetch(
    `/api/method/healthcare.api.phq9_assessment.get_phq9_assessment?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load PHQ9 assessment')
  }
  return data?.message as PHQ9AssessmentDetail
}

export async function createPHQ9Assessment(
  input: CreatePHQ9AssessmentInput
): Promise<{ success: boolean; name?: string; message?: string }> {
  const res = await fetch(
    '/api/method/healthcare.api.phq9_assessment.create_phq9_assessment',
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
