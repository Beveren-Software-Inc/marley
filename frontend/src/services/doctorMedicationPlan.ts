import { apiRequest } from './apiClient'

export interface DoctorMedicationPlanRow {
  name: string
  patient?: string
  posting_date?: string
  practitioner?: string
  /** Resolved from Healthcare Practitioner by the list API. */
  practitioner_name?: string
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
  reference_doctype: 'Patient Visit' | 'Inpatient Admission'
  reference_document: string
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
  const params = new URLSearchParams()
  params.append('limit', String(limit))
  params.append('offset', String(offset))
  if (patient) params.append('patient', patient)
  if (referenceDoctype) params.append('reference_doctype', referenceDoctype)
  if (referenceDocument) params.append('reference_document', referenceDocument)
  if (extraFilters?.practitioner) params.append('practitioner', extraFilters.practitioner)
  if (extraFilters?.fromDate) params.append('from_date', extraFilters.fromDate)
  if (extraFilters?.toDate) params.append('to_date', `${extraFilters.toDate} 23:59:59`)

  return apiRequest<DoctorMedicationPlanRow[]>(
    `/api/method/healthcare.api.doctor_medication_plan.get_doctor_medication_plans?${params.toString()}`
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
    reference_doctype: input.reference_doctype,
    reference_document: input.reference_document,
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
