export interface DepressionTemplateQuestion {
  question_no: number
  question: string
  option_0: string
  option_1: string
  option_2: string
  option_3: string
}

export interface DepressionTemplateData {
  name: string
  template_name: string
  description?: string
  questions: DepressionTemplateQuestion[]
}

export interface DepressionResponseRow {
  question_no: number
  question: string
  option_0: string
  option_1: string
  option_2: string
  option_3: string
  response?: string
  score: number
}

export interface DepressionAssessmentRow {
  name: string
  patient: string
  patient_name?: string
  assessment_date: string
  template: string
  practitioner?: string
  practitioner_name?: string
  total_score: number
  level_of_depression: string
  docstatus: number
  notes?: string
  inpatient_admission?: string
  patient_visit?: string
}

export interface DepressionAssessmentDetail extends DepressionAssessmentRow {
  responses: DepressionResponseRow[]
}

export interface DepressionAssessmentListFilters {
  dateFrom?: string
  dateTo?: string
  practitioner?: string
}

export interface CreateDepressionAssessmentInput {
  patient: string
  assessment_date: string
  template: string
  notes?: string
  practitioner?: string
  inpatient_admission?: string
  patient_visit?: string
  responses: DepressionResponseRow[]
}

export interface DepressionTemplateListItem {
  name: string
  label: string
  description?: string
  default?: boolean
}

export async function fetchDepressionTemplates(
  search?: string
): Promise<DepressionTemplateListItem[]> {
  const params = new URLSearchParams()
  if (search?.trim()) params.append('search', search.trim())

  const res = await fetch(
    `/api/method/healthcare.api.depression.get_depression_assessment_templates?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load depression templates')
  }
  return data?.message || []
}

export async function fetchDefaultDepressionTemplate(): Promise<DepressionTemplateListItem | null> {
  const res = await fetch(
    '/api/method/healthcare.api.depression.get_default_depression_assessment_template'
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load default depression template')
  }
  return data?.message || null
}

export async function fetchDepressionTemplateQuestions(
  templateName: string
): Promise<DepressionTemplateData> {
  const params = new URLSearchParams({ template_name: templateName })
  const res = await fetch(
    `/api/method/healthcare.api.depression.get_depression_template_questions?${params}`
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

export async function fetchDepressionAssessments(
  patient?: string,
  filters: DepressionAssessmentListFilters = {}
): Promise<DepressionAssessmentRow[]> {
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  if (filters.practitioner) params.append('practitioner', filters.practitioner)
  if (filters.dateFrom) params.append('date_from', filters.dateFrom)
  if (filters.dateTo) params.append('date_to', filters.dateTo)

  const res = await fetch(
    `/api/method/healthcare.api.depression.get_depression_assessments?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load depression assessments')
  }
  return data?.message || []
}

export async function fetchDepressionAssessment(name: string): Promise<DepressionAssessmentDetail> {
  const params = new URLSearchParams({ name })
  const res = await fetch(
    `/api/method/healthcare.api.depression.get_depression_assessment?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load depression assessment')
  }
  return data?.message as DepressionAssessmentDetail
}

export async function createDepressionAssessment(
  input: CreateDepressionAssessmentInput
): Promise<{ success: boolean; name?: string; message?: string }> {
  const res = await fetch(
    '/api/method/healthcare.api.depression.create_depression_assessment',
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
