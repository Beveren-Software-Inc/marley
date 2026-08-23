export interface MainNursingNoteEntryRow {
  name?: string
  note?: string | null
  note_time?: string | null
  authored_by?: string | null
  authored_by_name?: string | null
  creation?: string
  idx?: number
}

export interface MainNursingNoteRow {
  name: string
  trans_no: string | null
  admission: string | null
  file_no: string | null
  patient_name: string | null
  date: string | null
  data: string | null
  shift: string | null
  nursing_notes: string | null
  user: string | null
  user_name: string | null
  last_appended_by?: string | null
  last_appended_by_name?: string | null
  authors?: string[]
  entries?: MainNursingNoteEntryRow[]
  cost_center: string | null
  creation: string
  modified?: string
}

export type CreateMainNursingNoteInput = {
  admission?: string
  file_no?: string
  patient_name?: string
  date?: string
  data?: string
  shift?: string
  nursing_notes?: string
  user?: string
  user_name?: string
  cost_center?: string
  admission_old_no?: string
}

function parseApiMessage<T>(data: { message?: unknown }): T | null {
  const msg = data?.message
  if (msg && typeof msg === 'object' && (msg as { success?: boolean }).success) {
    return msg as T
  }
  return null
}

export type MainNursingNoteListFilters = {
  dateFrom?: string
  dateTo?: string
  practitioner?: string
  shift?: string
}

export async function fetchMainNursingNotes(
  patient?: string,
  search?: string,
  admission?: string,
  page = 1,
  pageSize = 50,
  listFilters?: MainNursingNoteListFilters
): Promise<MainNursingNoteRow[]> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (patient) params.set('patient', patient)
  if (search) params.set('search', search)
  if (admission) params.set('admission', admission)
  if (listFilters?.dateFrom) params.set('date_from', listFilters.dateFrom)
  if (listFilters?.dateTo) params.set('date_to', listFilters.dateTo)
  if (listFilters?.practitioner) params.set('practitioner', listFilters.practitioner)
  if (listFilters?.shift) params.set('shift', listFilters.shift)

  const res = await fetch(
    `/api/method/healthcare.api.common.get_main_nursing_notes?${params}`
  )
  const data = await res.json()
  const msg = parseApiMessage<{ data: MainNursingNoteRow[] }>(data)
  if (msg?.data) return msg.data
  if (Array.isArray(data?.message)) return data.message as MainNursingNoteRow[]
  return []
}

export async function fetchNextMainNursingNoteTransNo(): Promise<string> {
  const res = await fetch(
    '/api/method/healthcare.api.common.get_next_main_nursing_note_trans_no'
  )
  const data = await res.json()
  const msg = data?.message
  return typeof msg === 'string' ? msg : ''
}

export async function createMainNursingNote(
  input: CreateMainNursingNoteInput
): Promise<{ success: boolean; name?: string; trans_no?: string; appended?: boolean; message?: string }> {
  const csrfToken = (window as unknown as Record<string, string>).csrf_token || ''
  const res = await fetch('/api/method/healthcare.api.common.create_main_nursing_note', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ data: JSON.stringify(input) }),
  })
  const data = await res.json()
  const msg = data?.message
  return msg ?? { success: false, message: 'Unknown error' }
}

export type UpdateMainNursingNoteInput = {
  name: string
  append_notes: string
  time?: string
}

export async function updateMainNursingNote(
  input: UpdateMainNursingNoteInput
): Promise<{ success: boolean; name?: string; nursing_notes?: string; message?: string }> {
  const csrfToken = (window as unknown as Record<string, string>).csrf_token || ''
  const res = await fetch('/api/method/healthcare.api.common.update_main_nursing_note', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ data: JSON.stringify(input) }),
  })
  const data = await res.json()
  const msg = data?.message
  return msg ?? { success: false, message: 'Unknown error' }
}
