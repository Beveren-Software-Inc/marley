export interface Observation {
  name: string
  patient: string
  patient_name?: string
  observation_template?: string
  template_name?: string
  observation_category?: string
  status?: string
  posting_date?: string
  start_date?: string
  dc_date?: string
  healthcare_practitioner?: string
  practitioner_name?: string
  obs_code?: string
  obs_level?: string
  result_data?: string
  result_text?: string
  result_float?: number
  result_select?: string
  result_boolean?: number
  result_datetime?: string
  result_time?: string
  medical_department?: string
  admission_no?: string
}

export interface CreateObservationData {
  patient: string
  observation_template: string
  posting_date?: string
  start_date?: string
  status?: string
  practitioner?: string
  department?: string
  admission_no?: string
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

export async function createObservation(data: CreateObservationData): Promise<Observation> {
  const csrf = (window as any).csrf_token
  
  const response = await fetch('/api/method/healthcare.api.observation.create_observation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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


