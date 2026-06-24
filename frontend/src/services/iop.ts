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
  session_total?: number
  sessions: {
    session_type: string
    service_name?: string
    rate?: number
    item_code?: string
    from_time?: string
    to_time?: string
  }[]
}

export interface IOPHealthcareServiceTemplate {
  name: string
  service_name?: string
  category?: string
  rate?: number
}

/** @deprecated IOP Session Type — only used by Daily Auto Visit setup. */
export interface IOPSessionType {
  name: string
  session_type_name?: string
  description?: string
  rate?: number
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
  doctor?: string
  /** Linked Patient Visit when one was created from this enrollment. */
  patient_visit?: string
  /** Sum of Healthcare Service Template rates on this enrollment. */
  session_total?: number
  /** Linked visit Sales Order total when billed. */
  visit_amount?: number
  /** session_total or visit_amount — whichever is available. */
  total_cost?: number
  session_costs?: Array<{
    session_type: string
    service_name?: string
    item_code?: string
    rate: number
  }>
}

/** One row of IOP Session child table (type, from, to, notes). */
export interface IOPEnrollmentSessionRow {
  session_type: string
  from_time?: string
  to_time?: string
  notes?: string
}

/** IOP Enrollment with child table for edit. */
export interface IOPEnrollmentWithSessions extends IOPEnrollment {
  iop_session?: IOPEnrollmentSessionRow[]
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
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const res = await fetch('/api/method/healthcare.api.iop.create_iop_day', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
    },
    body: JSON.stringify({ data: payload })
  })
  const data = await res.json()
  if (data?.exc) throw new Error(messageFromExc(data.exc, data.exc_type))
  if (!data?.message?.name) throw new Error('Failed to create IOP Day')
  return data.message
}

export async function updateIOPDay(
  name: string,
  payload: {
    posting_date?: string
    company?: string
    cost_center?: string
    sessions: { session_type: string; from_time?: string; to_time?: string }[]
  },
): Promise<IOPDayWithSessions> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const res = await fetch('/api/method/healthcare.api.iop.update_iop_day', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ name, data: payload }),
  })
  const data = await res.json()
  if (data?.exc) throw new Error(messageFromExc(data.exc, data.exc_type))
  if (!data?.message?.name) throw new Error('Failed to update IOP Day')
  return data.message as IOPDayWithSessions
}

export async function deleteIOPDay(name: string): Promise<{ message?: string }> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const res = await fetch('/api/method/healthcare.api.iop.delete_iop_day', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ name }),
  })
  const data = await res.json()
  if (data?.exc) throw new Error(messageFromExc(data.exc, data.exc_type))
  return data.message || {}
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

export async function fetchIOPHealthcareServiceTemplates(
  search?: string,
): Promise<IOPHealthcareServiceTemplate[]> {
  const params = new URLSearchParams()
  params.set('limit', '200')
  if (search?.trim()) params.set('search', search.trim())
  const res = await fetch(
    `/api/method/healthcare.api.ip_service.get_ip_service_types?${params}`,
  )
  const data = await res.json()
  if (data?.exc) throw new Error(data.exc_type ? `${data.exc_type}: ${data.exc}` : data.exc)
  return Array.isArray(data?.message) ? data.message : []
}

export async function fetchIOPSessionTypes(): Promise<IOPSessionType[]> {
  const res = await fetch('/api/method/healthcare.api.iop.get_iop_session_types')
  const data = await res.json()
  if (data?.exc) throw new Error(data.exc_type ? `${data.exc_type}: ${data.exc}` : data.exc)
  return Array.isArray(data?.message) ? data.message : []
}

export async function createIOPSessionType(
  sessionTypeName: string,
  description?: string,
): Promise<IOPSessionType> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const res = await fetch('/api/method/healthcare.api.iop.create_iop_session_type', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({
      session_type_name: sessionTypeName,
      description: description || undefined,
    }),
  })
  const data = await res.json()
  if (data?.exc) throw new Error(messageFromExc(data.exc, data.exc_type))
  if (!data?.message?.name) throw new Error('Failed to create session type')
  return data.message as IOPSessionType
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
  iop_day?: string
  status?: string
  notes?: string
  doctor?: string
  practitioner?: string
  iop_session?: IOPEnrollmentSessionRow[]
}): Promise<IOPEnrollment> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const res = await fetch('/api/method/healthcare.api.iop.create_iop_enrollment', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
    },
    body: JSON.stringify(payload)
  })
  const data = await res.json()
  if (data?.exc) throw new Error(messageFromExc(data.exc, data.exc_type))
  if (!data?.message?.name) throw new Error('Failed to create IOP Enrollment')
  return data.message as IOPEnrollment
}

export async function fetchIOPEnrollment(name: string): Promise<IOPEnrollmentWithSessions> {
  const res = await fetch(
    `/api/method/healthcare.api.iop.get_iop_enrollment?name=${encodeURIComponent(name)}`
  )
  const data = await res.json()
  if (data?.exc) throw new Error(messageFromExc(data.exc, data.exc_type))
  if (!data?.message) throw new Error('Enrollment not found')
  return data.message as IOPEnrollmentWithSessions
}

export async function updateIOPEnrollment(
  name: string,
  payload: {
    iop_session?: IOPEnrollmentSessionRow[]
    status?: string
    notes?: string
  },
): Promise<{ name: string; status?: string }> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const res = await fetch('/api/method/healthcare.api.iop.update_iop_enrollment', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ name, ...payload }),
  })
  const data = await res.json()
  if (data?.exc) throw new Error(messageFromExc(data.exc, data.exc_type))
  if (!data?.message?.name) throw new Error('Failed to update enrollment')
  return data.message as { name: string; status?: string }
}

/** @deprecated Use updateIOPEnrollment */
export async function updateIOPEnrollmentSessions(
  name: string,
  iop_session: IOPEnrollmentSessionRow[],
): Promise<{ name: string }> {
  return updateIOPEnrollment(name, { iop_session })
}
