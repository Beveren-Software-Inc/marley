export interface Prescription {
  name: string
  patient: string
  patient_name?: string
  care_context?: string
  patient_encounter?: string
  inpatient_record?: string
  practitioner?: string
  healthcare_practitioner_name?: string
  /** Legacy Oracle import: prescribing user when practitioner link is missing */
  user_name?: string
  posting_date?: string
  start_date?: string
  end_date?: string
  status?: string
  total_orders?: number
  completed_orders?: number
  company?: string
  cost_center?: string
  owner?: string
  owner_full_name?: string
  reference_doctype?: string
  reference_document_name?: string
  invoice?: string
  medication_orders?: MedicationOrderEntry[]
  source_prescription?: string
  nursing_pharmacy_giveout?: 0 | 1
  after_discharge?: 0 | 1
  creation?: string
  modified?: string
  modified_by?: string
  is_pink?: 0 | 1
  doctors_signature?: string
  new_system?: 0 | 1
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
  /** Attach URL from upload (maps to Patient Medication Order.doctors_signature). */
  doctors_signature?: string
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
  name?: string
  drug: string
  drug_name?: string
  /** Per-drug doctor action status: '' (active) | 'On Hold' | 'Discontinued' */
  medication_status?: string
  medication?: string
  old_medicine_code?: string
  old_medicine_name?: string
  medicine_no?: string
  written_frequency?: string
  dosage: string
  uom?: string
  no_of_days?: number
  dosage_form: string
  instructions?: string
  dose_notes?: string
  date: string
  end_date?: string
  time: string
  patient_frequency?: string
  is_pink?: boolean
  /** Required when is_pink is true */
  reference_no?: string
  /** PRN (Pro Re Nata) — give only as needed */
  is_prn?: boolean
  route_of_administration?: string
  /** When true, row is long-acting; show long_acting_frequency and create Long Acting Medicine on backend */
  is_long_acting?: boolean
  long_acting_frequency?: LongActingFrequency | string
  medication_type?: string
  quantity?: number
  qty?: number
  batch_no?: string
  dispensing_lot?: string
  lot_no?: string
  rate?: number
  amount?: number
}

export interface NursingPharmacyGiveOutResult {
  patient_medication_order: string
  sales_order: string
  sales_order_status: string
  delivery_note?: string
  delivery_note_status?: string
  pmo_status: string
  source_prescription?: string
  service_requests?: string[]
}

export interface MedicationOrderEntry {
  name: string
  drug: string
  drug_name?: string
  dosage: string
  uom?: string
  quantity?: number
  dosage_form: string
  route_of_administration?: string
  patient_frequency?: string
  /** Start date of this medication line */
  date?: string
  end_date?: string
  instructions?: string
  /** 1 if this is a PRN (as-needed) medication */
  is_prn?: 0 | 1
  is_pink?: 0 | 1 | boolean
  /** Required when is_pink is set */
  reference_no?: string
  /** Per-drug doctor action status: '' (active) | 'On Hold' | 'Discontinued' */
  medication_status?: string
  medication_type?: string
  qty?: number
  rate?: number
  amount?: number
  /** When set, this line is treated as stopped (no longer given) */
  reason_stopped?: string
  stopped_date?: string
  stop_by?: string
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
  if (data.doctors_signature) {
    body.doctors_signature = data.doctors_signature
  }
  if (data.medication_orders && data.medication_orders.length > 0) {
    body.medication_orders = data.medication_orders.map((row) => {
      const longFreq = row.is_long_acting ? (row.long_acting_frequency || row.patient_frequency || 'Weekly') : undefined
      return {
      drug: row.drug,
      dosage: row.dosage,
      uom: row.uom,
      no_of_days: row.no_of_days,
      dosage_form: row.dosage_form,
      instructions: row.instructions,
      date: row.date,
      end_date: row.end_date,
      time: row.time,
      patient_frequency: row.is_long_acting ? longFreq : row.patient_frequency,
      is_pink: row.is_pink,
      reference_no: row.reference_no || '',
      is_prn: row.is_prn ?? false,
      route_of_administration: row.route_of_administration,
      is_long_acting_medicine: row.is_long_acting ?? false,
      long_acting_frequency: longFreq,
      medication_type: row.medication_type,
    }})
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
  if (!prescriptionName) return []

  const response = await fetch(
    `/api/method/healthcare.api.patient_medication_order.get_medication_order_by_id?name=${encodeURIComponent(prescriptionName)}`
  )
  const resData = await response.json()

  if (resData?.exc_type) {
    throw new Error(resData?.message || 'Failed to fetch medication orders')
  }

  const rows = resData?.message?.medication_orders
  if (Array.isArray(rows)) {
    return rows as MedicationOrderEntry[]
  }

  return []
}


export type MedicationAction = 'Hold' | 'Continue' | 'Discontinue'

/** Doctor action to Hold / Continue / Discontinue a single prescribed drug. */
export async function setMedicationEntryStatus(
  order: string,
  entry: string,
  action: MedicationAction,
  reason?: string,
): Promise<{ entry: string; medication_status: string; action: string }> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest('/api/method/healthcare.api.patient_medication_order.set_medication_entry_status', {
    method: 'POST',
    body: JSON.stringify({ order, entry, action, reason: reason || undefined }),
  })
}

export interface MedicationStatusLogRow {
  name: string
  medication_entry?: string
  drug?: string
  drug_name?: string
  action: string
  new_status?: string
  reason?: string
  owner?: string
  creation?: string
}

/** Hold/Continue/Discontinue history for a prescription (optionally one drug row). */
export async function getMedicationStatusLog(
  order: string,
  entry?: string,
): Promise<MedicationStatusLogRow[]> {
  const params = new URLSearchParams({ order })
  if (entry) params.append('entry', entry)
  const res = await fetch(
    `/api/method/healthcare.api.patient_medication_order.get_medication_status_log?${params.toString()}`,
  )
  const data = await res.json()
  return Array.isArray(data?.message) ? (data.message as MedicationStatusLogRow[]) : []
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

export async function updatePrescription(data: any): Promise<any> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<any>(
    '/api/method/healthcare.api.patient_medication_order.update_medication_order',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  )
}

export async function signPrescription(
  name: string,
  doctorsSignature: string,
): Promise<{ name: string; status: string; doctors_signature?: string }> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<{ name: string; status: string; doctors_signature?: string }>(
    '/api/method/healthcare.api.patient_medication_order.sign_patient_medication_order',
    {
      method: 'POST',
      body: JSON.stringify({ name, doctors_signature: doctorsSignature }),
    },
  )
}

/** Set stop reason on one prescription line, or clear it (resume). */
export async function saveMedicationOrderEntryStopReason(
  patientMedicationOrder: string,
  orderEntryName: string,
  opts: { reasonStopped: string } | { clear: true }
): Promise<void> {
  const { apiRequest } = await import('./apiClient')
  const body: Record<string, unknown> = {
    patient_medication_order: patientMedicationOrder,
    order_entry_name: orderEntryName,
  }
  if ('clear' in opts && opts.clear) {
    body.clear = 1
  } else if ('reasonStopped' in opts) {
    body.reason_stopped = opts.reasonStopped
  }
  await apiRequest<{ ok?: boolean }>(
    '/api/method/healthcare.api.patient_medication_order.save_medication_order_entry_stop_reason',
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  )
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

/** Update a single medication order entry (child table row). */
export async function updateMedicationOrderEntry(
  patientMedicationOrder: string,
  orderEntryName: string,
  updates: Record<string, unknown>
): Promise<{ ok: boolean }> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<{ ok: boolean }>(
    '/api/method/healthcare.api.patient_medication_order.update_medication_order_entry',
    {
      method: 'POST',
      body: JSON.stringify({
        patient_medication_order: patientMedicationOrder,
        order_entry_name: orderEntryName,
        updates: JSON.stringify(updates),
      }),
    }
  )
}

/** Add a new medication order entry to an existing prescription. */
export async function addMedicationOrderEntry(
  patientMedicationOrder: string,
  entryData: Record<string, unknown>
): Promise<{ ok: boolean; entry: any }> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<{ ok: boolean; entry: any }>(
    '/api/method/healthcare.api.patient_medication_order.add_medication_order_entry',
    {
      method: 'POST',
      body: JSON.stringify({
        patient_medication_order: patientMedicationOrder,
        entry_data: JSON.stringify(entryData),
      }),
    }
  )
}

/** Check if any medicine has been given for a specific medication order entry. */
export async function checkMedicineGivenForEntry(
  patientMedicationOrder: string,
  orderEntryName: string
): Promise<{ has_given: boolean; count?: number }> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<{ has_given: boolean; count?: number }>(
    '/api/method/healthcare.api.patient_medication_order.check_medicine_given_for_entry',
    {
      method: 'POST',
      body: JSON.stringify({
        patient_medication_order: patientMedicationOrder,
        order_entry_name: orderEntryName,
      }),
    }
  )
}

/** Batch: get given/not-given status for all entries in a prescription. */
export async function getGivenStatusForPrescription(
  patientMedicationOrder: string
): Promise<Record<string, { has_given: boolean; count: number }>> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<Record<string, { has_given: boolean; count: number }>>(
    '/api/method/healthcare.api.patient_medication_order.get_given_status_for_prescription',
    {
      method: 'POST',
      body: JSON.stringify({
        patient_medication_order: patientMedicationOrder,
      }),
    }
  )
}

export interface PharmacyGiveOutServiceRow {
  item_code: string
  item_name?: string
  quantity?: number
  rate?: number
  uom?: string
  template_dn?: string
  template_dt?: string
}

/** Nursing pharmacy give-out: PMO + submitted Sales Order in one step (IP admission or OP visit). */
export async function createNursingPharmacyGiveOut(input: {
  patient: string
  inpatient_record?: string
  patient_visit?: string
  medication_orders: MedicationOrderRow[]
  services?: PharmacyGiveOutServiceRow[]
  source_prescription?: string
  practitioner?: string
  warehouse?: string
}): Promise<NursingPharmacyGiveOutResult> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<NursingPharmacyGiveOutResult>(
    '/api/method/healthcare.api.patient_medication_order.create_nursing_pharmacy_giveout',
    {
      method: 'POST',
      body: JSON.stringify({
        patient: input.patient,
        inpatient_record: input.inpatient_record || undefined,
        patient_visit: input.patient_visit || undefined,
        medication_orders: input.medication_orders,
        services: input.services?.length ? input.services : undefined,
        source_prescription: input.source_prescription || undefined,
        practitioner: input.practitioner || undefined,
        warehouse: input.warehouse || undefined,
      }),
    }
  )
}

export interface PrescriptionDrugStockCheck {
  warn: boolean
  level?: 'out_of_stock' | 'low_stock'
  message?: string
  item_code?: string
  item_name?: string
  actual_qty?: number
  minimum_qty?: number
  warehouse?: string | null
  scope?: string
  is_stock_item?: boolean
}

export async function checkPrescriptionDrugStock(
  itemCode: string,
  costCenter?: string,
  company?: string,
): Promise<PrescriptionDrugStockCheck> {
  const { apiRequest } = await import('./apiClient')
  const params = new URLSearchParams({ item_code: itemCode })
  if (costCenter) params.set('cost_center', costCenter)
  if (company) params.set('company', company)
  return apiRequest<PrescriptionDrugStockCheck>(
    `/api/method/healthcare.api.prescription_stock.check_prescription_drug_stock?${params.toString()}`,
  )
}