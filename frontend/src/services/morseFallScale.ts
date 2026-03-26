import { apiRequest, ensureCSRF } from './apiClient'

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
  const csrf = (window as unknown as { frappe?: { csrf_token?: string } }).frappe?.csrf_token
    || await ensureCSRF()

  const res = await fetch('/api/resource/Morse Fall Scale', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify(data),
  })
  const out = await res.json().catch(() => ({} as Record<string, unknown>))
  if (!res.ok || out?.exc) {
    const msg = (out as Record<string, unknown>)?.message || (out as Record<string, unknown>)?.exc || 'Failed to create Morse Fall Scale'
    throw new Error(typeof msg === 'string' ? msg : String(msg))
  }
  const doc = (out as Record<string, unknown>)?.data ?? out
  return doc as MorseFallScale
}

