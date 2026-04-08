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
  search?: string,
  page = 1,
  pageSize = 50
): Promise<GroomingChartRow[]> {
  const params = new URLSearchParams({
    cmd: 'healthcare.api.common.get_grooming_charts',
    page: String(page),
    page_size: String(pageSize),
  })
  if (patient) params.set('patient', patient)
  if (search) params.set('search', search)

  const res = await fetch(`/api/method/healthcare.api.common.get_grooming_charts?${params}`)
  const data = await res.json()
  const msg = data?.message
  if (msg?.success) return msg.data as GroomingChartRow[]
  if (Array.isArray(msg)) return msg as GroomingChartRow[]
  return []
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
