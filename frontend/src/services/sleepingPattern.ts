import { apiRequest } from './apiClient'

export interface SleepingPattern {
  name: string
  date: string
  admission_no: string
  file_no?: string
  patient_name?: string
  branch?: string
  user?: string
  total_hours?: number | null
  morning_total?: number | null
  evening_total?: number | null
  night_total?: number | null
  morning_from?: string | null
  morning_to?: string | null
  evening_from?: string | null
  evening_to?: string | null
  night_from?: string | null
  night_to?: string | null
  creation?: string | null
  modified?: string | null
}

export type SleepingPatternDoc = SleepingPattern

export type NursingListFilters = {
  dateFrom?: string
  dateTo?: string
  practitioner?: string
}

export interface CreateSleepingPatternPayload {
  admission_no: string
  date?: string
  branch?: string
  morning_from?: string
  morning_to?: string
  evening_from?: string
  evening_to?: string
  night_from?: string
  night_to?: string
  patient?: string
}

export type UpdateSleepingPatternPayload = {
  name: string
  date?: string
  branch?: string
  morning_from?: string | null
  morning_to?: string | null
  evening_from?: string | null
  evening_to?: string | null
  night_from?: string | null
  night_to?: string | null
}

/** Convert Frappe datetime to value for datetime-local inputs. */
export function frappeDateTimeToInput(value?: string | null): string {
  if (!value) return ''
  const trimmed = value.trim().replace(' ', 'T')
  if (trimmed.length >= 16) return trimmed.slice(0, 16)
  return trimmed
}

/** Convert datetime-local input value to Frappe datetime string. */
export function inputDateTimeToFrappe(value: string): string | undefined {
  if (!value || !value.trim()) return undefined
  let s = value.trim()
  if (s.includes('T')) {
    s = s.replace('T', ' ')
  }
  if (s.length === 16) {
    s = `${s}:00`
  }
  return s
}

export async function fetchSleepingPatterns(
  limit: number = 50,
  offset: number = 0,
  patient?: string,
  filters?: NursingListFilters
): Promise<SleepingPattern[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (filters?.dateFrom) params.append('date_from', filters.dateFrom)
  if (filters?.dateTo) params.append('date_to', filters.dateTo)
  if (filters?.practitioner) params.append('practitioner', filters.practitioner)

  return apiRequest<SleepingPattern[]>(
    `/api/method/healthcare.api.sleeping_pattern.get_sleeping_patterns?${params.toString()}`
  )
}

export async function fetchSleepingPattern(name: string): Promise<SleepingPatternDoc> {
  const params = new URLSearchParams({ name })
  return apiRequest<SleepingPatternDoc>(
    `/api/method/healthcare.api.sleeping_pattern.get_sleeping_pattern?${params.toString()}`
  )
}

export async function createSleepingPattern(payload: CreateSleepingPatternPayload): Promise<string> {
  const result = await apiRequest<{ name: string }>(
    '/api/method/healthcare.api.sleeping_pattern.create_sleeping_pattern',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
  return result?.name || ''
}

export async function updateSleepingPattern(
  payload: UpdateSleepingPatternPayload
): Promise<SleepingPattern> {
  return apiRequest<SleepingPattern>(
    '/api/method/healthcare.api.sleeping_pattern.update_sleeping_pattern',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
}

