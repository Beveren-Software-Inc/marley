export interface VitalSign {
  name: string
  trans_no?: string
  patient: string
  patient_name?: string
  signs_date?: string
  signs_time?: string
  temperature?: string
  pulse?: string
  respiratory_rate?: string
  bp_systolic?: string
  bp_diastolic?: string
  bp?: string
  spo2?: number
  height?: string
  weight?: string
  bmi?: string
  vital_signs_note?: string
  nutrition_note?: string
  remarks?: string
  inpatient_record?: string
  admission_no?: string
  patient_visit?: string
  appointment?: string
  encounter?: string
  creation?: string
}

export interface CreateVitalSignData {
  patient?: string
  signs_date?: string
  signs_time?: string
  temperature?: string
  pulse?: string
  respiratory_rate?: string
  bp_systolic?: string
  bp_diastolic?: string
  spo2?: number
  height?: number
  weight?: number
  vital_signs_note?: string
  nutrition_note?: string
  remarks?: string
  inpatient_record?: string
  admission_no?: string
  patient_visit?: string
  appointment?: string
  encounter?: string
  company?: string
  branch?: string
}

export type UpdateVitalSignData = CreateVitalSignData & { name: string }

export interface VitalSignListFilters {
  dateFrom?: string
  dateTo?: string
  practitioner?: string
}

export async function fetchVitalSigns(
  limit: number = 50,
  offset: number = 0,
  patient?: string,
  filters: VitalSignListFilters = {}
): Promise<VitalSign[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (filters.dateFrom) params.append('date_from', filters.dateFrom)
  if (filters.dateTo) params.append('date_to', filters.dateTo)
  if (filters.practitioner) params.append('practitioner', filters.practitioner)

  const response = await fetch(
    `/api/method/healthcare.api.vital_signs.get_vital_signs?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as VitalSign[]
  } else {
    return []
  }
}

async function postVitalSign(
  method: string,
  data: CreateVitalSignData | UpdateVitalSignData,
): Promise<VitalSign> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()

  const response = await fetch(`/api/method/healthcare.api.vital_signs.${method}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ data }),
  })

  const resData = await response.json()

  if (!response.ok || resData?.exc) {
    const errorMessage =
      resData?.message?.message || resData?.message || `Failed to ${method.replace(/_/g, ' ')}`
    throw new Error(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage))
  }

  if (resData?.message) {
    return resData.message as VitalSign
  }
  throw new Error('Invalid response format')
}

export async function createVitalSign(data: CreateVitalSignData): Promise<VitalSign> {
  return postVitalSign('create_vital_sign', data)
}

export async function updateVitalSign(data: UpdateVitalSignData): Promise<VitalSign> {
  return postVitalSign('update_vital_sign', data)
}
