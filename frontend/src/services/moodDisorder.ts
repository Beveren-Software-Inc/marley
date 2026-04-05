// services/moodDisorder.ts

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
  patient_name: string
  assessment_date: string
  template: string
  q1_yes_count: number
  further_assessment: string
  docstatus: number
}

// ── Fetch templates list ──────────────────────────────────────────────────────
export async function fetchMoodDisorderTemplates(
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

  const res = await fetch(`/api/resource/Mood Disorder Template?${params}`)
  const data = await res.json()

  return (data?.data || []).map((t: any) => ({
    name: t.name,
    label: t.template_name || t.name,
    description: t.description,
  }))
}

// ── Fetch template questions ──────────────────────────────────────────────────
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
    questions: [] 
  }
}

// ── Create assessment ─────────────────────────────────────────────────────────
export interface CreateMoodDisorderAssessmentInput {
  patient: string
  assessment_date: string
  template: string
  description?: string
  responses: MoodDisorderResponseRow[]
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

// ── Fetch assessments list ────────────────────────────────────────────────────
export async function fetchMoodDisorderAssessments(
  patient?: string,
  search?: string
): Promise<MoodDisorderAssessmentRow[]> {
  const filters: any[] = []
  
  if (patient) filters.push(['patient', '=', patient])
  if (search) filters.push(['patient_name', 'like', `%${search}%`])

  const params = new URLSearchParams({
    fields: JSON.stringify([
      'name', 'patient', 'patient_name', 'assessment_date',
      'template', 'q1_yes_count', 'further_assessment', 'docstatus'
    ]),
    filters: JSON.stringify(filters),
    limit: '50',
    order_by: 'assessment_date desc',
  })

  const res = await fetch(`/api/resource/Mood Disorder Assessment?${params}`)
  const data = await res.json()

  if (data?.data) {
    return data.data
  }
  
  if (data?.message) {
    return data.message
  }
  
  return []
}