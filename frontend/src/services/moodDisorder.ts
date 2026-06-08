export interface MoodDisorderTemplateQuestion {
  question_no: number
  question: string
  response_type: 'Yes/No' | 'Functional'
  response_options: string
  category: string
}

export interface MoodDisorderTemplateData {
  name: string
  template_name: string
  description?: string
  questions: MoodDisorderTemplateQuestion[]
}

export interface MoodDisorderResponseRow {
  question: string
  response?: string
  score: number
  category: string
}

export interface MoodDisorderAssessmentRow {
  name: string
  patient: string
  patient_name?: string
  assessment_date: string
  template: string
  practitioner?: string
  practitioner_name?: string
  q1_yes_count: number
  further_assessment: string
  docstatus: number
  description?: string
  inpatient_admission?: string
  patient_visit?: string
}

export interface MoodDisorderAssessmentDetail extends MoodDisorderAssessmentRow {
  responses: MoodDisorderResponseRow[]
}

export interface MoodDisorderAssessmentListFilters {
  dateFrom?: string
  dateTo?: string
  practitioner?: string
}

export interface CreateMoodDisorderAssessmentInput {
  patient: string
  assessment_date: string
  template: string
  description?: string
  practitioner?: string
  inpatient_admission?: string
  patient_visit?: string
  responses: MoodDisorderResponseRow[]
}

export interface MoodDisorderTemplateListItem {
  name: string
  label: string
  description?: string
  default?: boolean
}

export async function fetchMoodDisorderTemplates(
  search?: string
): Promise<MoodDisorderTemplateListItem[]> {
  const params = new URLSearchParams()
  if (search?.trim()) params.append('search', search.trim())

  const res = await fetch(
    `/api/method/healthcare.api.mood_disorder_assessment.get_mood_disorder_assessment_templates?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load mood disorder templates')
  }
  return data?.message || []
}

export async function fetchDefaultMoodDisorderTemplate(): Promise<MoodDisorderTemplateListItem | null> {
  const res = await fetch(
    '/api/method/healthcare.api.mood_disorder_assessment.get_default_mood_disorder_assessment_template'
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load default mood disorder template')
  }
  return data?.message || null
}

export async function fetchMoodDisorderTemplateQuestions(
  templateName: string
): Promise<MoodDisorderTemplateData> {
  const params = new URLSearchParams({ template_name: templateName })
  const res = await fetch(
    `/api/method/healthcare.api.mood_disorder_assessment.get_mood_disorder_template_questions?${params}`
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

export async function fetchMoodDisorderAssessments(
  patient?: string,
  filters: MoodDisorderAssessmentListFilters = {}
): Promise<MoodDisorderAssessmentRow[]> {
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  if (filters.practitioner) params.append('practitioner', filters.practitioner)
  if (filters.dateFrom) params.append('date_from', filters.dateFrom)
  if (filters.dateTo) params.append('date_to', filters.dateTo)

  const res = await fetch(
    `/api/method/healthcare.api.mood_disorder_assessment.get_mood_disorder_assessments?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load mood disorder assessments')
  }
  return data?.message || []
}

export async function fetchMoodDisorderAssessment(name: string): Promise<MoodDisorderAssessmentDetail> {
  const params = new URLSearchParams({ name })
  const res = await fetch(
    `/api/method/healthcare.api.mood_disorder_assessment.get_mood_disorder_assessment?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load mood disorder assessment')
  }
  return data?.message as MoodDisorderAssessmentDetail
}

export async function createMoodDisorderAssessment(
  input: CreateMoodDisorderAssessmentInput
): Promise<{ success: boolean; name?: string; message?: string }> {
  const res = await fetch(
    '/api/method/healthcare.api.mood_disorder_assessment.create_mood_disorder_assessment',
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
