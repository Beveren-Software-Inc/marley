import { apiRequest } from './apiClient'

export interface SleepingPattern {
  name: string
  date: string
  admission_no: string
  file_no?: string
  patient_name?: string
  branch?: string
}

export async function fetchSleepingPatterns(
  limit: number = 50,
  offset: number = 0,
  patient?: string
): Promise<SleepingPattern[]> {
  const params = new URLSearchParams()
  params.append('fields', JSON.stringify(['name', 'date', 'admission_no', 'file_no', 'patient_name', 'branch']))

  const filters: any[] = [['Sleeping Pattern', 'docstatus', '<', 2]]
  if (patient) {
    filters.push(['Sleeping Pattern', 'file_no', '=', patient])
  }
  params.append('filters', JSON.stringify(filters))
  params.append('limit_page_length', limit.toString())
  params.append('limit_start', offset.toString())
  params.append('order_by', 'date desc')

  return apiRequest<SleepingPattern[]>(`/api/resource/Sleeping Pattern?${params.toString()}`)
}

export async function createSleepingPattern(payload: {
  admission_no: string
  date?: string
  branch?: string
}): Promise<string> {
  const doc = await apiRequest<any>('/api/resource/Sleeping Pattern', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return doc?.name || ''
}

