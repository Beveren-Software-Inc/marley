export interface VitalSign {
  name: string
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
  appointment?: string
  encounter?: string
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

