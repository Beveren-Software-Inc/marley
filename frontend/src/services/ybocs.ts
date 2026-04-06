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
  patient_name: string
  assessment_date: string
  template: string
  total_score: number
  total_obsessions: number
  total_compulsions: number
  docstatus: number
  notes?: string
}

// Response options
export const RESPONSE_OPTIONS = ['0', '1', '2', '3', '4'] as const
export type ResponseOption = typeof RESPONSE_OPTIONS[number]

// Score mapping (same as value since it's 0-4)
export const RESPONSE_SCORE: Record<ResponseOption, number> = {
  '0': 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
}

// ── Fetch templates list ──────────────────────────────────────────────────────
export async function fetchYBOCSTemplates(
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

  const res = await fetch(`/api/resource/YBOCS Template?${params}`)
  const data = await res.json()

  return (data?.data || []).map((t: any) => ({
    name: t.name,
    label: t.template_name || t.name,
    description: t.description,
  }))
}

// ── Fetch template questions ──────────────────────────────────────────────────
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
    questions: [] 
  }
}

// ── Create assessment ─────────────────────────────────────────────────────────
export interface CreateYBOCSAssessmentInput {
  patient: string
  assessment_date: string
  template: string
  notes?: string
  responses: YBOCSResponseRow[]
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

// ── Fetch assessments list ────────────────────────────────────────────────────
export async function fetchYBOCSAssessments(
  patient?: string,
  search?: string
): Promise<YBOCSAssessmentRow[]> {
  const filters: any[] = []
  
  if (patient) filters.push(['patient', '=', patient])
  if (search) filters.push(['patient_name', 'like', `%${search}%`])

  const params = new URLSearchParams({
    fields: JSON.stringify([
      'name', 'patient', 'patient_name', 'assessment_date',
      'template', 'total_score', 'total_obsessions', 'total_compulsions', 'docstatus', 'notes'
    ]),
    filters: JSON.stringify(filters),
    limit: '50',
    order_by: 'assessment_date desc',
  })

  const res = await fetch(`/api/resource/YBOCS Assessment?${params}`)
  const data = await res.json()

  if (data?.data) {
    return data.data
  }
  
  if (data?.message) {
    return data.message
  }
  
  return []
}