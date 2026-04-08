export interface SickLeaveRow {
  name: string
  admission_no: string | null
  patient: string | null
  patient_name: string | null
  from_date: string | null
  to_date: string | null
  days: string | null
  diagnosis: string | null
  doctor: string | null
  source: string | null
  creation: string
}

export interface CreateSickLeaveInput {
  admission_no?: string
  patient?: string
  patient_name?: string
  from_date: string
  to_date?: string
  days?: string
  diagnosis?: string
  doctor?: string
  source?: string
  patient_visit?: string
}

export async function fetchSickLeaves(
  patient?: string,
  search?: string,
  page = 1,
  pageSize = 50
): Promise<SickLeaveRow[]> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (patient) params.set('patient', patient)
  if (search) params.set('search', search)

  const res = await fetch(`/api/method/healthcare.api.common.get_sick_leaves?${params}`)
  const data = await res.json()
  const msg = data?.message
  if (msg?.success) return msg.data as SickLeaveRow[]
  if (Array.isArray(msg)) return msg as SickLeaveRow[]
  return []
}

export async function createSickLeave(
  input: CreateSickLeaveInput
): Promise<{ success: boolean; name?: string; message?: string }> {
  const csrfToken = (window as unknown as Record<string, string>).csrf_token || ''
  const res = await fetch('/api/method/healthcare.api.common.create_sick_leave', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ data: JSON.stringify(input) }),
  })
  const data = await res.json()
  return data?.message ?? { success: false, message: 'Unknown error' }
}
