export interface GroomingChartRow {
  name: string
  date: string
  admission_no: string | null
  file_no: string | null
  patient_name: string | null
  cost_center: string | null
  // hygiene
  brush_teeth_morning: 0 | 1
  change_clothes_morning: 0 | 1
  brush_teeth_noon: 0 | 1
  change_clothes_noon: 0 | 1
  shower: 0 | 1
  bowel: 0 | 1
  bed_wetting: 0 | 1
  // meals
  breakfast: 0 | 1
  snack_1: 0 | 1
  lunch: 0 | 1
  snack_2: 0 | 1
  dinner: 0 | 1
  snack_3: 0 | 1
  // measurements
  weight: number | null
  lmp: string | null
  creation: string
  modified?: string
  owner?: string
}

export type GroomingChartDoc = GroomingChartRow

export type NursingListFilters = {
  dateFrom?: string
  dateTo?: string
  practitioner?: string
}

export interface CreateGroomingChartInput {
  date?: string
  admission_no?: string
  file_no?: string
  patient_name?: string
  cost_center?: string
  brush_teeth_morning?: 0 | 1
  change_clothes_morning?: 0 | 1
  brush_teeth_noon?: 0 | 1
  change_clothes_noon?: 0 | 1
  shower?: 0 | 1
  bowel?: 0 | 1
  bed_wetting?: 0 | 1
  breakfast?: 0 | 1
  snack_1?: 0 | 1
  lunch?: 0 | 1
  snack_2?: 0 | 1
  dinner?: 0 | 1
  snack_3?: 0 | 1
  weight?: number | null
  lmp?: string
  patient_visit?: string
  fluid_intake?: number | null
  fluid_output?: number | null
}

export async function fetchGroomingCharts(
  patient?: string,
  page = 1,
  pageSize = 50,
  filters?: NursingListFilters
): Promise<GroomingChartRow[]> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (patient) params.set('patient', patient)
  if (filters?.dateFrom) params.set('date_from', filters.dateFrom)
  if (filters?.dateTo) params.set('date_to', filters.dateTo)
  if (filters?.practitioner) params.set('practitioner', filters.practitioner)

  const res = await fetch(`/api/method/healthcare.api.common.get_grooming_charts?${params}`)
  const data = await res.json()
  const msg = data?.message
  if (msg?.success) return msg.data as GroomingChartRow[]
  if (Array.isArray(msg)) return msg as GroomingChartRow[]
  return []
}

export async function fetchGroomingChart(name: string): Promise<GroomingChartDoc> {
  const params = new URLSearchParams({ name })
  const res = await fetch(`/api/method/healthcare.api.common.get_grooming_chart?${params}`)
  const data = await res.json()
  if (data?.exception) throw new Error(data.message || 'Failed to load grooming chart')
  const msg = data?.message
  if (!msg || typeof msg !== 'object') throw new Error('Invalid response format')
  return msg as GroomingChartDoc
}

export async function createGroomingChart(
  input: CreateGroomingChartInput
): Promise<{ success: boolean; name?: string; message?: string }> {
  const res = await fetch('/api/method/healthcare.api.common.create_grooming_chart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': (window as any).csrf_token || '' },
    body: JSON.stringify({ data: JSON.stringify(input) }),
  })
  const data = await res.json()
  const msg = data?.message
  return msg ?? { success: false, message: 'Unknown error' }
}
