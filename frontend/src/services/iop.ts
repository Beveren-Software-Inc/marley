/** Extract short user-facing message from Frappe exception (avoid full traceback). */
function messageFromExc(exc: string, excType?: string): string {
  if (!exc || typeof exc !== 'string') return excType ? String(excType) : 'Request failed'
  const trimmed = exc.trim()
  const anyLineMatch = trimmed.match(/(?:ValidationError|DuplicateEntryError):\s*(.+?)(?:\n|$)/s)
  if (anyLineMatch && anyLineMatch[1]) return anyLineMatch[1].trim()
  const lastLine = trimmed.split('\n').filter(Boolean).pop() || trimmed
  return lastLine.length > 200 ? lastLine.slice(0, 200) + '…' : lastLine
}

/** IOP Day (schedule for one day with sessions). */
export interface IOPDay {
  name: string
  posting_date?: string
  company?: string
  cost_center?: string
}

export interface IOPDayWithSessions extends IOPDay {
  sessions: { session_type: string; from_time?: string; to_time?: string }[]
}

export interface IOPSessionType {
  name: string
  session_type_name?: string
  description?: string
}

/** IOP Enrollment (patient enrolled in an IOP day). */
export interface IOPEnrollment {
  name: string
  patient?: string
  patient_name?: string
  iop_day?: string
  posting_date?: string
  status?: string
  notes?: string
}

export async function fetchIOPDays(
  limit: number = 50,
  offset: number = 0,
  fromDate?: string,
  toDate?: string
): Promise<IOPDay[]> {
  const params = new URLSearchParams()
  params.set('limit', limit.toString())
  params.set('offset', offset.toString())
  if (fromDate) params.set('from_date', fromDate)
  if (toDate) params.set('to_date', toDate)
  const res = await fetch(`/api/method/healthcare.api.iop.get_iop_days?${params}`)
  const data = await res.json()
  if (data?.exc) throw new Error(data.exc_type ? `${data.exc_type}: ${data.exc}` : data.exc)
  return Array.isArray(data?.message) ? data.message : []
}

export async function fetchIOPDayWithSessions(name: string): Promise<IOPDayWithSessions> {
  const res = await fetch(
    `/api/method/healthcare.api.iop.get_iop_day_with_sessions?name=${encodeURIComponent(name)}`
  )
  const data = await res.json()
  if (data?.exc) throw new Error(data.exc_type ? `${data.exc_type}: ${data.exc}` : data.exc)
  if (!data?.message) throw new Error('IOP Day not found')
  return data.message as IOPDayWithSessions
}

export async function createIOPDay(payload: {
  posting_date: string
  company?: string
  cost_center?: string
  sessions: { session_type: string; from_time?: string; to_time?: string }[]
}): Promise<{ name: string; posting_date: string }> {
  const res = await fetch('/api/method/healthcare.api.iop.create_iop_day', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: payload })
  })
  const data = await res.json()
  if (data?.exc) throw new Error(messageFromExc(data.exc, data.exc_type))
  if (!data?.message?.name) throw new Error('Failed to create IOP Day')
  return data.message
}

export async function fetchCompanies(): Promise<{ name: string }[]> {
  const res = await fetch('/api/resource/Company?fields=["name"]&limit_page_length=200')
  const data = await res.json()
  return Array.isArray(data?.data) ? data.data : []
}

export async function fetchCostCenters(): Promise<{ name: string }[]> {
  const res = await fetch('/api/resource/Cost%20Center?fields=["name"]&limit_page_length=200')
  const data = await res.json()
  return Array.isArray(data?.data) ? data.data : []
}

export async function fetchIOPSessionTypes(): Promise<IOPSessionType[]> {
  const res = await fetch('/api/method/healthcare.api.iop.get_iop_session_types')
  const data = await res.json()
  if (data?.exc) throw new Error(data.exc_type ? `${data.exc_type}: ${data.exc}` : data.exc)
  return Array.isArray(data?.message) ? data.message : []
}

export async function fetchIOPEnrollments(
  limit: number = 50,
  offset: number = 0,
  iopDay?: string,
  patient?: string,
  status?: string
): Promise<IOPEnrollment[]> {
  const params = new URLSearchParams()
  params.set('limit', limit.toString())
  params.set('offset', offset.toString())
  if (iopDay) params.set('iop_day', iopDay)
  if (patient) params.set('patient', patient)
  if (status) params.set('status', status)
  const res = await fetch(`/api/method/healthcare.api.iop.get_iop_enrollments?${params}`)
  const data = await res.json()
  if (data?.exc) throw new Error(data.exc_type ? `${data.exc_type}: ${data.exc}` : data.exc)
  return Array.isArray(data?.message) ? data.message : []
}

export async function createIOPEnrollment(payload: {
  patient: string
  iop_day: string
  status?: string
  notes?: string
}): Promise<IOPEnrollment> {
  const res = await fetch('/api/method/healthcare.api.iop.create_iop_enrollment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = await res.json()
  if (data?.exc) throw new Error(messageFromExc(data.exc, data.exc_type))
  if (!data?.message?.name) throw new Error('Failed to create IOP Enrollment')
  return data.message as IOPEnrollment
}
