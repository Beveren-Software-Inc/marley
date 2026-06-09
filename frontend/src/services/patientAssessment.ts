export interface PatientAssessmentRow {
  name: string
  patient: string
  patient_name: string | null
  assessment_template: string | null
  reference_type: string | null
  encounter: string | null
  healthcare_practitioner: string | null
  practitioner_name?: string | null
  assessment_datetime: string | null
  assessment_description: string | null
  total_score: number | null
  total_score_obtained: number | null
  docstatus: number
  creation: string
  modified?: string
  family_history?: string | null
  scale_min?: number | null
  scale_max?: number | null
}

export interface PatientAssessmentSheetLine {
  parameter: string
  parameter_label?: string
  score?: number | null
  time?: string | null
  comments?: string | null
  yes?: number | boolean | null
}

export type PatientAssessmentDoc = PatientAssessmentRow & {
  assessment_sheet?: PatientAssessmentSheetLine[]
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

export type PatientAssessmentListFilters = {
  assessmentTemplate?: string
  dateFrom?: string
  dateTo?: string
  practitioner?: string
}

export async function fetchPatientAssessments(
  patient?: string,
  page = 1,
  pageSize = 50,
  filters?: PatientAssessmentListFilters
): Promise<PatientAssessmentRow[]> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (patient) params.set('patient', patient)
  if (filters?.assessmentTemplate) params.set('assessment_template', filters.assessmentTemplate)
  if (filters?.dateFrom) params.set('date_from', filters.dateFrom)
  if (filters?.dateTo) params.set('date_to', filters.dateTo)
  if (filters?.practitioner) params.set('practitioner', filters.practitioner)

  const res = await fetch(
    `/api/method/healthcare.api.common.get_patient_assessments?${params}`
  )
  const data = await res.json()
  const msg = data?.message
  if (msg?.success) return msg.data as PatientAssessmentRow[]
  if (Array.isArray(msg)) return msg as PatientAssessmentRow[]
  return []
}

export async function fetchPatientAssessment(name: string): Promise<PatientAssessmentDoc> {
  if (!name) {
    throw new Error('Patient assessment name is required')
  }

  const res = await fetch(
    `/api/method/healthcare.api.common.get_patient_assessment?name=${encodeURIComponent(name)}`
  )
  const data = await res.json()

  if (!res.ok || data.exc) {
    const message =
      data?._error_message ||
      data?.message?.message ||
      data?.message ||
      'Failed to fetch patient assessment'
    throw new Error(typeof message === 'string' ? message : 'Failed to fetch patient assessment')
  }

  if (data?.message && typeof data.message === 'object') {
    return data.message as PatientAssessmentDoc
  }

  throw new Error('Invalid response format')
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

export async function fetchDefaultPatientAssessmentTemplate(): Promise<AssessmentTemplateOption | null> {
  const res = await fetch(
    '/api/method/healthcare.api.common.get_default_patient_assessment_template'
  )
  const data = await res.json()
  const msg = data?.message
  if (msg && typeof msg === 'object' && msg.name) {
    return { name: String(msg.name), label: String(msg.label || msg.name) }
  }
  return null
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
