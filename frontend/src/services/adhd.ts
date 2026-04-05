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
  positive_count?: number
  result?: 'Positive' | 'Negative'
  docstatus: number
  notes?: string
}

export interface CreateADHDAssessmentInput {
  patient: string
  assessment_date: string
  template: string
  notes?: string
  responses: ADHDResponseRow[]
}

// ── Fetch templates list ──────────────────────────────────────────────────────
// ── Fetch templates list ──────────────────────────────────────────────────────
export async function fetchADHDTemplates(
  search?: string
): Promise<{ name: string; label: string; description?: string; footer_description?: string }[]> {
  const filters: any[] = []

  if (search) {
    filters.push(['template_name', 'like', `%${search}%`])
  }

  const params = new URLSearchParams({
    fields: JSON.stringify(['name', 'template_name', 'assessment_category', 'description', 'footer_description']),
    filters: JSON.stringify(filters),
    limit: '20',
    order_by: 'template_name asc',
  })

  const res = await fetch(`/api/resource/ADHD Assessment Template?${params}`)
  const data = await res.json()

  console.log('Fetched ADHD Templates:', data)

  return (data?.data || []).map((t: any) => ({
    name: t.name,
    label: t.template_name || t.name,
    description: t.description,
    footer_description: t.footer_description,
  }))
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
  
  console.log('Fetched template details:', msg) // Debug log
  
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
  search?: string
): Promise<ADHDAssessmentRow[]> {
  const filters: any[] = []
  
  if (patient) filters.push(['patient', '=', patient])
  if (search) filters.push(['patient_name', 'like', `%${search}%`])

  const params = new URLSearchParams({
    fields: JSON.stringify([
      'name', 'patient', 'patient_name', 'assessment_date',
      'template', 'positive_count', 'result', 'docstatus', 'notes'
    ]),
    filters: JSON.stringify(filters),
    limit: '50',
    order_by: 'assessment_date desc',
  })

  const res = await fetch(`/api/resource/ADHD Assessment?${params}`)
  const data = await res.json()

  console.log('Fetched ADHD Assessments:', data)
  
  // Handle the response format - Frappe returns data in data.message or data.data
  if (data?.data) {
    return data.data
  }
  
  if (data?.message) {
    return data.message
  }
  
  return []
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