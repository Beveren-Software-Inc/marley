export interface LongActingMedicineRow {
  name: string
  patient?: string
  patient_name?: string
  frequency?: string
  start_date?: string
  end_date?: string
  next_run_date?: string
  status?: string
}

export async function sendLongActingMedicineReminder(name: string): Promise<{ sent: boolean }> {
  const res = await fetch(
    '/api/method/healthcare.api.common.send_long_acting_medicine_reminder',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }
  )
  const data = await res.json()
  if (data?.exc) {
    throw new Error(data?.message || 'Failed to send reminder')
  }
  return (data?.message as { sent: boolean }) || { sent: true }
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
