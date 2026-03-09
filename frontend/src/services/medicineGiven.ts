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


