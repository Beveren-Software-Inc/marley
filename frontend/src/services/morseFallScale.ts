import { apiRequest } from './apiClient'

export interface MorseFallScaleDetailRow {
  text_message: string
  points: number
}

export interface MorseFallScale {
  name: string
  trans_no?: string
  admission_no: string
  patient_no: string
  orderer_number?: string
  company?: string
  practitioner?: string
  practitioner_name?: string
  cost_center?: string
  date?: string
  total_points?: number
  modified?: string
  morse_fall_scale_detail?: MorseFallScaleDetailRow[]
}

export interface MorseFallScaleListFilters {
  dateFrom?: string
  dateTo?: string
  practitioner?: string
}

const LIST_FIELDS = [
  'name',
  'trans_no',
  'admission_no',
  'patient_no',
  'company',
  'practitioner',
  'practitioner_name',
  'cost_center',
  'total_points',
  'date',
  'modified',
]

export async function fetchMorseFallScales(
  limit: number = 50,
  offset: number = 0,
  patient?: string,
  filters: MorseFallScaleListFilters = {}
): Promise<MorseFallScale[]> {
  const params = new URLSearchParams()
  params.append('fields', JSON.stringify(LIST_FIELDS))

  const frappeFilters: [string, string, string, string?][] = [['Morse Fall Scale', 'docstatus', '<', '2']]
  if (patient) {
    frappeFilters.push(['Morse Fall Scale', 'patient_no', '=', patient])
  }
  if (filters.practitioner) {
    frappeFilters.push(['Morse Fall Scale', 'practitioner', '=', filters.practitioner])
  }
  if (filters.dateFrom) {
    frappeFilters.push(['Morse Fall Scale', 'date', '>=', filters.dateFrom])
  }
  if (filters.dateTo) {
    frappeFilters.push(['Morse Fall Scale', 'date', '<=', filters.dateTo])
  }

  params.append('filters', JSON.stringify(frappeFilters))
  params.append('limit_page_length', limit.toString())
  params.append('limit_start', offset.toString())
  params.append('order_by', 'modified desc')

  return apiRequest<MorseFallScale[]>(`/api/resource/Morse Fall Scale?${params.toString()}`)
}

export async function createMorseFallScale(
  data: Omit<MorseFallScale, 'name' | 'total_points' | 'modified'>
): Promise<MorseFallScale> {
  return apiRequest<MorseFallScale>(
    '/api/method/healthcare.api.morse_fall_scale.create_morse_fall_scale',
    {
      method: 'POST',
      body: JSON.stringify({ data }),
    }
  )
}
