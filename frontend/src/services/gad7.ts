// services/gad7.ts

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
export async function fetchGAD7Templates(
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

  const res = await fetch(`/api/resource/GAD7 Template?${params}`)
  const data = await res.json()

  return (data?.data || []).map((t: any) => ({
    name: t.name,
    label: t.template_name || t.name,
    description: t.description,
  }))
}

// ── Fetch template questions ──────────────────────────────────────────────────
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
    questions: [] 
  }
}

// ── Create assessment ─────────────────────────────────────────────────────────
export interface CreateGAD7AssessmentInput {
  patient: string
  assessment_date: string
  template: string
  notes?: string
  responses: GAD7ResponseRow[]
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

// ── Fetch assessments list ────────────────────────────────────────────────────
export async function fetchGAD7Assessments(
  patient?: string,
  search?: string
): Promise<GAD7AssessmentRow[]> {
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

  const res = await fetch(`/api/resource/GAD7 Assessment?${params}`)
  const data = await res.json()

  if (data?.data) {
    return data.data
  }
  
  if (data?.message) {
    return data.message
  }
  
  return []
}