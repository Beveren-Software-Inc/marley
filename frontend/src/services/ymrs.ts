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
  patient_name: string
  assessment_date: string
  template: string
  total_score: number
  severity: string
  docstatus: number
  notes?: string
}

// ── Fetch templates list ──────────────────────────────────────────────────────
export async function fetchYMRSTemplates(
  search?: string
): Promise<{ name: string; label: string; description?: string }[]> {
  const filters: any[] = []

  if (search) {
    filters.push(['template_name', 'like', `%${search}%`])
  }

  const params = new URLSearchParams({
    fields: JSON.stringify(['name', 'template_name', 'description']),
    filters: JSON.stringify(filters),
    limit: '20',
    order_by: 'template_name asc',
  })

  const res = await fetch(`/api/resource/YMRS Template?${params}`)
  const data = await res.json()

  return (data?.data || []).map((t: any) => ({
    name: t.name,
    label: t.template_name || t.name,
    description: t.description,
  }))
}

// ── Fetch template questions ──────────────────────────────────────────────────
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
    questions: [] 
  }
}

// ── Create assessment ─────────────────────────────────────────────────────────
export interface CreateYMRSAssessmentInput {
  patient: string
  assessment_date: string
  template: string
  notes?: string
  responses: YMRSResponseRow[]
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

// ── Fetch assessments list ────────────────────────────────────────────────────
export async function fetchYMRSAssessments(
  patient?: string,
  search?: string
): Promise<YMRSAssessmentRow[]> {
  const filters: any[] = []
  
  if (patient) filters.push(['patient', '=', patient])
  if (search) filters.push(['patient_name', 'like', `%${search}%`])

  const params = new URLSearchParams({
    fields: JSON.stringify([
      'name', 'patient', 'patient_name', 'assessment_date',
      'template', 'total_score', 'severity', 'docstatus', 'notes'
    ]),
    filters: JSON.stringify(filters),
    limit: '50',
    order_by: 'assessment_date desc',
  })

  const res = await fetch(`/api/resource/YMRS Assessment?${params}`)
  const data = await res.json()

  if (data?.data) {
    return data.data
  }
  
  if (data?.message) {
    return data.message
  }
  
  return []
}