export interface MentalStateRow {
  name: string
  admission_no: string | null
  file_no: string | null
  patient_name: string | null
  branch: string | null
  trans_shift: number | null
  normal_at: string | null
  // Behaviour
  cooperative: 0 | 1
  aggressive: 0 | 1
  paranoid: 0 | 1
  demanding: 0 | 1
  preoccupied: 0 | 1
  defence: 0 | 1
  impulsive: 0 | 1
  sedative: 0 | 1
  // Speech
  normal_s: 0 | 1
  rapid: 0 | 1
  slow: 0 | 1
  poor_sp: 0 | 1
  slurred: 0 | 1
  coherent: 0 | 1
  incoherent: 0 | 1
  talkative: 0 | 1
  // Mood / Affect
  anxious: 0 | 1
  angry: 0 | 1
  depressed: 0 | 1
  elated: 0 | 1
  euthymic: 0 | 1
  irritable: 0 | 1
  // Motor
  twitches: 0 | 1
  hyperactive: 0 | 1
  stereotypes: 0 | 1
  restless: 0 | 1
  gait: 0 | 1
  tics: 0 | 1
  agitated: 0 | 1
  abnormal: 0 | 1
  hallucinatory_behaviour: 0 | 1
  // Orientation
  place: string | null
  time: string | null
  normal_ap: 0 | 1
  person: string | null
  // Appetite
  increased: 0 | 1
  poor_ap: 0 | 1
  reported: 0 | 1
  non_reported: 0 | 1
  normal_b: 0 | 1
  reported_type: string | null
  // Sleep
  sleep_duration: number | null
  normal_sleep: 0 | 1
  disturbed: 0 | 1
  intermittent: 0 | 1
  excessive: 0 | 1
  a_little: 0 | 1
  // Consciousness
  conscious: 0 | 1
  alert: 0 | 1
  disturbed_con: 0 | 1
  creation: string
}

export type CreateMentalStateInput = Omit<MentalStateRow, 'name' | 'creation'>

export async function fetchMentalStates(
  patient?: string,
  search?: string,
  page = 1,
  pageSize = 50
): Promise<MentalStateRow[]> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (patient) params.set('patient', patient)
  if (search) params.set('search', search)

  const res = await fetch(
    `/api/method/healthcare.api.common.get_mental_states?${params}`
  )
  const data = await res.json()
  const msg = data?.message
  if (msg?.success) return msg.data as MentalStateRow[]
  if (Array.isArray(msg)) return msg as MentalStateRow[]
  return []
}

export async function createMentalState(
  input: Partial<CreateMentalStateInput>
): Promise<{ success: boolean; name?: string; message?: string }> {
  const csrfToken =
    (window as unknown as Record<string, string>).csrf_token || ''
  const res = await fetch(
    '/api/method/healthcare.api.common.create_mental_state',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Frappe-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ data: JSON.stringify(input) }),
    }
  )
  const data = await res.json()
  const msg = data?.message
  return msg ?? { success: false, message: 'Unknown error' }
}
