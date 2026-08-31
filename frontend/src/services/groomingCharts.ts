export interface GroomingChartRow {
  name: string
  trans_num?: string | null
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
  hygiene_comment?: string | null
  // meals
  breakfast: 0 | 1
  snack_1: 0 | 1
  lunch: 0 | 1
  snack_2: 0 | 1
  dinner: 0 | 1
  snack_3: 0 | 1
  meal_comment?: string | null
  // measurements
  weight: number | null
  lmp: string | null
  creation: string
  modified?: string
  owner?: string
  patient_visit?: string | null
  fluid_intake?: number | null
  fluid_output?: number | null
}

export type GroomingChartDoc = GroomingChartRow

export type NursingListFilters = {
  dateFrom?: string
  dateTo?: string
  practitioner?: string
}

export interface CreateGroomingChartInput {
  trans_num?: string
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
  hygiene_comment?: string | null
  breakfast?: 0 | 1
  snack_1?: 0 | 1
  lunch?: 0 | 1
  snack_2?: 0 | 1
  dinner?: 0 | 1
  snack_3?: 0 | 1
  meal_comment?: string | null
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

export async function updateGroomingChart(
  input: CreateGroomingChartInput & { name: string }
): Promise<{ success: boolean; name?: string; message?: string }> {
  const res = await fetch('/api/method/healthcare.api.common.update_grooming_chart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': (window as any).csrf_token || '' },
    body: JSON.stringify({ data: JSON.stringify(input) }),
  })
  const data = await res.json()
  const msg = data?.message
  return msg ?? { success: false, message: 'Unknown error' }
}

export async function fetchGroomingPatternHtml(opts: {
  name?: string
  patient?: string
  dateFrom?: string
  dateTo?: string
}): Promise<string> {
  const params = new URLSearchParams()
  if (opts.name) params.set('name', opts.name)
  if (opts.patient) params.set('patient', opts.patient)
  if (opts.dateFrom) params.set('date_from', opts.dateFrom)
  if (opts.dateTo) params.set('date_to', opts.dateTo)
  const res = await fetch(
    `/api/method/healthcare.api.grooming_chart_print.get_grooming_pattern_html?${params}`,
    { credentials: 'include' }
  )
  const data = await res.json()
  if (data?.exception) {
    let message = 'Failed to build grooming PDF'
    try {
      const raw = data._server_messages
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      const first = Array.isArray(parsed) ? parsed[0] : parsed
      const obj = typeof first === 'string' ? JSON.parse(first) : first
      if (obj?.message) message = String(obj.message)
    } catch {
      if (typeof data.message === 'string' && data.message.trim()) message = data.message
    }
    throw new Error(message)
  }
  const msg = data?.message
  if (typeof msg === 'string' && msg.trim()) return msg
  if (msg && typeof msg === 'object' && typeof (msg as { html?: string }).html === 'string') {
    return (msg as { html: string }).html
  }
  throw new Error('Invalid grooming PDF response')
}

export async function getNextIPGroomingChartTransNum(): Promise<string> {
  const { apiRequest } = await import('./apiClient')
  const result = await apiRequest<string>(
    '/api/method/healthcare.api.common.get_next_ip_grooming_chart_trans_num',
    { method: 'POST' },
  )
  if (typeof result === 'string' && result.trim()) {
    return result.trim()
  }
  throw new Error('Failed to generate grooming chart trans number')
}
