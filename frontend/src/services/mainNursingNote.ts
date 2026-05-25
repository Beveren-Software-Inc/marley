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

export async function fetchMainNursingNotes(
  patient?: string,
  search?: string,
  admission?: string,
  page = 1,
  pageSize = 50
): Promise<MainNursingNoteRow[]> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (patient) params.set('patient', patient)
  if (search) params.set('search', search)
  if (admission) params.set('admission', admission)

  const res = await fetch(
    `/api/method/healthcare.api.common.get_main_nursing_notes?${params}`
  )
  const data = await res.json()
  const msg = parseApiMessage<{ data: MainNursingNoteRow[] }>(data)
  if (msg?.data) return msg.data
  if (Array.isArray(data?.message)) return data.message as MainNursingNoteRow[]
  return []
}

export async function createMainNursingNote(
  input: CreateMainNursingNoteInput
): Promise<{ success: boolean; name?: string; trans_no?: string; message?: string }> {
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
