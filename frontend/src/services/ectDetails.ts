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

export async function fetchECTDetail(name: string): Promise<ECTDetail> {
  const response = await fetch(
    `/api/resource/ECT%20Details/${encodeURIComponent(name)}`
  )
  const resData = await response.json()
  if (resData?.data) {
    return resData.data as ECTDetail
  }
  if (resData?.exc) {
    throw new Error(resData.exc_type ? `${resData.exc_type}: ${resData.exc}` : resData.exc)
  }
  throw new Error('ECT Detail not found')
}

export interface CreateECTDetailData {
  patient: string
  date?: string
  time?: string
  source?: string
  duration?: number
  energy?: string
  _age?: number
  success?: string
  reference_doctype?: string
  reference_name?: string
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
}

export async function createECTDetail(data: CreateECTDetailData): Promise<ECTDetail> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()

  const response = await fetch('/api/method/healthcare.api.ect_details.create_ect_detail', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ data }),
  })

  const resData = await response.json()

  if (!response.ok || resData?.exc) {
    const msg =
      resData?.message?.message || resData?.message || resData?.exc || 'Failed to create ECT detail'
    throw new Error(typeof msg === 'string' ? msg : 'Failed to create ECT detail')
  }

  if (resData?.message && typeof resData.message === 'object') {
    return resData.message as ECTDetail
  }
  throw new Error('Invalid response format')
}





