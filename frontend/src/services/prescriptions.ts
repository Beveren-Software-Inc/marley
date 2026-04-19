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
  reference_doctype?: string
  reference_document_name?: string
  medication_orders?: MedicationOrderEntry[]
  creation?: string
  modified?: string
  modified_by?: string
  is_pink?: 0 | 1
 
}

export interface PrescriptionFilters {
  patient?: string
  status?: string
  search?: string
  practitioner?: string
  fromDate?: string
  toDate?: string
  careContext?: 'Patient Visit' | 'Inpatient Admission'
  /** Filter by specific Patient Visit (patient_encounter field) */
  patientEncounter?: string
  /** Filter by specific Inpatient Admission (inpatient_record field) */
  inpatientRecord?: string
}


// import { apiRequest } from './apiClient'

export interface InpatientPrescriptionRow {
  name: string
  drug: string
  drug_name?: string
  dosage: string
  dosage_form?: string
  frequency: string
  period?: string
  start_date?: string
  end_date?: string
  instructions?: string
  status: string
  care_context: 'Patient Visit' | 'Inpatient Admission'
  inpatient_record?: string
  patient_visit?: string
  practitioner?: string
  practitioner_name?: string
  created_at?: string
  modified_at?: string
  patient?: string
}

export interface InpatientPrescription {
  name: string
  patient: string
  patient_name: string
  care_context: 'Patient Visit' | 'Inpatient Admission'
  inpatient_record?: string
  patient_visit?: string
  status: string
  from_date: string
  to_date?: string
  medications: InpatientPrescriptionRow[]
  practitioner?: string
  practitioner_name?: string
  notes?: string
}

/**
 * Fetch all prescriptions for an inpatient admission
 */
export async function fetchInpatientPrescriptions(admission: string): Promise<InpatientPrescriptionRow[]> {
  if (!admission) {
    console.error('Admission ID is required')
    return []
  }

  try {
    const response = await fetch(
      `/api/method/healthcare.api.patient_medication_order.get_prescriptions_by_inpatient_record?inpatient_record=${encodeURIComponent(admission)}`
    )
    const result = await response.json()
    console.log('Fetch inpatient prescriptions response:', result)
    if (result.message && Array.isArray(result.message)) {
      return result.message as InpatientPrescriptionRow[]
    }
    
    return []
  } catch (error) {
    console.error('Failed to fetch inpatient prescriptions:', error)
    return []
  }
}

/**
 * Fetch a single prescription by ID
 */
export async function fetchPrescriptionById(name: string): Promise<InpatientPrescription | null> {
  if (!name) throw new Error('Prescription ID is required')

  try {
    const response = await fetch(
      `/api/method/healthcare.api.patient_medication_order.get_medication_order_by_id?name=${encodeURIComponent(name)}`
    )
    const resData = await response.json()

    if (resData?.message) {
      return resData.message as InpatientPrescription
    }

    if (resData?.exc_type) {
      throw new Error(resData?.message || 'Failed to fetch prescription')
    }

    return null
  } catch (error) {
    console.error('Failed to fetch prescription:', error)
    throw error
  }
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
  if (filters.patientEncounter) params.append('patient_encounter', filters.patientEncounter)
  if (filters.inpatientRecord) params.append('inpatient_record', filters.inpatientRecord)

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

export async function fetchPrescription(
  name: string
): Promise<Prescription | null> {
  if (!name) throw new Error('Prescription ID is required')

  const response = await fetch(
    `/api/method/healthcare.api.patient_medication_order.get_medication_order_by_id?name=${encodeURIComponent(name)}`
  )

  const resData = await response.json()

  if (resData?.message) {
    return resData.message as Prescription
  }

  if (resData?.exc_type) {
    throw new Error(resData?.message || 'Failed to fetch prescription')
  }

  return null
}

export async function fetchDischargeTransferPrescriptions(
  patient: string
): Promise<Prescription[]> {
  const params = new URLSearchParams()
  params.append('limit', '10')
  params.append('offset', '0')
  params.append('patient', patient)
  params.append('after_discharge', '1')  // Filter for after_discharge = true

  const response = await fetch(
    `/api/method/healthcare.api.patient_medication_order.get_medication_orders?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as Prescription[]
  }
  if (resData?.exc_type) {
    throw new Error(resData?.message || 'Failed to fetch discharge transfer prescriptions')
  }
  return []
}

export async function createPrescriptionSalesOrder(
  name: string
): Promise<{ sales_order: string; status: string }> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<{ sales_order: string; status: string }>(
    '/api/method/healthcare.api.patient_medication_order.create_sales_order_from_medication_order',
    {
      method: 'POST',
      body: JSON.stringify({ name }),
    }
  )
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
  after_discharge?: boolean
}

export type LongActingFrequency = 'Weekly' | 'Biweekly' | 'Monthly' | 'Every 2 Months' | 'Every 3 Months'

export const LONG_ACTING_FREQUENCY_OPTIONS: LongActingFrequency[] = [
  'Weekly',
  'Biweekly',
  'Monthly',
  'Every 2 Months',
  'Every 3 Months',
]

export interface MedicationOrderRow {
  drug: string
  drug_name?: string
  dosage: string
  no_of_days?: number
  dosage_form: string
  instructions?: string
  date: string
  end_date?: string
  time: string
  patient_frequency?: string
  is_pink?: boolean
  /** PRN (Pro Re Nata) — give only as needed */
  is_prn?: boolean
  reference_no?: string
  route_of_administration?: string
  /** When true, row is long-acting; show long_acting_frequency and create Long Acting Medicine on backend */
  is_long_acting?: boolean
  long_acting_frequency?: LongActingFrequency | string
  medication_type?: string
}

export interface MedicationOrderEntry {
  name: string
  drug: string
  drug_name?: string
  dosage: string
  dosage_form: string
  /** 1 if this is a PRN (as-needed) medication */
  is_prn?: 0 | 1
  medication_type?: string
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
  if (data.after_discharge) {
    body.after_discharge = true
  }
  if (data.medication_orders && data.medication_orders.length > 0) {
    body.medication_orders = data.medication_orders.map((row) => ({
      drug: row.drug,
      dosage: row.dosage,
      no_of_days: row.no_of_days,
      dosage_form: row.dosage_form,
      instructions: row.instructions,
      date: row.date,
      end_date: row.end_date,
      time: row.time,
      patient_frequency: row.patient_frequency,
      is_pink: row.is_pink,
      is_prn: row.is_prn ?? false,
      reference_no: row.reference_no,
      route_of_administration: row.route_of_administration,
      is_long_acting_medicine: row.is_long_acting ?? false,
      long_acting_frequency: row.is_long_acting ? (row.long_acting_frequency || 'Weekly') : undefined,
      medication_type: row.medication_type,
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

export async function fetchMedicationOrders(
  prescriptionName: string
): Promise<MedicationOrderEntry[]> {
  const response = await fetch(
    `/api/resource/Patient%20Medication%20Order/${encodeURIComponent(prescriptionName)}`
  )
  const resData = await response.json()

  const rows = resData?.data?.medication_orders
  if (Array.isArray(rows)) {
    return rows as MedicationOrderEntry[]
  }

  return []
}


export async function fetchPrescriptionByInpatientOrEncounter(
  inpatientRecordId?: string | null,
  patientEncounterId?: string | null
): Promise<Prescription | null> {
  if (!inpatientRecordId && !patientEncounterId) {
    throw new Error('Either Inpatient Record ID or Patient Encounter ID is required')
  }

  const params = new URLSearchParams()
  if (inpatientRecordId) params.append('inpatient_record', inpatientRecordId)
  if (patientEncounterId) params.append('patient_encounter', patientEncounterId)

  const response = await fetch(
    `/api/method/healthcare.api.patient_medication_order.get_medication_order_by_inpatient_or_encounter?${params.toString()}`
  )

  const resData = await response.json()

  if (resData?.message) {
    return resData.message as Prescription
  }

  if (resData?.exc_type) {
    throw new Error(resData?.message || 'Failed to fetch prescription')
  }

  return null
}

// Add this to your prescriptions service file
export async function updatePrescription(data: any): Promise<any> {
  const response = await fetch('/api/method/healthcare.api.patient_medication_order.update_medication_order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  const resData = await response.json()

  if (resData?.message) {
    return resData.message
  }

  if (resData?.exc_type) {
    throw new Error(resData?.message || 'Failed to update prescription')
  }

  throw new Error('Failed to update prescription')
}


export async function fetchAfterDischargePrescriptions(
  patient: string,
  admission?: string
): Promise<Prescription[]> {
  const params = new URLSearchParams()
  params.append('patient', patient)
  if (admission) params.append('admission', admission)
  
  const response = await fetch(
    `/api/method/healthcare.api.patient_medication_order.get_after_discharge_prescriptions?${params.toString()}`
  )
  const resData = await response.json()
  
  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as Prescription[]
  }
  return []
}