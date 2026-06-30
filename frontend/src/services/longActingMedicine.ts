export type InjectionSide = 'LT' | 'RT'

export interface LongActingMedicineGiveOutRow {
  name?: string
  date?: string
  time?: string
  user?: string
  scheduled_run_date?: string
  notes?: string
  trans_no?: string
  dose?: string
  dose_term?: string
  medication?: string
  written_frequency?: string
  is_cancelled?: number | boolean
  cancelled_notes?: string
  nurse_flag?: string
  next_dose?: string
  lt_flag?: string
  rt_flag?: string
}

export function formatInjectionSide(value?: string | null): string {
  if (value === 'LT') return 'Left (L)'
  if (value === 'RT') return 'Right (R)'
  return '—'
}

export function formatInjectionSideShort(value?: string | null): string {
  if (value === 'LT') return 'L'
  if (value === 'RT') return 'R'
  return '—'
}

export function injectionSideFromGiveOut(
  row: LongActingMedicineGiveOutRow,
): InjectionSide | undefined {
  const lt = (row.lt_flag || '').trim()
  const rt = (row.rt_flag || '').trim()
  if (lt && lt !== '0' && lt.toLowerCase() !== 'n') return 'LT'
  if (rt && rt !== '0' && rt.toLowerCase() !== 'n') return 'RT'
  return undefined
}

export function suggestedNextInjectionSide(last?: string | null): InjectionSide {
  if (last === 'LT') return 'RT'
  if (last === 'RT') return 'LT'
  return 'LT'
}

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
  medication_label?: string
  default_dosage?: string
  default_dosage_form?: string
  practitioner?: string
  practitioner_name?: string
  doctors_remark?: string
  medications?: LongActingMedicineItem[]
  give_outs?: LongActingMedicineGiveOutRow[]
  last_give_out_date?: string
  last_give_out_time?: string
  last_give_out_by?: string
  is_given_out_for_current_run?: boolean
  can_give_out?: boolean
  can_stop?: boolean
  injection_given_on?: InjectionSide | string
}

export interface LongActingMedicineItem {
  name?: string
  drug?: string
  drug_name?: string
  dosage?: number | string
  dosage_form?: string
  instructions?: string
  patient_frequency?: string
  qty_per_cycle?: number | string
  is_active?: number | boolean
}

export async function fetchLongActingMedicine(name: string): Promise<LongActingMedicineRow> {
  const params = new URLSearchParams({ name })
  const res = await fetch(
    `/api/method/healthcare.api.common.get_long_acting_medicine?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc || data?.exc_type) throw new Error(data?.message || 'Failed to load long acting medicine')
  return (data?.message || {}) as LongActingMedicineRow
}

export async function fetchLongActingMedicineGiveOuts(
  name: string,
): Promise<LongActingMedicineGiveOutRow[]> {
  const params = new URLSearchParams({ name })
  const res = await fetch(
    `/api/method/healthcare.healthcare.doctype.long_acting_medicine.long_acting_medicine.get_long_acting_medicine_give_outs?${params.toString()}`,
  )
  const data = await res.json()
  if (data?.exc || data?.exc_type) {
    throw new Error(data?.message || 'Failed to load give-outs')
  }
  return Array.isArray(data?.message) ? (data.message as LongActingMedicineGiveOutRow[]) : []
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

export async function recordLongActingMedicineGiveOut(
  name: string,
  notes?: string,
  dose?: string,
  doseTerm?: string,
  injectionGivenOn?: InjectionSide,
): Promise<LongActingMedicineRow> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const res = await fetch(
    '/api/method/healthcare.healthcare.doctype.long_acting_medicine.long_acting_medicine.record_long_acting_medicine_give_out',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({
        name,
        notes: notes || undefined,
        dose: dose !== undefined ? dose : undefined,
        dose_term: doseTerm !== undefined ? doseTerm : undefined,
        injection_given_on: injectionGivenOn || undefined,
      }),
      credentials: 'include',
    },
  )
  const data = await res.json()
  if (data?.exc) throw new Error(data?.message || 'Failed to record give-out')
  return (data?.message || {}) as LongActingMedicineRow
}

export async function stopLongActingMedicine(
  name: string,
  reason?: string,
): Promise<LongActingMedicineRow> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const res = await fetch(
    '/api/method/healthcare.healthcare.doctype.long_acting_medicine.long_acting_medicine.stop_long_acting_medicine',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ name, reason: reason || undefined }),
      credentials: 'include',
    },
  )
  const data = await res.json()
  if (data?.exc) throw new Error(data?.message || 'Failed to stop long acting medicine')
  return (data?.message || {}) as LongActingMedicineRow
}
