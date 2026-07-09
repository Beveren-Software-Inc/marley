export interface SessionSchedule {
  name: string
  date?: string
  admission_number?: string
  patient_num?: string
  patient_visit?: string
  session_type?: string
  session_name?: string
  transaction_status?: string
  company?: string
  doctor?: string
  doctor_name?: string
  practitioner?: string
  practitioner_name?: string
  cost_center?: string
  invoice_no?: string
  doc_code?: string
  from_time?: string
  to_time?: string
  amount?: number
  sales_order?: string
}

export interface CreateSessionScheduleData {
  date: string
  admission_number?: string
  patient_visit?: string
  session_type: string
  session_name?: string
  doctor?: string
  /** Healthcare Practitioner who entered the session. */
  practitioner?: string
  practitioner_name?: string
  cost_center?: string
  from_time?: string
  to_time?: string
  amount?: number
}

export async function fetchSessionSchedules(
  limit: number = 50,
  offset: number = 0,
  patient?: string,
  admissionNumber?: string,
  roleGroup?: string,
  practitioner?: string
): Promise<SessionSchedule[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (admissionNumber) params.append('admission_number', admissionNumber)
  if (roleGroup) params.append('role_group', roleGroup)
  if (practitioner) params.append('practitioner', practitioner)

  const response = await fetch(
    `/api/method/healthcare.api.session_schedule.get_session_schedules?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as SessionSchedule[]
  } else {
    return []
  }
}

export async function createSessionSchedule(data: CreateSessionScheduleData): Promise<SessionSchedule> {
  const csrf = (window as any).csrf_token
  const response = await fetch(
    '/api/method/healthcare.api.session_schedule.create_session_schedule',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
      },
      body: JSON.stringify({ data })
    }
  )
  const resData = await response.json()

  if (resData?.message) {
    return resData.message as SessionSchedule
  } else {
    throw new Error(resData?.exc || 'Failed to create session schedule')
  }
}

export async function updateSessionScheduleStatus(
  sessionScheduleName: string,
  status: string,
): Promise<SessionSchedule> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<SessionSchedule>(
    '/api/method/healthcare.api.session_schedule.update_session_schedule_status',
    {
      method: 'POST',
      body: JSON.stringify({
        session_schedule_name: sessionScheduleName,
        status,
      }),
    },
  )
}

export interface HealthcareServiceTemplateOption {
  name: string
  service_name?: string
  category?: string
  rate?: number
}

export async function getHealthcareServiceTemplates(
  search?: string,
  limit: number = 100,
  patientCareType?: 'OP' | 'IP',
): Promise<HealthcareServiceTemplateOption[]> {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (search?.trim()) params.set('search', search.trim())
  if (patientCareType) params.set('patient_care_type', patientCareType)

  const response = await fetch(
    `/api/method/healthcare.api.ip_service.get_ip_service_types?${params.toString()}`,
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as HealthcareServiceTemplateOption[]
  }
  return []
}

/** @deprecated Use getHealthcareServiceTemplates */
export async function getSessionTypes(): Promise<HealthcareServiceTemplateOption[]> {
  return getHealthcareServiceTemplates()
}

export async function createSessionScheduleSalesOrder(
  sessionScheduleName: string,
): Promise<{ sales_order: string; existing?: boolean; transaction_status?: string }> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<{ sales_order: string; existing?: boolean; transaction_status?: string }>(
    '/api/method/healthcare.api.session_schedule.create_sales_order_from_session_schedule',
    {
      method: 'POST',
      body: JSON.stringify({ session_schedule_name: sessionScheduleName }),
    },
  )
}

/** @deprecated Use createSessionScheduleSalesOrder */
export const billSessionSchedule = createSessionScheduleSalesOrder
