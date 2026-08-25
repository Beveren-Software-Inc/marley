import { apiRequest } from './apiClient'
import type { MedicationOrderRow } from './prescriptions'

export interface CreateMedicineGivenData {
  admission: string
  medication_order: string
  order_entry?: string
  unit?: string
  allow_override?: boolean
  override_reason?: string
  item_code?: string
  dose?: string
  qty?: number | string
  date?: string
  time?: string
  frequency?: number
  dose_notes?: string
  /** Set to true when recording a PRN (as-needed) administration */
  is_prn?: boolean
  batch_no?: string
  lot_no?: string
  dispensing_lot?: string
}

export interface MedicineGivenDoseValidationPreview {
  ok: boolean
  has_limit?: boolean
  weight_based?: boolean
  requires_weight?: boolean
  patient_weight?: number | null
  rate_per_kg?: number | null
  limit_raw?: string | null
  ceiling?: number | null
  single_dose_ceiling?: number | null
  daily_dose_ceiling?: number | null
  entered_dose?: number | null
  parsed_dose?: number | null
  maximum_dose_limit?: number | null
  max_dose_per_single_dose?: number | null
  max_dose_per_day?: number | null
  exceeds_single_dose?: boolean
  exceeds_cumulative_24h?: boolean
  prior_24h_dose?: number
  cumulative_24h_with_new_dose?: number
  message?: string
}

/** Extract numeric dose from values like `50`, `50mg`, or `50 ml`. */
export function extractDoseNumeric(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value).trim()
  if (!text) return null
  const direct = Number(text)
  if (!Number.isNaN(direct)) return direct
  const match = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

export async function previewMedicineGivenDoseValidation(args: {
  admission: string
  medicine_code: string
  dose: string
  date?: string
  time?: string
  route_of_administration?: string
  order_entry?: string
  medication_order?: string
}): Promise<MedicineGivenDoseValidationPreview> {
  return apiRequest<MedicineGivenDoseValidationPreview>(
    '/api/method/healthcare.api.medicine_given.preview_medicine_given_dose_validation',
    {
      method: 'POST',
      body: JSON.stringify(args),
    }
  )
}

export interface CreateMedicineGivenResponse {
  admission_detail: string
  row_name: string
}

export async function createMedicineGiven(
  data: CreateMedicineGivenData
): Promise<CreateMedicineGivenResponse> {
  return apiRequest<CreateMedicineGivenResponse>(
    '/api/method/healthcare.api.medicine_given.create_medicine_given',
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  )
}

export interface MedicineGivenRow {
  name: string
  date?: string
  time?: string
  medicine_code?: string
  medicine_name?: string
  medication_order?: string
  medicine_given_timing?: string
  dose?: string
  qty?: number
  unit?: string
  frequency?: number
  dose_notes?: string
  user?: string
  modified?: string
  is_prn?: number | boolean
  prescription_type?: string
  sales_order?: string
  delivery_note?: string
  batch_no?: string
  batch_id?: string
  lot_no?: string
  dispensing_lot?: string
  override_exceeded_frequency?: number | boolean
  override_exceeded_dose_limit?: number | boolean
  override_exceeded_cumulative_24h?: number | boolean
  override_reason?: string
  override_user?: string
  override_timestamp?: string
  old_medicine_code?: string
  old_medicine_name?: string
  ip_admission_medicine?: string
  ip_admission_medicine_sheet?: string
  patient_medication_order?: string
}

export interface MedicineGivenDispensingLotOption {
  name: string
  serial_no?: string
  remaining_qty?: number
  initial_qty?: number
  uom?: string
  stock_uom?: string
  batch_no?: string
  label?: string
}

export interface MedicineGivenBatchOption {
  batch_id: string
  batch_name: string
  qty: number
  expiry_date?: string
  manufacturing_date?: string
}

export interface MedicineGivenStockOptions {
  warehouse: string
  has_batch_no: boolean
  has_serial_no: boolean
  requires_dispensing_lot: boolean
  batches: MedicineGivenBatchOption[]
  dispensing_lots: MedicineGivenDispensingLotOption[]
}

export interface MedicineGivenLotOption {
  lot_no: string
  qty?: number
}

export async function fetchMedicineGivenStockOptions(
  admission: string,
  itemCode: string,
  warehouse?: string
): Promise<MedicineGivenStockOptions> {
  const params = new URLSearchParams()
  params.append('admission', admission)
  params.append('item_code', itemCode)
  if (warehouse) params.append('warehouse', warehouse)
  const res = await fetch(
    `/api/method/healthcare.api.medicine_given.get_medicine_given_stock_options?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc || !res.ok) {
    throw new Error(data?.exc || data?.message || 'Failed to load batch options')
  }
  const msg = (data?.message || {}) as MedicineGivenStockOptions
  return {
    warehouse: msg.warehouse || '',
    has_batch_no: Boolean(msg.has_batch_no),
    has_serial_no: Boolean(msg.has_serial_no),
    requires_dispensing_lot: Boolean(msg.requires_dispensing_lot),
    batches: Array.isArray(msg.batches) ? msg.batches : [],
    dispensing_lots: Array.isArray(msg.dispensing_lots) ? msg.dispensing_lots : [],
  }
}

export async function fetchMedicineGivenDispensingLots(
  admission: string,
  itemCode: string,
  batchNo?: string,
  warehouse?: string
): Promise<MedicineGivenDispensingLotOption[]> {
  const params = new URLSearchParams()
  params.append('admission', admission)
  params.append('item_code', itemCode)
  if (batchNo) params.append('batch_no', batchNo)
  if (warehouse) params.append('warehouse', warehouse)
  const res = await fetch(
    `/api/method/healthcare.api.medicine_given.get_medicine_given_dispensing_lots?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc || !res.ok) {
    throw new Error(data?.exc || data?.message || 'Failed to load dispensing lots')
  }
  return Array.isArray(data?.message) ? (data.message as MedicineGivenDispensingLotOption[]) : []
}

export async function fetchMedicineGivenLots(
  batchNo: string,
  admission: string
): Promise<MedicineGivenLotOption[]> {
  const params = new URLSearchParams()
  params.append('batch_no', batchNo)
  params.append('admission', admission)
  const res = await fetch(
    `/api/method/healthcare.api.medicine_given.get_medicine_given_lots?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc || !res.ok) {
    throw new Error(data?.exc || data?.message || 'Failed to load lots')
  }
  return Array.isArray(data?.message) ? (data.message as MedicineGivenLotOption[]) : []
}

export async function fetchMedicineGivenItemLots(
  admission: string,
  itemCode: string
): Promise<string[]> {
  const params = new URLSearchParams()
  params.append('admission', admission)
  params.append('item_code', itemCode)
  const res = await fetch(
    `/api/method/healthcare.api.medicine_given.get_medicine_given_item_lots?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc || !res.ok) {
    throw new Error(data?.exc || data?.message || 'Failed to load lots')
  }
  return Array.isArray(data?.message) ? (data.message as string[]) : []
}

export interface MissedMedicineRow {
  name: string
  date?: string
  time?: string
  medicine_code?: string
  medicine_name?: string
  medication_order?: string
  qty?: number
  unit?: string
  medicine_given_timing?: string
  dose_notes?: string
  user?: string
  old_medicine_code?: string
  old_medicine_name?: string
  ip_admission_medicine?: string
  ip_admission_medicine_sheet?: string
  patient_medication_order?: string
  modified?: string
}

export async function fetchMedicineGiven(
  admission: string,
  limit: number = 50,
  offset: number = 0
): Promise<MedicineGivenRow[]> {
  const params = new URLSearchParams()
  params.append('admission', admission)
  params.append('limit', String(limit))
  params.append('offset', String(offset))

  const response = await fetch(
    `/api/method/healthcare.api.medicine_given.get_medicine_given?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as MedicineGivenRow[]
  }

  if (resData?.exc || !response.ok) {
    throw new Error(resData.exc || resData.message || 'Failed to load given medicines')
  }

  return []
}

export interface UpdateMedicineGivenData {
  name: string
  unit?: string
  allow_override?: boolean
  override_reason?: string
  dose?: string
  qty?: number | string
  date?: string
  time?: string
  dose_notes?: string
  batch_no?: string
  lot_no?: string
  dispensing_lot?: string
}

export async function updateMedicineGiven(
  data: UpdateMedicineGivenData
): Promise<{ admission_detail: string; row_name: string }> {
  return apiRequest('/api/method/healthcare.api.medicine_given.update_medicine_given', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function deleteMedicineGiven(name: string): Promise<void> {
  await apiRequest(
    '/api/method/healthcare.api.medicine_given.delete_medicine_given',
    {
      method: 'POST',
      body: JSON.stringify({ name }),
    }
  )
}

export async function fetchMissedMedicine(
  admission: string,
  limit: number = 50,
  offset: number = 0
): Promise<MissedMedicineRow[]> {
  const params = new URLSearchParams()
  params.append('admission', admission)
  params.append('limit', String(limit))
  params.append('offset', String(offset))

  const response = await fetch(
    `/api/method/healthcare.api.medicine_given.get_missed_medicine?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as MissedMedicineRow[]
  }

  if (resData?.exc || !response.ok) {
    throw new Error(resData.exc || resData.message || 'Failed to load missed medicines')
  }

  return []
}

export async function convertMissedMedicineToGiven(
  name: string,
  givenLateReason?: string
): Promise<{ admission_detail: string; given_row_name: string; removed_missed_row_name: string }> {
  return apiRequest('/api/method/healthcare.api.medicine_given.convert_missed_medicine_to_given', {
    method: 'POST',
    body: JSON.stringify({
      name,
      given_late_reason: givenLateReason || '',
    }),
  })
}

export async function createMedicineGivenSalesOrder(
  admission: string,
  consumptionDate?: string
): Promise<{
  sales_order: string
  status: string
  delivery_note?: string
  delivery_note_status?: string
  cost_center?: string
  linked_rows?: number
}> {
  return apiRequest('/api/method/healthcare.api.nursing_inventory.create_daily_medicine_sales_order', {
    method: 'POST',
    body: JSON.stringify({
      admission,
      consumption_date: consumptionDate,
    }),
  })
}

export async function checkMissedMedicineNow(
  admission: string,
  graceMinutes: number = 60
): Promise<{ admission: string; created_rows: number }> {
  return apiRequest('/api/method/healthcare.api.medicine_given.check_missed_medicine_now', {
    method: 'POST',
    body: JSON.stringify({
      admission,
      grace_minutes: graceMinutes,
    }),
  })
}

export interface ReconcileResponse {
  stock_entry: string | null
  items: { item_code: string; qty: number }[]
}

export interface MedicationChartSession {
  id: string
  label: string
  order: number
}

export interface MedicationChartSlot {
  session_id: string
  due: boolean
  given: boolean
  given_time?: string | null
  given_by?: string | null
}

export interface MedicationChartRow {
  order_entry: string
  prescription: string
  drug: string
  drug_name?: string
  dosage?: string
  dosage_form?: string
  patient_frequency?: string
  instructions?: string
  is_prn?: 0 | 1
  slots: MedicationChartSlot[]
}

export interface MedicationChartResponse {
  sessions: MedicationChartSession[]
  rows: MedicationChartRow[]
  /** Same session-slot shape as rows; shown in a separate PRN section */
  prn_rows?: MedicationChartRow[]
}

export async function fetchDailyMedicationChart(
  admission: string,
  date: string
): Promise<MedicationChartResponse> {
  const params = new URLSearchParams()
  params.append('admission', admission)
  params.append('date', date)

  const res = await fetch(
    `/api/method/healthcare.api.medication_chart.get_daily_medication_chart?${params.toString()}`
  )
  const data = await res.json()

  if (data?.exc || !res.ok) {
    throw new Error(data?.exc || data?.message || 'Failed to load medication chart')
  }

  const message = (data?.message || data?.data) as MedicationChartResponse | undefined
  return (
    message || {
      sessions: [],
      rows: [],
      prn_rows: [],
    }
  )
}

export interface MedicationSheetRow extends MedicineGivenRow {}

export interface MedicationSheetAdminRow {
  kind: 'given' | 'missed'
  name: string
  date?: string | null
  time?: string | null
  given: boolean
  qty?: number
  unit?: string
  given_by?: string
  given_by_name?: string
  remarks?: string
  timing_label?: string | null
}

export interface MedicationSheetMedicineRow {
  order_entry: string
  prescription: string
  drug: string
  drug_name: string
  dosage?: string
  uom?: string | null
  dosage_form?: string
  patient_frequency?: string
  medication_type?: string
  is_pink?: number
  route_of_administration?: string
  start_date?: string | null
  end_date?: string | null
  administrations: MedicationSheetAdminRow[]
}

export interface MedicationSheetDetail {
  admission: string
  patient?: string
  patient_name?: string
  /** Primary (latest) current Patient Medication Order for this admission. */
  prescription?: string | null
  /** All current signed/active prescriptions whose medicines are included. */
  prescriptions?: string[]
  from_date?: string | null
  to_date?: string | null
  medicines: MedicationSheetMedicineRow[]
}

export async function fetchMedicationSheetDetail(
  admission: string,
  fromDate?: string,
  toDate?: string
): Promise<MedicationSheetDetail> {
  const params = new URLSearchParams()
  params.append('admission', admission)
  if (fromDate) params.append('from_date', fromDate)
  if (toDate) params.append('to_date', toDate)

  const res = await fetch(
    `/api/method/healthcare.api.medication_chart.get_medication_sheet_detail?${params.toString()}`
  )
  const data = await res.json()

  if (data?.exc || !res.ok) {
    throw new Error(data?.exc || data?.message || 'Failed to load medication sheet')
  }

  const message = (data?.message || data?.data) as MedicationSheetDetail | undefined
  return (
    message || {
      admission,
      medicines: [],
    }
  )
}

export async function fetchMedicationSheet(
  admission: string,
  fromDate?: string,
  toDate?: string
): Promise<MedicationSheetRow[]> {
  const params = new URLSearchParams()
  params.append('admission', admission)
  if (fromDate) params.append('from_date', fromDate)
  if (toDate) params.append('to_date', toDate)

  const res = await fetch(
    `/api/method/healthcare.api.medication_chart.get_medication_sheet?${params.toString()}`
  )
  const data = await res.json()

  if (data?.exc || !res.ok) {
    throw new Error(data?.exc || data?.message || 'Failed to load medication sheet')
  }

  const message = (data?.message || data?.data) as MedicationSheetRow[] | undefined
  return message || []
}

export async function reconcileDischargeMedicines(
  admission: string
): Promise<ReconcileResponse> {
  const params = new URLSearchParams()
  params.append('admission', admission)

  const res = await fetch(
    `/api/method/healthcare.api.medicine_given.reconcile_discharge_medicines?${params.toString()}`
  )
  const data = await res.json()

  if (data?.exc || !res.ok) {
    throw new Error(data?.exc || data?.message || 'Failed to reconcile medicines')
  }

  return (data?.message as ReconcileResponse) || { stock_entry: null, items: [] }
}

/** Rows for medicine reconciliation on discharge (medicines not yet given, with remaining qty). */
export interface DischargeReconciliationRow {
  name: string
  parent: string
  drug: string
  drug_name?: string
  quantity: number
  remaining: number
  /** Set when user marked as stopped; reason is saved on prescription child table. */
  reason_stopped?: string
  /** Set when a stock entry has been created for this stopped item. */
  returned_to_store?: boolean
}

export async function getDischargeReconciliationRows(
  admission: string
): Promise<DischargeReconciliationRow[]> {
  const params = new URLSearchParams()
  params.set('admission', admission)
  const res = await fetch(
    `/api/method/healthcare.api.medicine_given.get_discharge_reconciliation_rows?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc || !res.ok) {
    throw new Error(data?.exc || data?.message || 'Failed to load reconciliation rows')
  }
  return Array.isArray(data?.message) ? (data.message as DischargeReconciliationRow[]) : []
}

/** Rows for medicine transfer on discharge (all prescribed entries, not based on given qty). */
export interface DischargeTransferRow {
  name: string
  parent: string
  drug: string
  drug_name?: string
  quantity: number
  reason_stopped?: string
  dosage?: string
  no_of_days?: number
  dosage_form?: string
  instructions?: string
  date?: string
  time?: string
  patient_frequency?: string
  written_frequency?: string
  is_pink?: boolean
  reference_no?: string
  route_of_administration?: string
  is_long_acting_medicine?: boolean
  long_acting_frequency?: string
  end_date?: string
  medication_type?: string
  old_medicine_code?: string
  old_medicine_name?: string
  medication?: string
  medicine_no?: string
  strength?: string
}

export interface DischargePrescriptionMedication {
  name?: string
  prescription?: string
  drug?: string
  drug_name: string
  dosage?: string
  frequency?: string
  start_date?: string | null
  reason_stopped?: string
  patient_visit?: string
  transferred_to_visit?: string
  is_legacy?: number | boolean
  old_medicine_code?: string
  old_medicine_name?: string
  medication?: string
  medicine_no?: string
  mapped_drug?: string
  mapped_drug_name?: string
}

export interface DischargePrescriptionSections {
  current_medications: DischargePrescriptionMedication[]
  discharged_medications: DischargePrescriptionMedication[]
  stopped_medications: DischargePrescriptionMedication[]
}

export async function getDischargePrescriptionSections(
  admission: string
): Promise<DischargePrescriptionSections> {
  const params = new URLSearchParams()
  params.append('admission', admission)
  const res = await fetch(
    `/api/method/healthcare.api.medicine_given.get_discharge_prescription_sections?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc || !res.ok) {
    throw new Error(data?.exc || data?.message || 'Failed to load prescription sections')
  }
  const message = (data?.message || {}) as DischargePrescriptionSections
  return {
    current_medications: message.current_medications || [],
    discharged_medications: message.discharged_medications || [],
    stopped_medications: message.stopped_medications || [],
  }
}

export async function getDischargeTransferRows(
  admission: string
): Promise<DischargeTransferRow[]> {
  const params = new URLSearchParams()
  params.set('admission', admission)
  const res = await fetch(
    `/api/method/healthcare.api.medicine_given.get_discharge_transfer_rows?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc || !res.ok) {
    throw new Error(data?.exc || data?.message || 'Failed to load transfer rows')
  }
  return Array.isArray(data?.message) ? (data.message as DischargeTransferRow[]) : []
}

/** Saves reason_stopped on the prescription child table only. Use returnStoppedMedicationsToStore to create the stock entry. */
export async function stopMedicationOnDischarge(
  admission: string,
  orderEntryName: string,
  reasonStopped: string
): Promise<{ message?: string }> {
  return apiRequest('/api/method/healthcare.api.medicine_given.stop_medication_on_discharge', {
    method: 'POST',
    body: JSON.stringify({
      admission,
      order_entry_name: orderEntryName,
      reason_stopped: reasonStopped ?? '',
    }),
  })
}

/** Creates one stock entry (Material Receipt) for the given medications. Each must have reason_stopped set. */
export async function returnStoppedMedicationsToStore(
  admission: string,
  orderEntryNames: string[]
): Promise<{ stock_entry: string | null; items?: { item_code: string; qty: number }[]; message?: string }> {
  return apiRequest('/api/method/healthcare.api.medicine_given.return_stopped_medications_to_store', {
    method: 'POST',
    body: JSON.stringify({ admission, order_entry_names: orderEntryNames }),
  })
}

export async function transferMedicationsOnDischarge(
  admission: string,
  orderEntryNames: string[]
): Promise<{ patient_visit: string; patient_medication_order: string }> {
  return apiRequest('/api/method/healthcare.api.medicine_given.transfer_medications_on_discharge', {
    method: 'POST',
    body: JSON.stringify({
      admission,
      order_entry_names: orderEntryNames,
    }),
  })
}

export async function createVisitAndPrescriptionOnDischarge(
  admission: string,
  medicationOrders: MedicationOrderRow[],
  patientEncounter?: string,
  afterDischarge?: boolean,
  doctorsSignature?: string,
  orderEntryNames?: string[],
): Promise<{ patient_visit: string; patient_medication_order: string }> {
  return apiRequest('/api/method/healthcare.api.medicine_given.create_visit_and_prescription_on_discharge', {
    method: 'POST',
    body: JSON.stringify({
      admission,
      medication_orders: medicationOrders,
      patient_encounter: patientEncounter,
      after_discharge: afterDischarge ?? false,
      doctors_signature: doctorsSignature || undefined,
      order_entry_names: orderEntryNames?.length ? orderEntryNames : undefined,
    }),
  })
}

// Long-acting medication reminders (Q1W, Q2W, Q3W, Q4W)
export type LongActingReminderStatus = 'overdue' | 'due_today' | 'due_soon'

export interface LongActingMedicationReminder {
  patient: string
  patient_name?: string
  admission: string
  prescription: string
  order_entry: string
  drug: string
  drug_name: string
  dosage?: string
  frequency: string
  last_given_date: string
  next_due_date: string
  status: LongActingReminderStatus
}

export async function fetchLongActingMedicationReminders(
  options?: { patient?: string; admission?: string; days_ahead?: number }
): Promise<LongActingMedicationReminder[]> {
  const params = new URLSearchParams()
  if (options?.patient) params.append('patient', options.patient)
  if (options?.admission) params.append('admission', options.admission)
  if (options?.days_ahead != null) params.append('days_ahead', String(options.days_ahead))

  const res = await fetch(
    `/api/method/healthcare.api.medication_chart.get_long_acting_medication_reminders?${params.toString()}`
  )
  const data = await res.json()
  console.log("nadai haoa", data)
  if (data?.exc || !res.ok) {
    throw new Error(data?.exc || data?.message || 'Failed to load long-acting medication reminders')
  }

  return (data?.message as LongActingMedicationReminder[]) || []
}


