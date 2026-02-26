import { apiRequest } from './apiClient'

export interface MorseFallScale {
  name: string
  admission_no: string
  patient_no: string
  company?: string
  total_points?: number
  modified?: string
}

export async function fetchMorseFallScales(
  limit: number = 50,
  offset: number = 0,
  patient?: string
): Promise<MorseFallScale[]> {
  const params = new URLSearchParams()
  params.append('fields', JSON.stringify(['name', 'admission_no', 'patient_no', 'company', 'total_points', 'modified']))

  const filters: any[] = [['Morse Fall Scale', 'docstatus', '<', 2]]
  if (patient) {
    filters.push(['Morse Fall Scale', 'patient_no', '=', patient])
  }
  params.append('filters', JSON.stringify(filters))
  params.append('limit_page_length', limit.toString())
  params.append('limit_start', offset.toString())
  params.append('order_by', 'modified desc')

  return apiRequest<MorseFallScale[]>(`/api/resource/Morse Fall Scale?${params.toString()}`)
}

