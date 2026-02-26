export interface Prescription {
  name: string
  patient: string
  patient_name?: string
  care_context?: string
  patient_encounter?: string
  inpatient_record?: string
  practitioner?: string
  healthcare_practitioner_name?: string
  posting_date?: string
  start_date?: string
  end_date?: string
  status?: string
  total_orders?: number
  completed_orders?: number
  company?: string
}

export interface PrescriptionFilters {
  patient?: string
  status?: string
  search?: string
  practitioner?: string
  fromDate?: string
  toDate?: string
  careContext?: 'Patient Visit' | 'Inpatient Admission'
}

export async function fetchPrescriptions(
  limit: number = 50,
  offset: number = 0,
  filters: PrescriptionFilters = {}
): Promise<Prescription[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (filters.patient) params.append('patient', filters.patient)
  if (filters.status) params.append('status', filters.status)
  if (filters.search) params.append('search', filters.search)
  if (filters.practitioner) params.append('practitioner', filters.practitioner)
  if (filters.fromDate) params.append('from_date', filters.fromDate)
  if (filters.toDate) params.append('to_date', filters.toDate)
  if (filters.careContext) params.append('care_context', filters.careContext)

  const response = await fetch(
    `/api/method/healthcare.api.patient_medication_order.get_medication_orders?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as Prescription[]
  }
  if (resData?.exc_type) {
    throw new Error(resData?.message || 'Failed to fetch prescriptions')
  }
  return []
}

export interface CreatePrescriptionData {
  patient: string
  care_context: 'Patient Visit' | 'Inpatient Admission'
  company: string
  start_date: string
  patient_encounter?: string
  inpatient_record?: string
  practitioner?: string
  medication_orders?: MedicationOrderRow[]
}

export interface MedicationOrderRow {
  drug: string
  drug_name?: string
  dosage: string
  no_of_days?: number
  dosage_form: string
  instructions?: string
  date: string
  time: string
  patient_frequency?: string
  is_pink?: boolean
  reference_no?: string
}

export async function createPrescription(
  data: CreatePrescriptionData
): Promise<{ name: string }> {
  const { apiRequest } = await import('./apiClient')
  const body: Record<string, unknown> = {
    patient: data.patient,
    care_context: data.care_context,
    company: data.company,
    start_date: data.start_date,
    patient_encounter: data.patient_encounter || undefined,
    inpatient_record: data.inpatient_record || undefined,
    practitioner: data.practitioner || undefined,
  }
  if (data.medication_orders && data.medication_orders.length > 0) {
    body.medication_orders = data.medication_orders.map((row) => ({
      drug: row.drug,
      dosage: row.dosage,
      no_of_days: row.no_of_days,
      dosage_form: row.dosage_form,
      instructions: row.instructions,
      date: row.date,
      time: row.time,
      patient_frequency: row.patient_frequency,
      is_pink: row.is_pink,
      reference_no: row.reference_no,
    }))
  }
  return apiRequest<{ name: string }>(
    '/api/method/healthcare.api.patient_medication_order.create_patient_medication_order',
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  )
}
