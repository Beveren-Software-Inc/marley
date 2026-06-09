export interface Observation {
  name: string
  trans_no?: string
  patient: string
  patient_name?: string
  observation_category?: string
  posting_date?: string
  start_date?: string
  dc_date?: string
  healthcare_practitioner?: string
  practitioner_name?: string
  obs_code?: string
  observation_level?: string
  designated_security_personel?: string
  result_data?: string
  result_text?: string
  result_float?: number
  result_select?: string
  result_boolean?: number
  result_datetime?: string
  result_time?: string
  medical_department?: string
  admission_no?: string
  note?: string
  amount?: number
  duration?: string
  order_created?: string
  reference_doctype?: string
  reference_docname?: string
  company?: string
  room?: string
  room_name?: string
}

export interface CreateObservationData {
  patient: string
  posting_date?: string
  start_date?: string
  practitioner?: string
  department?: string
  admission_no?: string
  patient_visit?: string
  observation_level?: string
  designated_security_personel?: string
  note?: string
  amount?: number
  duration?: string
  company?: string
  room?: string
}

export interface ObservationLevelDetails {
  observation_level?: string
  interval?: string
  is_billable?: number
  rate?: number
  item?: string
  item_code?: string
  link_existing_item?: number
}

export async function fetchObservationLevelDetails(name: string): Promise<ObservationLevelDetails | null> {
  if (!name) return null
  const params = new URLSearchParams({ name })
  const response = await fetch(
    `/api/method/healthcare.api.observation.get_observation_level_details?${params.toString()}`
  )
  const resData = await response.json()
  const msg = resData?.message
  if (msg && typeof msg === 'object') {
    return msg as ObservationLevelDetails
  }
  return null
}

export async function fetchObservations(
  limit: number = 50,
  offset: number = 0,
  patient?: string
): Promise<Observation[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)

  const response = await fetch(
    `/api/method/healthcare.api.observation.get_observations?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as Observation[]
  } else {
    return []
  }
}

export async function fetchObservation(name: string): Promise<Observation> {
  const params = new URLSearchParams({ name })
  const response = await fetch(
    `/api/method/healthcare.api.observation.get_observation?${params.toString()}`
  )
  const resData = await response.json()
  if (resData?.exc_type) {
    throw new Error(resData?.message || 'Failed to load observation')
  }
  return (resData?.message || {}) as Observation
}

export async function createObservation(data: CreateObservationData): Promise<Observation> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const response = await fetch('/api/method/healthcare.api.observation.create_observation', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
    },
    body: JSON.stringify({ data })
  })

  const resData = await response.json()

  if (!response.ok) {
    const errorMessage = resData?.message?.message || resData?.message || 'Failed to create observation'
    throw new Error(errorMessage)
  }

  if (resData?.message) {
    return resData.message as Observation
  } else {
    throw new Error('Invalid response format')
  }
}

export async function createObservationSalesOrder(
  observationName: string
): Promise<{ sales_order: string; status: string; existing?: boolean }> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<{ sales_order: string; status: string; existing?: boolean }>(
    '/api/method/healthcare.api.observation.create_sales_order_from_observation',
    {
      method: 'POST',
      body: JSON.stringify({ observation_name: observationName }),
    }
  )
}

export async function scheduleObservationDischarge(
  name: string,
  dcDate?: string
): Promise<{ name: string; dc_date: string; room?: string; message?: string }> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<{ name: string; dc_date: string; room?: string; message?: string }>(
    '/api/method/healthcare.api.observation.schedule_observation_discharge',
    {
      method: 'POST',
      body: JSON.stringify({ name, dc_date: dcDate }),
    }
  )
}
