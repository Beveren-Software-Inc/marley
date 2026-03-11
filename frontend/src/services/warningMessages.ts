export interface WarningMessage {
  name: string
  patient: string
  patient_name?: string
  posting_date?: string
  practitioner?: string
  practitioner_name?: string
  warning?: string
  reference_doc?: string
  reference_name?: string
  medical_role?: string
  gender?: string
  blood_group?: string
}

export async function fetchWarningMessages(
  limit: number = 50,
  offset: number = 0,
  patient?: string
): Promise<WarningMessage[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)

  const response = await fetch(
    `/api/method/healthcare.api.warning_message.get_warning_messages?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as WarningMessage[]
  } else {
    return []
  }
}

export async function fetchWarningMessage(name: string): Promise<WarningMessage> {
  const response = await fetch(
    `/api/method/healthcare.api.warning_message.get_warning_message?name=${encodeURIComponent(name)}`
  )
  const resData = await response.json()

  if (resData?.message) {
    return resData.message as WarningMessage
  } else {
    throw new Error('Invalid response format')
  }
}

export interface CreateWarningMessageData {
  patient: string
  warning?: string
  practitioner?: string
  posting_date?: string
  clinical_note_type?: string
  medical_role?: string
}

export async function createWarningMessage(data: CreateWarningMessageData): Promise<WarningMessage> {
  const csrf = (window as any).csrf_token
  const csrfForCreate = csrf || (await (await import('./apiClient')).ensureCSRF())

  const response = await fetch('/api/method/healthcare.api.warning_message.create_warning_message', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrfForCreate ? { 'X-Frappe-CSRF-Token': csrfForCreate } : {}),
    },
    body: JSON.stringify({ data }),
  })

  const resData = await response.json().catch(() => ({}))

  if (!response.ok || resData?.exc) {
    const errorMessage =
      resData?.message?.message || resData?.message || 'Failed to create warning message'
    throw new Error(errorMessage)
  }

  if (resData?.message) {
    return resData.message as WarningMessage
  } else {
    throw new Error('Invalid response format')
  }
}




