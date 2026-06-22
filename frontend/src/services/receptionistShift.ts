import { apiRequest } from './apiClient'

const BASE = '/api/method/healthcare.api.receptionist_shift'

export type ReceptionistShift = {
  name: string
  status: 'Open' | 'Closed'
  user: string
  user_full_name?: string
  company?: string
  cost_center?: string
  opened_at?: string
  closed_at?: string
  opening_notes?: string
  closing_notes?: string
}

export type ReceptionistShiftContext = {
  enabled: boolean
  shift_required: boolean
  open_shift: ReceptionistShift | null
  company?: string
  cost_center?: string
}

export async function fetchReceptionistShiftContext(): Promise<ReceptionistShiftContext> {
  return apiRequest<ReceptionistShiftContext>(`${BASE}.get_receptionist_shift_context`)
}

export async function openReceptionistShift(input?: {
  opening_notes?: string
  company?: string
  cost_center?: string
}): Promise<ReceptionistShift> {
  return apiRequest<ReceptionistShift>(`${BASE}.open_receptionist_shift`, {
    method: 'POST',
    body: JSON.stringify({ data: input ?? {} }),
  })
}

export async function closeReceptionistShift(input?: {
  name?: string
  closing_notes?: string
}): Promise<ReceptionistShift> {
  return apiRequest<ReceptionistShift>(`${BASE}.close_receptionist_shift`, {
    method: 'POST',
    body: JSON.stringify({ data: input ?? {}, name: input?.name }),
  })
}
