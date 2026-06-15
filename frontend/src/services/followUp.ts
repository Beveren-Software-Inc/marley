export interface PatientFollowUpRow {
  name: string
  patient: string
  patient_name: string
  follow_up_type: string
  follow_up_date: string
  status: string
  cost_center?: string
  remarks?: string
  company?: string
  reference_doctype?: string
  reference_name?: string
}

export interface FollowUpCandidateRow {
  reference_name: string
  reference_doctype: string
  patient: string
  patient_name: string
  reference_date?: string
  practitioner_name?: string
  reference_status?: string
  cost_center?: string
  company?: string
  mobile?: string
  follow_up_name?: string
  follow_up_date?: string
  follow_up_status?: string
  follow_up_type: string
}

export interface GetFollowUpsParams {
  status?: string
  cost_center?: string
  follow_up_type?: string
  patient?: string
  search?: string
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
}

export interface GetFollowUpCandidatesParams {
  search?: string
  cost_center?: string
  patient?: string
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
}

export interface PaginatedFollowUps {
  data: PatientFollowUpRow[]
  total_count: number
}

export interface PaginatedFollowUpCandidates {
  data: FollowUpCandidateRow[]
  total_count: number
}

function parseApiMessage<T>(data: { exc?: unknown; message?: unknown; _server_messages?: string }): T {
  if (data.exc) {
    throw new Error(
      data._server_messages ? JSON.parse(data._server_messages)[0] : 'Request failed',
    )
  }
  return data.message as T
}

export async function getFollowUps(params: GetFollowUpsParams = {}): Promise<PaginatedFollowUps> {
  const sp = new URLSearchParams()
  if (params.status) sp.set('status', params.status)
  if (params.cost_center) sp.set('cost_center', params.cost_center)
  if (params.follow_up_type) sp.set('follow_up_type', params.follow_up_type)
  if (params.patient) sp.set('patient', params.patient)
  if (params.search) sp.set('search', params.search)
  if (params.date_from) sp.set('date_from', params.date_from)
  if (params.date_to) sp.set('date_to', params.date_to)
  if (params.limit != null) sp.set('limit', String(params.limit))
  if (params.offset != null) sp.set('offset', String(params.offset))
  const url = `/api/method/healthcare.healthcare.doctype.patient_follow_up.patient_follow_up.get_follow_ups?${sp.toString()}`
  const res = await fetch(url, { credentials: 'include' })
  const data = await res.json()
  const msg = parseApiMessage<PaginatedFollowUps | PatientFollowUpRow[]>(data)
  if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
    return msg as PaginatedFollowUps
  }
  if (Array.isArray(msg)) {
    return { data: msg as PatientFollowUpRow[], total_count: msg.length }
  }
  return { data: [], total_count: 0 }
}

export async function getOpFollowUpVisits(
  params: GetFollowUpCandidatesParams = {},
): Promise<PaginatedFollowUpCandidates> {
  const sp = new URLSearchParams()
  if (params.search) sp.set('search', params.search)
  if (params.cost_center) sp.set('cost_center', params.cost_center)
  if (params.patient) sp.set('patient', params.patient)
  if (params.date_from) sp.set('date_from', params.date_from)
  if (params.date_to) sp.set('date_to', params.date_to)
  if (params.limit != null) sp.set('limit', String(params.limit))
  if (params.offset != null) sp.set('offset', String(params.offset))
  const url = `/api/method/healthcare.healthcare.doctype.patient_follow_up.patient_follow_up.get_op_follow_up_visits?${sp.toString()}`
  const res = await fetch(url, { credentials: 'include' })
  const data = await res.json()
  return parseApiMessage<PaginatedFollowUpCandidates>(data)
}

export async function getIpFollowUpAdmissions(
  params: GetFollowUpCandidatesParams = {},
): Promise<PaginatedFollowUpCandidates> {
  const sp = new URLSearchParams()
  if (params.search) sp.set('search', params.search)
  if (params.cost_center) sp.set('cost_center', params.cost_center)
  if (params.patient) sp.set('patient', params.patient)
  if (params.date_from) sp.set('date_from', params.date_from)
  if (params.date_to) sp.set('date_to', params.date_to)
  if (params.limit != null) sp.set('limit', String(params.limit))
  if (params.offset != null) sp.set('offset', String(params.offset))
  const url = `/api/method/healthcare.healthcare.doctype.patient_follow_up.patient_follow_up.get_ip_follow_up_admissions?${sp.toString()}`
  const res = await fetch(url, { credentials: 'include' })
  const data = await res.json()
  return parseApiMessage<PaginatedFollowUpCandidates>(data)
}

export type ReminderChannel = 'email' | 'whatsapp' | 'sms'

export interface FollowUpReferencePayload {
  reference_doctype: string
  reference_name: string
  follow_up_type: string
}

export async function sendFollowUpReminder(
  patientFollowUpName: string,
  channel: ReminderChannel = 'sms',
): Promise<{ sent: boolean; message?: string; channel?: string }> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const res = await fetch(
    '/api/method/healthcare.healthcare.doctype.patient_follow_up.patient_follow_up.send_follow_up_reminder',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ patient_follow_up_name: patientFollowUpName, channel }),
      credentials: 'include',
    },
  )
  const data = await res.json()
  if (data.exc) {
    throw new Error(data._server_messages ? JSON.parse(data._server_messages)[0] : 'Failed to send')
  }
  return data.message || { sent: false }
}

export async function sendFollowUpRemindersBulk(
  options: {
    status?: string
    cost_center?: string
    follow_up_type?: string
    search?: string
    channel?: ReminderChannel
  } = {},
): Promise<{ sent: number; total: number }> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const res = await fetch(
    '/api/method/healthcare.healthcare.doctype.patient_follow_up.patient_follow_up.send_follow_up_reminders_bulk',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({
        status: options.status || 'Open',
        cost_center: options.cost_center || undefined,
        follow_up_type: options.follow_up_type || undefined,
        search: options.search || undefined,
        channel: options.channel || 'sms',
      }),
      credentials: 'include',
    },
  )
  const data = await res.json()
  if (data.exc) {
    throw new Error(data._server_messages ? JSON.parse(data._server_messages)[0] : 'Failed to send')
  }
  return data.message || { sent: 0, total: 0 }
}

export async function sendFollowUpRemindersSelected(
  options: {
    names?: string[]
    references?: FollowUpReferencePayload[]
    channel?: ReminderChannel
  },
): Promise<{ sent: number; total: number }> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const res = await fetch(
    '/api/method/healthcare.healthcare.doctype.patient_follow_up.patient_follow_up.send_follow_up_reminders_selected',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({
        names: options.names || undefined,
        references: options.references || undefined,
        channel: options.channel || 'sms',
      }),
      credentials: 'include',
    },
  )
  const data = await res.json()
  if (data.exc) {
    throw new Error(data._server_messages ? JSON.parse(data._server_messages)[0] : 'Failed to send')
  }
  return data.message || { sent: 0, total: 0 }
}

export async function getCostCenters(): Promise<{ name: string; display?: string }[]> {
  const res = await fetch('/api/resource/Cost%20Center?fields=["name"]&limit_page_length=200')
  const data = await res.json()
  if (data.data && Array.isArray(data.data)) return data.data
  return []
}

export async function updateFollowUpStatus(patientFollowUpName: string, newStatus: string): Promise<void> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const res = await fetch(
    '/api/method/healthcare.healthcare.doctype.patient_follow_up.patient_follow_up.update_follow_up_status',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({
        patient_follow_up_name: patientFollowUpName,
        status: newStatus,
      }),
      credentials: 'include',
    },
  )
  const data = await res.json()
  if (data.exc) {
    throw new Error(data._server_messages ? JSON.parse(data._server_messages)[0] : 'Failed to update status')
  }
}
