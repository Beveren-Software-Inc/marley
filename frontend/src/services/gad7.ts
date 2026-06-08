export interface GAD7TemplateQuestion {
  question_no: number
  question: string
  question_type: string
  response_options: string
}

export interface GAD7TemplateData {
  name: string
  template_name: string
  description?: string
  questions: GAD7TemplateQuestion[]
}

export interface GAD7ResponseRow {
  question_no: number
  question: string
  question_type: string
  response?: string
  score: number
}

export interface GAD7AssessmentRow {
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

export interface GAD7AssessmentDetail extends GAD7AssessmentRow {
  responses: GAD7ResponseRow[]
}

export interface GAD7AssessmentListFilters {
  dateFrom?: string
  dateTo?: string
  practitioner?: string
}

export interface CreateGAD7AssessmentInput {
  patient: string
  assessment_date: string
  template: string
  notes?: string
  practitioner?: string
  inpatient_admission?: string
  patient_visit?: string
  responses: GAD7ResponseRow[]
}

export interface GAD7TemplateListItem {
  name: string
  label: string
  description?: string
  default?: boolean
}

export const RESPONSE_OPTIONS = [
  '0 - Not at all',
  '1 - Several days',
  '2 - More than half the days',
  '3 - Nearly every day',
] as const

export type ResponseOption = typeof RESPONSE_OPTIONS[number]

export const RESPONSE_SCORE: Record<ResponseOption, number> = {
  '0 - Not at all': 0,
  '1 - Several days': 1,
  '2 - More than half the days': 2,
  '3 - Nearly every day': 3,
}

export async function fetchGAD7Templates(
  search?: string
): Promise<GAD7TemplateListItem[]> {
  const params = new URLSearchParams()
  if (search?.trim()) params.append('search', search.trim())

  const res = await fetch(
    `/api/method/healthcare.api.gad7_assessment.get_gad7_assessment_templates?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load GAD7 templates')
  }
  return data?.message || []
}

export async function fetchDefaultGAD7Template(): Promise<GAD7TemplateListItem | null> {
  const res = await fetch(
    '/api/method/healthcare.api.gad7_assessment.get_default_gad7_assessment_template'
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load default GAD7 template')
  }
  return data?.message || null
}

export async function fetchGAD7TemplateQuestions(
  templateName: string
): Promise<GAD7TemplateData> {
  const params = new URLSearchParams({ template_name: templateName })
  const res = await fetch(
    `/api/method/healthcare.api.gad7_assessment.get_gad7_template_questions?${params}`
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

export async function fetchGAD7Assessments(
  patient?: string,
  filters: GAD7AssessmentListFilters = {}
): Promise<GAD7AssessmentRow[]> {
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  if (filters.practitioner) params.append('practitioner', filters.practitioner)
  if (filters.dateFrom) params.append('date_from', filters.dateFrom)
  if (filters.dateTo) params.append('date_to', filters.dateTo)

  const res = await fetch(
    `/api/method/healthcare.api.gad7_assessment.get_gad7_assessments?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load GAD7 assessments')
  }
  return data?.message || []
}

export async function fetchGAD7Assessment(name: string): Promise<GAD7AssessmentDetail> {
  const params = new URLSearchParams({ name })
  const res = await fetch(
    `/api/method/healthcare.api.gad7_assessment.get_gad7_assessment?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load GAD7 assessment')
  }
  return data?.message as GAD7AssessmentDetail
}

export async function createGAD7Assessment(
  input: CreateGAD7AssessmentInput
): Promise<{ success: boolean; name?: string; message?: string }> {
  const res = await fetch(
    '/api/method/healthcare.api.gad7_assessment.create_gad7_assessment',
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
