// services/ymrs.ts

export interface YMRSQuestionOption {
  score: number
  text: string
}

export interface YMRSTemplateQuestion {
  question_no: number
  question: string
  max_score: number
  options: YMRSQuestionOption[]
}

export interface YMRSTemplateData {
  name: string
  template_name: string
  description?: string
  questions: YMRSTemplateQuestion[]
}

export interface YMRSResponseRow {
  question_no: number
  question: string
  response: string
  score: number
}

export interface YMRSAssessmentRow {
  name: string
  patient: string
  patient_name?: string
  assessment_date: string
  template: string
  total_score: number
  severity: string
  docstatus: number
  notes?: string
  practitioner?: string
  practitioner_name?: string
  inpatient_admission?: string
  patient_visit?: string
}

export interface YMRSAssessmentDetail extends YMRSAssessmentRow {
  responses?: YMRSResponseRow[]
  /** Child table rows as returned by Frappe before API normalization */
  questions?: YMRSResponseRow[]
}

export interface YMRSAssessmentListFilters {
  dateFrom?: string
  dateTo?: string
  practitioner?: string
}

export interface CreateYMRSAssessmentInput {
  patient: string
  assessment_date: string
  template: string
  notes?: string
  practitioner?: string
  inpatient_admission?: string
  patient_visit?: string
  responses: YMRSResponseRow[]
}

export interface YMRSTemplateListItem {
  name: string
  label: string
  description?: string
  default?: boolean
}

export async function fetchYMRSTemplates(
  search?: string
): Promise<YMRSTemplateListItem[]> {
  const params = new URLSearchParams()
  if (search?.trim()) params.append('search', search.trim())

  const res = await fetch(
    `/api/method/healthcare.api.ymrs_assessment.get_ymrs_assessment_templates?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load YMRS templates')
  }
  return data?.message || []
}

export async function fetchDefaultYMRSAssessmentTemplate(): Promise<YMRSTemplateListItem | null> {
  const res = await fetch(
    '/api/method/healthcare.api.ymrs_assessment.get_default_ymrs_assessment_template'
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load default YMRS template')
  }
  return data?.message || null
}

export async function fetchYMRSTemplateQuestions(
  templateName: string
): Promise<YMRSTemplateData> {
  const params = new URLSearchParams({ template_name: templateName })
  const res = await fetch(
    `/api/method/healthcare.api.ymrs_assessment.get_ymrs_template_questions?${params}`
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

export async function fetchYMRSAssessments(
  patient?: string,
  filters: YMRSAssessmentListFilters = {}
): Promise<YMRSAssessmentRow[]> {
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  if (filters.practitioner) params.append('practitioner', filters.practitioner)
  if (filters.dateFrom) params.append('date_from', filters.dateFrom)
  if (filters.dateTo) params.append('date_to', filters.dateTo)

  const res = await fetch(
    `/api/method/healthcare.api.ymrs_assessment.get_ymrs_assessments?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load YMRS assessments')
  }
  return data?.message || []
}

export async function fetchYMRSAssessment(name: string): Promise<YMRSAssessmentDetail> {
  const params = new URLSearchParams({ name })
  const res = await fetch(
    `/api/method/healthcare.api.ymrs_assessment.get_ymrs_assessment?${params.toString()}`,
    { credentials: 'include' }
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load YMRS assessment')
  }
  return data?.message as YMRSAssessmentDetail
}

export async function createYMRSAssessment(
  input: CreateYMRSAssessmentInput
): Promise<{ success: boolean; name?: string; message?: string }> {
  const res = await fetch(
    '/api/method/healthcare.api.ymrs_assessment.create_ymrs_assessment',
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
