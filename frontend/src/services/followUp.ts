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
}

export interface GetFollowUpsParams {
  status?: string
  cost_center?: string
  limit?: number
  offset?: number
}

export async function getFollowUps(params: GetFollowUpsParams = {}): Promise<PatientFollowUpRow[]> {
  const sp = new URLSearchParams()
  if (params.status) sp.set('status', params.status)
  if (params.cost_center) sp.set('cost_center', params.cost_center)
  if (params.limit != null) sp.set('limit', String(params.limit))
  if (params.offset != null) sp.set('offset', String(params.offset))
  const url = `/api/method/healthcare.healthcare.doctype.patient_follow_up.patient_follow_up.get_follow_ups?${sp.toString()}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.exc) throw new Error(data._server_messages ? JSON.parse(data._server_messages)[0] : 'Failed to fetch')
  return (data.message || []) as PatientFollowUpRow[]
}

export async function sendFollowUpReminder(patientFollowUpName: string): Promise<{ sent: boolean; message?: string }> {
  const csrf = (window as any).csrf_token
  const res = await fetch('/api/method/healthcare.healthcare.doctype.patient_follow_up.patient_follow_up.send_follow_up_reminder', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ patient_follow_up_name: patientFollowUpName }),
    credentials: 'include',
  })
  const data = await res.json()
  if (data.exc) throw new Error(data._server_messages ? JSON.parse(data._server_messages)[0] : 'Failed to send')
  return data.message || { sent: false }
}

export async function sendFollowUpRemindersBulk(status?: string, cost_center?: string): Promise<{ sent: number; total: number }> {
  const csrf = (window as any).csrf_token
  const res = await fetch('/api/method/healthcare.healthcare.doctype.patient_follow_up.patient_follow_up.send_follow_up_reminders_bulk', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ status: status || 'Open', cost_center: cost_center || undefined }),
    credentials: 'include',
  })
  const data = await res.json()
  if (data.exc) throw new Error(data._server_messages ? JSON.parse(data._server_messages)[0] : 'Failed to send')
  return data.message || { sent: 0, total: 0 }
}

export async function getCostCenters(): Promise<{ name: string; display?: string }[]> {
  const res = await fetch('/api/resource/Cost%20Center?fields=["name"]&limit_page_length=200')
  const data = await res.json()
  if (data.data && Array.isArray(data.data)) return data.data
  return []
}
