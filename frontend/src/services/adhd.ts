// services/adhdAssessment.ts

export interface ADHDTemplateQuestion {
  question_no: number
  question: string
  part: 'Part A' | 'Part B'
}

export interface ADHDTemplateData {
  name: string
  template_name: string
  description?: string
  footer_description?: string
  questions: ADHDTemplateQuestion[]
}

export interface ADHDResponseRow {
  question_no: number
  question: string
  part: 'Part A' | 'Part B'
  response?: 'Never' | 'Rarely' | 'Sometimes' | 'Often' | 'Very Often'
  score?: number
  is_positive?: boolean
}

export interface ADHDAssessmentRow {
  name: string
  patient: string
  patient_name?: string
  assessment_date: string
  template: string
  practitioner?: string
  practitioner_name?: string
  positive_count?: number
  result?: 'Positive' | 'Negative'
  docstatus: number
  notes?: string
  inpatient_admission?: string
  patient_visit?: string
}

export interface ADHDAssessmentDetail extends ADHDAssessmentRow {
  responses: ADHDResponseRow[]
}

export interface ADHDAssessmentListFilters {
  dateFrom?: string
  dateTo?: string
  practitioner?: string
}

export interface CreateADHDAssessmentInput {
  patient: string
  assessment_date: string
  template: string
  notes?: string
  practitioner?: string
  inpatient_admission?: string
  patient_visit?: string
  responses: ADHDResponseRow[]
}

// ── Fetch templates list ──────────────────────────────────────────────────────
export interface ADHDTemplateListItem {
  name: string
  label: string
  description?: string
  footer_description?: string
  default?: boolean
}

export async function fetchADHDTemplates(
  search?: string
): Promise<ADHDTemplateListItem[]> {
  const params = new URLSearchParams()
  if (search?.trim()) params.append('search', search.trim())

  const res = await fetch(
    `/api/method/healthcare.api.adhd.get_adhd_assessment_templates?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load ADHD templates')
  }
  return data?.message || []
}

export async function fetchDefaultADHDTemplate(): Promise<ADHDTemplateListItem | null> {
  const res = await fetch(
    '/api/method/healthcare.api.adhd.get_default_adhd_assessment_template'
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load default ADHD template')
  }
  return data?.message || null
}

// ── Fetch template questions ──────────────────────────────────────────────────

// ── Fetch template questions (with description and footer_description) ────────
export async function fetchADHDTemplateQuestions(
  templateName: string
): Promise<ADHDTemplateData> {
  const params = new URLSearchParams({ template_name: templateName })
  const res = await fetch(
    `/api/method/healthcare.api.adhd.get_adhd_template_questions?${params}`
  )
  const data = await res.json()
  const msg = data?.message

  if (msg && Array.isArray(msg.questions)) {
    return {
      name: msg.name,
      template_name: msg.template_name,
      description: msg.description,
      footer_description: msg.footer_description,
      questions: msg.questions,
    }
  }
  
  return { 
    name: templateName, 
    template_name: templateName, 
    description: undefined,
    footer_description: undefined,
    questions: [] 
  }
}

// ── Fetch assessment list ─────────────────────────────────────────────────────
// services/adhdAssessment.ts

export async function fetchADHDAssessments(
  patient?: string,
  filters: ADHDAssessmentListFilters = {}
): Promise<ADHDAssessmentRow[]> {
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  if (filters.practitioner) params.append('practitioner', filters.practitioner)
  if (filters.dateFrom) params.append('date_from', filters.dateFrom)
  if (filters.dateTo) params.append('date_to', filters.dateTo)

  const res = await fetch(
    `/api/method/healthcare.api.adhd.get_adhd_assessments?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load ADHD assessments')
  }
  return data?.message || []
}

export async function fetchADHDAssessment(name: string): Promise<ADHDAssessmentDetail> {
  const params = new URLSearchParams({ name })
  const res = await fetch(
    `/api/method/healthcare.api.adhd.get_adhd_assessment?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load ADHD assessment')
  }
  return data?.message as ADHDAssessmentDetail
}

// ── Create assessment ─────────────────────────────────────────────────────────
export async function createADHDAssessment(
  input: CreateADHDAssessmentInput
): Promise<{ success: boolean; name?: string; message?: string }> {
  const res = await fetch(
    '/api/method/healthcare.api.adhd.create_adhd_assessment',
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