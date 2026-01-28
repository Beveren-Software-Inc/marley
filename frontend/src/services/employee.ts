export interface EmployeeDashboard {
  employee?: {
    name: string
    employee_name?: string
    designation?: string
    company?: string
  } | null
  checkins: Array<{
    name: string
    time: string
    log_type?: string
    shift?: string
  }>
  room_access_logs: Array<{
    name: string
    access_time: string
    door?: string
    event_type?: string
  }>
  attendance: Array<{
    name: string
    attendance_date: string
    status: string
    shift?: string
  }>
}

export async function createEmployeeRequest(payload: {
  subject: string
  details: string
  type?: string
  related_doctype?: string
  related_document?: string
}): Promise<{ name: string; status: string }> {
  const response = await fetch('/api/method/healthcare.api.employee_request_api.create_employee_request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const resData = await response.json()
  if (resData?.message) {
    return resData.message as { name: string; status: string }
  }

  throw new Error(resData?._server_messages || 'Failed to create employee request')
}

export async function getEmployeeDashboard(): Promise<EmployeeDashboard> {
  const response = await fetch('/api/method/healthcare.api.employee_portal.get_employee_dashboard')
  const resData = await response.json()

  if (resData?.message) {
    return resData.message as EmployeeDashboard
  }

  return {
    employee: null,
    checkins: [],
    room_access_logs: [],
    attendance: [],
  }
}

