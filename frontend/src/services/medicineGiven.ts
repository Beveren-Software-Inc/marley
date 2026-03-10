import { apiRequest } from './apiClient'

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


