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
  doc_remarks?: string
  feedback_remarks?: string
  sr_num?: string
}

export interface CreateSessionScheduleData {
  date: string
  /** Patient id — required when visit/admission is not linked */
  patient?: string
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
  doc_remarks?: string
}

export async function fetchSessionSchedules(
  limit: number = 50,
  offset: number = 0,
  patient?: string,
  admissionNumber?: string,
  roleGroup?: string,
  practitioner?: string
): Promise<{ data: SessionSchedule[]; total_count: number }> {
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
  const message = resData?.message

  if (Array.isArray(message)) {
    return { data: message as SessionSchedule[], total_count: message.length }
  }
  if (message && typeof message === 'object' && Array.isArray(message.data)) {
    return {
      data: message.data as SessionSchedule[],
      total_count: Number(message.total_count ?? message.data.length),
    }
  }
  return { data: [], total_count: 0 }
}

export async function fetchSessionSchedule(name: string): Promise<SessionSchedule> {
  const { fetchDoc } = await import('./common')
  const data = await fetchDoc('Session Schedule', name)
  return { ...(data as unknown as SessionSchedule), name: String(data.name || name) }
}

/** Display name for Session Schedule.practitioner (Username on the detail panel). */
export async function resolveSessionPractitionerName(
  practitioner?: string | null,
  practitionerName?: string | null,
): Promise<string> {
  const labeled = (practitionerName || '').trim()
  if (labeled) return labeled
  const id = (practitioner || '').trim()
  if (!id) return ''
  try {
    const params = new URLSearchParams({
      doctype: 'Healthcare Practitioner',
      fields: JSON.stringify(['name', 'practitioner_name']),
      filters: JSON.stringify([['name', '=', id]]),
      limit_page_length: '1',
    })
    const res = await fetch(`/api/method/frappe.client.get_list?${params}`)
    const payload = await res.json()
    const row = Array.isArray(payload?.message) ? payload.message[0] : null
    const resolved = String(row?.practitioner_name || '').trim()
    if (resolved) return resolved
  } catch {
    /* leave blank rather than showing an internal id */
  }
  return ''
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

export async function updateSessionSchedule(
  name: string,
  data: CreateSessionScheduleData,
): Promise<SessionSchedule> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<SessionSchedule>(
    '/api/method/healthcare.api.session_schedule.update_session_schedule',
    {
      method: 'POST',
      body: JSON.stringify({
        session_schedule_name: name,
        data,
      }),
    },
  )
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

export interface SessionScheduleAmountPreview {
  /** Inclusive / catalog list price (before insurance %) */
  amount: number
  base_rate?: number
  discount_pct?: number
  discount_amount?: number
  net_rate?: number
  insurance?: string | null
  used_insurance_price?: boolean
  patient?: string | null
  patient_care_type?: string | null
}

/** Insured amount for a Healthcare Service Template on Session Schedule (Inclusive price + OP/IP %). */
export async function fetchSessionScheduleAmount(args: {
  sessionType: string
  patient?: string
  patientVisit?: string
  admissionNumber?: string
  patientCareType?: 'OP' | 'IP'
}): Promise<SessionScheduleAmountPreview> {
  const params = new URLSearchParams()
  params.set('session_type', args.sessionType)
  if (args.patient) params.set('patient', args.patient)
  if (args.patientVisit) params.set('patient_visit', args.patientVisit)
  if (args.admissionNumber) params.set('admission_number', args.admissionNumber)
  if (args.patientCareType) params.set('patient_care_type', args.patientCareType)

  const response = await fetch(
    `/api/method/healthcare.api.session_schedule.get_session_schedule_amount?${params.toString()}`,
    { credentials: 'include' },
  )
  const resData = await response.json()
  const msg = (resData?.message || {}) as Partial<SessionScheduleAmountPreview>
  return {
    amount: Number(msg.amount) || 0,
    base_rate: msg.base_rate != null ? Number(msg.base_rate) : undefined,
    discount_pct: msg.discount_pct != null ? Number(msg.discount_pct) : undefined,
    discount_amount: msg.discount_amount != null ? Number(msg.discount_amount) : undefined,
    net_rate: msg.net_rate != null ? Number(msg.net_rate) : undefined,
    insurance: msg.insurance ?? null,
    used_insurance_price: Boolean(msg.used_insurance_price),
    patient: msg.patient ?? null,
    patient_care_type: msg.patient_care_type ?? null,
  }
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
