import { apiRequest } from './apiClient'
import type { MedicationOrderRow } from './prescriptions'

export interface CreateMedicineGivenData {
  admission: string
  medication_order: string
  order_entry?: string
  allow_override?: boolean
  override_reason?: string
  item_code?: string
  qty?: number
  date?: string
  time?: string
  frequency?: number
  dose_notes?: string
  /** Set to true when recording a PRN (as-needed) administration */
  is_prn?: boolean
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
  qty?: number
  unit?: string
  frequency?: number
  dose_notes?: string
  user?: string
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

export async function deleteMedicineGiven(name: string): Promise<void> {
  await apiRequest(
    '/api/method/healthcare.api.medicine_given.delete_medicine_given',
    {
      method: 'POST',
      body: JSON.stringify({ name }),
    }
  )
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
  slots: MedicationChartSlot[]
}

export interface MedicationChartResponse {
  sessions: MedicationChartSession[]
  rows: MedicationChartRow[]
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
    }
  )
}

export interface MedicationSheetRow extends MedicineGivenRow {}

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
  is_pink?: boolean
  reference_no?: string
  route_of_administration?: string
  is_long_acting_medicine?: boolean
  end_date?: string
  medication_type?: string
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
): Promise<{ patient_visit: string; patient_medication_order: string }> {
  return apiRequest('/api/method/healthcare.api.medicine_given.create_visit_and_prescription_on_discharge', {
    method: 'POST',
    body: JSON.stringify({
      admission,
      medication_orders: medicationOrders,
      patient_encounter: patientEncounter,
      after_discharge: afterDischarge ?? false,
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


