export interface WarningMessage {
  name: string
  patient?: string
  patient_name?: string
  file_no?: string
  posting_date?: string
  practitioner?: string
  practitioner_name?: string
  warning?: string
  reference_doc?: string
  reference_name?: string
  medical_role?: string
  type_of_warning?: string
  gender?: string
  blood_group?: string
  trans_id?: string
  high_risk_text?: string
  clinical_note_type?: string
  cost_center?: string
  warning_message_type?: string
  warning_message_class?: string
  creation?: string
  modified?: string
}

export type NoPatientWarningScope = 'all' | 'organisation'

export interface WarningMessageListQuery {
  typeOfWarning?: string
  practitioner?: string
  fromDate?: string
  toDate?: string
}

export async function fetchWarningMessages(
  limit: number = 50,
  offset: number = 0,
  patient?: string,
  noPatientScope: NoPatientWarningScope = 'all',
  query?: WarningMessageListQuery,
): Promise<WarningMessage[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (!patient && noPatientScope === 'organisation') {
    params.append('no_patient_scope', 'organisation')
  }
  if (query?.typeOfWarning) params.append('type_of_warning', query.typeOfWarning)
  if (query?.practitioner) params.append('practitioner', query.practitioner)
  if (query?.fromDate) params.append('posting_date_from', query.fromDate)
  if (query?.toDate) params.append('posting_date_to', query.toDate)

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

export async function fetchWarningMessage(name: string): Promise<Record<string, unknown>> {
  if (!name) {
    throw new Error('Warning message name is required')
  }

  const response = await fetch(
    `/api/method/healthcare.api.warning_message.get_warning_message?name=${encodeURIComponent(name)}`
  )
  const resData = await response.json()

  if (!response.ok || resData.exc) {
    const message =
      resData?._error_message ||
      resData?.message?.message ||
      resData?.message ||
      'Failed to fetch warning message'
    throw new Error(typeof message === 'string' ? message : 'Failed to fetch warning message')
  }

  if (resData?.message && typeof resData.message === 'object') {
    return resData.message as Record<string, unknown>
  }

  throw new Error('Invalid response format')
}

export interface CreateWarningMessageData {
  patient?: string
  type_of_warning?: 'Medical' | 'Organisation'
  warning?: string
  practitioner?: string
  posting_date?: string
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




