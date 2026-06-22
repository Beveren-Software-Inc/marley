import { apiRequest } from './apiClient'

export interface DoctorMedicationPlanRow {
  name: string
  patient?: string
  posting_date?: string
  practitioner?: string
  medical_role?: string
  reference_doctype?: string
  reference_document?: string
  plan?: string
  recommendation?: string
  reception_note?: string
}

/** Full document from GET (includes fields not in list view). */
export type DoctorMedicationPlanDoc = DoctorMedicationPlanRow & {
  branch?: string
  reference_doc?: string
  reference_name?: string
}

export interface CreateDoctorMedicationPlanInput {
  patient: string
  medical_role?: string
  practitioner?: string
  posting_date?: string
  patient_visit: string
  plan?: string
  recommendation?: string
  reception_note?: string
}

export interface DoctorMedicationPlanListFilters {
  practitioner?: string
  fromDate?: string
  toDate?: string
}

export async function fetchDoctorMedicationPlans(
  limit = 50,
  offset = 0,
  patient?: string,
  referenceDoctype?: string,
  referenceDocument?: string,
  extraFilters?: DoctorMedicationPlanListFilters,
): Promise<DoctorMedicationPlanRow[]> {
  const filters: unknown[] = []
  if (patient) filters.push(['patient', '=', patient])
  if (referenceDoctype && referenceDocument) {
    filters.push(['reference_doctype', '=', referenceDoctype])
    filters.push(['reference_document', '=', referenceDocument])
  }
  if (extraFilters?.practitioner) filters.push(['practitioner', '=', extraFilters.practitioner])
  if (extraFilters?.fromDate) filters.push(['posting_date', '>=', extraFilters.fromDate])
  if (extraFilters?.toDate) filters.push(['posting_date', '<=', `${extraFilters.toDate} 23:59:59`])

  const params = new URLSearchParams()
  params.append(
    'fields',
    JSON.stringify([
      'name',
      'patient',
      'posting_date',
      'practitioner',
      'medical_role',
      'reference_doctype',
      'reference_document',
      'plan',
      'recommendation',
      'reception_note',
    ])
  )
  if (filters.length) params.append('filters', JSON.stringify(filters))
  params.append('limit_page_length', String(limit))
  params.append('limit_start', String(offset))
  params.append('order_by', 'modified desc')

  return apiRequest<DoctorMedicationPlanRow[]>(
    `/api/resource/Doctor%20Medication%20Plan?${params.toString()}`
  )
}

export async function createDoctorMedicationPlan(
  input: CreateDoctorMedicationPlanInput
): Promise<DoctorMedicationPlanRow> {
  const body: Record<string, unknown> = {
    doctype: 'Doctor Medication Plan',
    patient: input.patient,
    practitioner: input.practitioner || undefined,
    posting_date: input.posting_date || undefined,
    reference_doctype: 'Patient Visit',
    reference_document: input.patient_visit,
    plan: input.plan || undefined,
    recommendation: input.recommendation || undefined,
    reception_note: input.reception_note || undefined,
  }

  return apiRequest<DoctorMedicationPlanRow>('/api/resource/Doctor%20Medication%20Plan', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function fetchDoctorMedicationPlan(name: string): Promise<DoctorMedicationPlanDoc> {
  return apiRequest<DoctorMedicationPlanDoc>(
    `/api/resource/Doctor%20Medication%20Plan/${encodeURIComponent(name)}`
  )
}

export interface UpdateDoctorMedicationPlanInput {
  practitioner?: string
  medical_role?: string
  posting_date?: string
  plan?: string
  recommendation?: string
  reception_note?: string
  branch?: string
}

export async function updateDoctorMedicationPlan(
  name: string,
  data: UpdateDoctorMedicationPlanInput
): Promise<DoctorMedicationPlanDoc> {
  return apiRequest<DoctorMedicationPlanDoc>(
    `/api/resource/Doctor%20Medication%20Plan/${encodeURIComponent(name)}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    }
  )
}
