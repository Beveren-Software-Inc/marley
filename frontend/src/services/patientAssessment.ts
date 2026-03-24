export interface PatientAssessmentRow {
  name: string
  patient: string
  patient_name: string | null
  assessment_template: string | null
  reference_type: string | null
  encounter: string | null
  healthcare_practitioner: string | null
  assessment_datetime: string | null
  assessment_description: string | null
  total_score: number | null
  total_score_obtained: number | null
  docstatus: number
  creation: string
}

export interface AssessmentSheetRow {
  parameter: string
  score: number
  time?: string
  comments?: string
}

export interface TemplateParameters {
  parameters: { parameter: string; parameter_label: string }[]
  scale_min: number
  scale_max: number
}

export interface CreatePatientAssessmentInput {
  patient: string
  patient_name?: string
  assessment_template?: string
  reference_type?: string
  encounter?: string
  healthcare_practitioner?: string
  assessment_datetime: string
  assessment_description?: string
  company?: string
  therapy_session?: string
  family_history?: string
  assessment_sheet?: AssessmentSheetRow[]
}

export interface AssessmentTemplateOption {
  name: string
  label: string
}

export async function fetchPatientAssessments(
  patient?: string,
  search?: string,
  page = 1,
  pageSize = 50
): Promise<PatientAssessmentRow[]> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (patient) params.set('patient', patient)
  if (search) params.set('search', search)

  const res = await fetch(
    `/api/method/healthcare.api.common.get_patient_assessments?${params}`
  )
  const data = await res.json()
  const msg = data?.message
  if (msg?.success) return msg.data as PatientAssessmentRow[]
  if (Array.isArray(msg)) return msg as PatientAssessmentRow[]
  return []
}

export async function createPatientAssessment(
  input: CreatePatientAssessmentInput
): Promise<{ success: boolean; name?: string; message?: string }> {
  const res = await fetch(
    '/api/method/healthcare.api.common.create_patient_assessment',
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

export async function fetchAssessmentTemplates(
  search?: string
): Promise<AssessmentTemplateOption[]> {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  const res = await fetch(
    `/api/method/healthcare.api.common.get_patient_assessment_templates?${params}`
  )
  const data = await res.json()
  const msg = data?.message
  if (Array.isArray(msg)) return msg as AssessmentTemplateOption[]
  return []
}

export async function fetchAssessmentParameters(
  search?: string
): Promise<AssessmentTemplateOption[]> {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  const res = await fetch(
    `/api/method/healthcare.api.common.get_assessment_parameters?${params}`
  )
  const data = await res.json()
  const msg = data?.message
  if (Array.isArray(msg)) return msg as AssessmentTemplateOption[]
  return []
}

export async function fetchTemplateParameters(
  templateName: string
): Promise<TemplateParameters> {
  const params = new URLSearchParams({ template_name: templateName })
  const res = await fetch(
    `/api/method/healthcare.api.common.get_assessment_template_parameters?${params}`
  )
  const data = await res.json()
  const msg = data?.message
  if (msg && Array.isArray(msg.parameters)) return msg as TemplateParameters
  return { parameters: [], scale_min: 0, scale_max: 100 }
}
