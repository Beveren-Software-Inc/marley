// services/ybocs.ts

export interface YBOCSTemplateQuestion {
  question_no: number
  section: 'Obsessions' | 'Compulsions'
  question: string
  option_0: string
  option_1: string
  option_2: string
  option_3: string
  option_4: string
}

export interface YBOCSTemplateData {
  name: string
  template_name: string
  description?: string
  questions: YBOCSTemplateQuestion[]
}

export interface YBOCSResponseRow {
  question_no: number
  section: string
  question: string
  response?: string
  score: number
}

export interface YBOCSAssessmentRow {
  name: string
  patient: string
  patient_name?: string
  assessment_date: string
  template: string
  practitioner?: string
  practitioner_name?: string
  total_score: number
  total_obsessions: number
  total_compulsions: number
  docstatus: number
  notes?: string
  inpatient_admission?: string
  patient_visit?: string
}

export interface YBOCSAssessmentDetail extends YBOCSAssessmentRow {
  responses: YBOCSResponseRow[]
}

export interface YBOCSAssessmentListFilters {
  dateFrom?: string
  dateTo?: string
  practitioner?: string
}

export interface YBOCSTemplateListItem {
  name: string
  label: string
  description?: string
  default?: boolean
}

export const RESPONSE_OPTIONS = ['0', '1', '2', '3', '4'] as const
export type ResponseOption = (typeof RESPONSE_OPTIONS)[number]

export const RESPONSE_SCORE: Record<ResponseOption, number> = {
  '0': 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
}

export interface CreateYBOCSAssessmentInput {
  patient: string
  assessment_date: string
  template: string
  notes?: string
  practitioner?: string
  inpatient_admission?: string
  patient_visit?: string
  responses: YBOCSResponseRow[]
}

export async function fetchYBOCSTemplates(
  search?: string
): Promise<YBOCSTemplateListItem[]> {
  const params = new URLSearchParams()
  if (search?.trim()) params.append('search', search.trim())

  const res = await fetch(
    `/api/method/healthcare.api.ybocs_assessment.get_ybocs_assessment_templates?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load YBOCS templates')
  }
  return data?.message || []
}

export async function fetchDefaultYBOCSTemplate(): Promise<YBOCSTemplateListItem | null> {
  const res = await fetch(
    '/api/method/healthcare.api.ybocs_assessment.get_default_ybocs_assessment_template'
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load default YBOCS template')
  }
  return data?.message || null
}

export async function fetchYBOCSTemplateQuestions(
  templateName: string
): Promise<YBOCSTemplateData> {
  const params = new URLSearchParams({ template_name: templateName })
  const res = await fetch(
    `/api/method/healthcare.api.ybocs_assessment.get_ybocs_template_questions?${params}`
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

export async function fetchYBOCSAssessments(
  patient?: string,
  filters: YBOCSAssessmentListFilters = {}
): Promise<YBOCSAssessmentRow[]> {
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  if (filters.practitioner) params.append('practitioner', filters.practitioner)
  if (filters.dateFrom) params.append('date_from', filters.dateFrom)
  if (filters.dateTo) params.append('date_to', filters.dateTo)

  const res = await fetch(
    `/api/method/healthcare.api.ybocs_assessment.get_ybocs_assessments?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load YBOCS assessments')
  }
  return data?.message || []
}

export async function fetchYBOCSAssessment(name: string): Promise<YBOCSAssessmentDetail> {
  const params = new URLSearchParams({ name })
  const res = await fetch(
    `/api/method/healthcare.api.ybocs_assessment.get_ybocs_assessment?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load YBOCS assessment')
  }
  return data?.message as YBOCSAssessmentDetail
}

export async function createYBOCSAssessment(
  input: CreateYBOCSAssessmentInput
): Promise<{ success: boolean; name?: string; message?: string }> {
  const res = await fetch(
    '/api/method/healthcare.api.ybocs_assessment.create_ybocs_assessment',
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
