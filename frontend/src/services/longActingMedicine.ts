export interface LongActingMedicineRow {
  name: string
  patient?: string
  patient_name?: string
  frequency?: string
  start_date?: string
  end_date?: string
  next_run_date?: string
  status?: string
  remarks?: string
  drug_name?: string
}

export type ReminderChannel = 'email' | 'whatsapp' | 'sms'

export async function sendLongActingMedicineReminder(
  name: string,
  channel: ReminderChannel = 'email'
): Promise<{ sent: boolean; channel: string }> {
  const res = await fetch(
    '/api/method/healthcare.api.common.send_long_acting_medicine_reminder',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, channel }),
    }
  )
  const data = await res.json()
  if (data?.exc) throw new Error(data?.message || 'Failed to send reminder')
  return (data?.message as { sent: boolean; channel: string }) || { sent: true, channel }
}

export async function updateLongActingMedicineRemarks(
  name: string,
  remarks: string
): Promise<{ name: string; remarks: string }> {
  const res = await fetch(
    '/api/method/healthcare.api.common.update_long_acting_medicine_remarks',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, remarks }),
    }
  )
  const data = await res.json()
  if (data?.exc) throw new Error(data?.message || 'Failed to update remarks')
  return (data?.message as { name: string; remarks: string }) || { name, remarks }
}

export async function fetchLongActingMedicineList(
  patient: string,
  limit: number = 50,
  offset: number = 0
): Promise<LongActingMedicineRow[]> {
  const params = new URLSearchParams()
  params.set('patient', patient)
  params.set('limit', limit.toString())
  params.set('offset', offset.toString())
  const res = await fetch(
    `/api/method/healthcare.api.common.get_long_acting_medicine_list?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc) {
    throw new Error(data?.message || 'Failed to fetch long acting medicine list')
  }
  return Array.isArray(data?.message) ? (data.message as LongActingMedicineRow[]) : []
}
