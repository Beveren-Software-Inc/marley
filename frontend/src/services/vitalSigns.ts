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

export async function fetchVitalSigns(
  limit: number = 50,
  offset: number = 0,
  patient?: string
): Promise<VitalSign[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)

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

export async function createVitalSign(data: CreateVitalSignData): Promise<VitalSign> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()

  const response = await fetch('/api/method/healthcare.api.vital_signs.create_vital_sign', {
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
    const errorMessage = resData?.message?.message || resData?.message || 'Failed to create vital sign'
    throw new Error(errorMessage)
  }

  if (resData?.message) {
    return resData.message as VitalSign
  } else {
    throw new Error('Invalid response format')
  }
}





