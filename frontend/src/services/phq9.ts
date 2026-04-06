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
  patient_name: string
  assessment_date: string
  template: string
  total_score: number
  severity: string
  docstatus: number
  notes?: string
}

// Response options mapping
export const RESPONSE_OPTIONS = [
  '0 - Not at all',
  '1 - Several days',
  '2 - More than half the days',
  '3 - Nearly every day'
] as const

export type ResponseOption = typeof RESPONSE_OPTIONS[number]

// Score mapping
export const RESPONSE_SCORE: Record<ResponseOption, number> = {
  '0 - Not at all': 0,
  '1 - Several days': 1,
  '2 - More than half the days': 2,
  '3 - Nearly every day': 3,
}

// ── Fetch templates list ──────────────────────────────────────────────────────
export async function fetchPHQ9Templates(
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

  const res = await fetch(`/api/resource/PHQ9 Template?${params}`)
  const data = await res.json()

  return (data?.data || []).map((t: any) => ({
    name: t.name,
    label: t.template_name || t.name,
    description: t.description,
  }))
}

// ── Fetch template questions ──────────────────────────────────────────────────
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
    questions: [] 
  }
}

// ── Create assessment ─────────────────────────────────────────────────────────
export interface CreatePHQ9AssessmentInput {
  patient: string
  assessment_date: string
  template: string
  notes?: string
  responses: PHQ9ResponseRow[]
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

// ── Fetch assessments list ────────────────────────────────────────────────────
export async function fetchPHQ9Assessments(
  patient?: string,
  search?: string
): Promise<PHQ9AssessmentRow[]> {
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

  const res = await fetch(`/api/resource/PHQ9 Assessment?${params}`)
  const data = await res.json()

  if (data?.data) {
    return data.data
  }
  
  if (data?.message) {
    return data.message
  }
  
  return []
}