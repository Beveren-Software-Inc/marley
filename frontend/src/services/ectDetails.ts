export interface ECTDetail {
  name: string
  patient: string
  patient_name?: string
  date?: string
  time?: string
  source?: string
  duration?: number
  energy?: string
  _age?: number
  success?: string
  repeated?: string
  vitals?: string
  ecg?: string
  anathesiologist?: string
  assist_doctor?: string
  psychiatrist?: string
  nurse?: string
  doctors_name?: string
  ect_doctors_notes?: string
  date_and_time?: string
  nurse_name?: string
  ect_nurse_notes?: string
  n_date_and_time?: string
  bp_1?: string
  bp_2?: string
  psychology_doctor?: string
  anaesthetic_doctor?: string
  reference_doctype?: string
  reference_name?: string
}

export async function fetchECTDetails(
  limit: number = 50,
  offset: number = 0,
  patient?: string
): Promise<ECTDetail[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)

  const response = await fetch(
    `/api/method/healthcare.api.ect_details.get_ect_details?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as ECTDetail[]
  } else {
    return []
  }
}



