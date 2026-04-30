import { apiRequest } from './apiClient'

export interface MorseFallScaleDetailRow {
  text_message: string
  points: number
}

export interface MorseFallScale {
  name: string
  admission_no: string
  patient_no: string
  orderer_number?: string
  company?: string
  total_points?: number
  modified?: string
  morse_fall_scale_detail?: MorseFallScaleDetailRow[]
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

export async function createMorseFallScale(
  data: Omit<MorseFallScale, 'name' | 'total_points' | 'modified'>
): Promise<MorseFallScale> {
  const res = await fetch('/api/method/healthcare.api.morse_fall_scale.create_morse_fall_scale', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  })
  const resData = await res.json().catch(() => ({} as Record<string, unknown>))
  if (!res.ok || !(resData as Record<string, unknown>)?.message) {
    const msg =
      (resData as Record<string, unknown>)?.message ||
      (resData as Record<string, unknown>)?.exc ||
      (resData as Record<string, unknown>)?.exception ||
      'Failed to create Morse Fall Scale'
    throw new Error(typeof msg === 'string' ? msg : String(msg))
  }
  return (resData as { message: MorseFallScale }).message
}

