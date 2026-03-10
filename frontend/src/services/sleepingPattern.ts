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

export async function fetchSleepingPatterns(
  limit: number = 50,
  offset: number = 0,
  patient?: string
): Promise<SleepingPattern[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)

  return apiRequest<SleepingPattern[]>(
    `/api/method/healthcare.api.sleeping_pattern.get_sleeping_patterns?${params.toString()}`
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

