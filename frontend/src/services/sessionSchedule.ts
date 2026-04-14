export interface SessionSchedule {
  name: string
  date?: string
  admission_number?: string
  patient_num?: string
  session_type?: string
  session_name?: string
  transaction_status?: string
  company?: string
  doctor?: string
  doctor_name?: string
  cost_center?: string
  invoice_no?: string
  doc_code?: string
  from_time?: string
  to_time?: string
}

export interface CreateSessionScheduleData {
  date: string
  admission_number?: string
  session_type: string
  session_name?: string
  company?: string
  doctor?: string
  cost_center?: string
  from_time?: string
  to_time?: string
}

export async function fetchSessionSchedules(
  limit: number = 50,
  offset: number = 0,
  patient?: string,
  admissionNumber?: string
): Promise<SessionSchedule[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (admissionNumber) params.append('admission_number', admissionNumber)

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
  status: string
): Promise<SessionSchedule> {
  const csrf = (window as any).csrf_token
  const response = await fetch(
    '/api/method/healthcare.api.session_schedule.update_session_schedule_status',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
      },
      body: JSON.stringify({
        session_schedule_name: sessionScheduleName,
        status
      })
    }
  )
  const resData = await response.json()

  if (resData?.message) {
    return resData.message as SessionSchedule
  } else {
    throw new Error(resData?.exc || 'Failed to update session schedule')
  }
}

export async function getSessionTypes(): Promise<Array<{ name: string; label?: string }>> {
  const response = await fetch('/api/method/frappe.client.get_list?doctype=Session%20Type&fields=["name"]&limit_page_length=0')
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as Array<{ name: string }>
  } else {
    return []
  }
}
