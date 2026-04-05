// services/depressionAssessment.ts

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
  response?: string // "0", "1", "2", "3"
  score: number
}

export interface DepressionAssessmentRow {
  name: string
  patient: string
  patient_name: string
  assessment_date: string
  template: string
  total_score: number
  level_of_depression: string
  docstatus: number
  notes?: string
}

// ── Fetch templates list ──────────────────────────────────────────────────────
export async function fetchDepressionTemplates(
  search?: string
): Promise<{ name: string; label: string; description?: string }[]> {
  const filters: any[] = []

  if (search) {
    filters.push(['template_name', 'like', `%${search}%`])
  }

  const params = new URLSearchParams({
    fields: JSON.stringify(['name', 'template_name', 'assessment_category', 'description']),
    filters: JSON.stringify(filters),
    limit: '20',
    order_by: 'template_name asc',
  })

  const res = await fetch(`/api/resource/Depression Assessment Template?${params}`)
  const data = await res.json()
  console.log("Okay where are you", data)
  return (data?.data || []).map((t: any) => ({
    name: t.name,
    label: t.template_name || t.name,
    description: t.description,
  }))
}

// ── Fetch template questions ──────────────────────────────────────────────────
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
    questions: [] 
  }
}

// ── Create assessment ─────────────────────────────────────────────────────────
export interface CreateDepressionAssessmentInput {
  patient: string
  assessment_date: string
  template: string
  notes?: string
  responses: DepressionResponseRow[]
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

// ── Fetch assessments list ────────────────────────────────────────────────────
export async function fetchDepressionAssessments(
  patient?: string,
  search?: string
): Promise<DepressionAssessmentRow[]> {
  const filters: any[] = []
  
  if (patient) filters.push(['patient', '=', patient])
  if (search) filters.push(['patient_name', 'like', `%${search}%`])

  const params = new URLSearchParams({
    fields: JSON.stringify([
      'name', 'patient', 'patient_name', 'assessment_date',
      'template', 'total_score', 'level_of_depression', 'docstatus'
    ]),
    filters: JSON.stringify(filters),
    limit: '50',
    order_by: 'assessment_date desc',
  })

  const res = await fetch(`/api/resource/Depression Assessment?${params}`)
  const data = await res.json()

  if (data?.data) {
    return data.data
  }
  
  if (data?.message) {
    return data.message
  }
  
  return []
}