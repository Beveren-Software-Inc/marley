// services/dailyPatientVisit.ts

import { frappeErrorMessage } from '../utils/frappeErrorMessage'

export interface DailyPatientVisitSetupServiceLine {
  name?: string
  session: string
  amount: number
}

export interface DailyPatientVisitSetup {
  name?: string
  patient: string
  patient_name?: string
  file_no?: string
  /** Doctype field name (Healthcare Practitioner link). */
  practioner?: string
  practitioner_name?: string
  posting_date?: string
  creation?: string
  cr_date?: string
  admission?: string
  discharge?: string
  from_date: string
  to_date?: string | null
  time?: string | null
  /** Cost Center / branch for visits and sales orders created from this setup. */
  branch?: string | null
  /** First service session (legacy display). */
  session?: string
  services?: DailyPatientVisitSetupServiceLine[]
  is_active: boolean
  /** Sum of service line amounts. */
  amount: number
  /** Optional success message from API. */
  message?: string
}

export async function createDailyPatientVisitSetup(data: DailyPatientVisitSetup): Promise<DailyPatientVisitSetup> {
  const csrf = (window as any).csrf_token

  const response = await fetch('/api/method/healthcare.api.daily_patient_visit.create_daily_patient_visit_setup', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
    },
    body: JSON.stringify({ data })
  })
  const resData = await response.json()
  if (resData?.exc) {
    throw new Error(frappeErrorMessage(resData, 'Failed to create Daily Auto Visit setup'))
  }
  return resData.message
}

export async function updateDailyPatientVisitSetup(name: string, data: Partial<DailyPatientVisitSetup>): Promise<DailyPatientVisitSetup> {
  const csrf = (window as any).csrf_token
  const response = await fetch('/api/method/healthcare.api.daily_patient_visit.update_daily_patient_visit_setup', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
    },
    body: JSON.stringify({ name, data })
  })
  const resData = await response.json()
  if (resData?.exc) {
    throw new Error(frappeErrorMessage(resData, 'Failed to update Daily Auto Visit setup'))
  }
  return resData.message
}

export async function fetchDailyPatientVisitSetup(name: string): Promise<DailyPatientVisitSetup> {
  const res = await fetch(
    `/api/method/healthcare.api.daily_patient_visit.get_daily_patient_visit_setup?name=${encodeURIComponent(name)}`
  )
  const out = await res.json().catch(() => ({} as Record<string, unknown>))
  if (!res.ok || (out as Record<string, unknown>)?.exc) {
    const msg =
      (out as Record<string, unknown>)?.message ||
      (out as Record<string, unknown>)?.exc ||
      'Failed to load Daily Patient Visit Setup'
    throw new Error(typeof msg === 'string' ? msg : String(msg))
  }
  return (out as Record<string, unknown>).message as DailyPatientVisitSetup
}

export async function fetchDailyPatientVisitSetups(
  patient?: string,
  activeOnly: boolean = false,
  branch?: string
): Promise<DailyPatientVisitSetup[]> {
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  if (activeOnly) params.append('active_only', '1')
  if (branch) params.append('branch', branch)
  const res = await fetch(
    `/api/method/healthcare.api.daily_patient_visit.get_daily_patient_visit_setups?${params.toString()}`
  )
  const out = await res.json().catch(() => ({} as Record<string, unknown>))
  if (!res.ok || (out as Record<string, unknown>)?.exc) {
    const msg =
      (out as Record<string, unknown>)?.message ||
      (out as Record<string, unknown>)?.exc ||
      'Failed to load Daily Patient Visit Setup'
    throw new Error(typeof msg === 'string' ? msg : String(msg))
  }
  return (((out as Record<string, unknown>)?.message as DailyPatientVisitSetup[]) || [])
}

export async function stopDailyPatientVisitSetup(name: string): Promise<void> {
  const csrf = (window as any).csrf_token
  const res = await fetch('/api/method/healthcare.api.daily_patient_visit.stop_daily_patient_visit_setup', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ name }),
  })
  const out = await res.json().catch(() => ({} as Record<string, unknown>))
  if (!res.ok || (out as Record<string, unknown>)?.exc) {
    const msg =
      (out as Record<string, unknown>)?.message ||
      (out as Record<string, unknown>)?.exc ||
      'Failed to stop Daily Patient Visit Setup'
    throw new Error(typeof msg === 'string' ? msg : String(msg))
  }
}

export interface DailyPatientVisitBackfillResult {
  ok: boolean
  from_date: string
  to_date: string
  setups_matched: number
  setups_processed: number
  setups_skipped: number
  visits_created: number
  visits_already_existed: number
  existing_billed: number
  errors: number
}

export async function runDailyPatientVisitsBackfill(args: {
  fromDate: string
  toDate: string
  setupName?: string
  includeStopped?: boolean
}): Promise<DailyPatientVisitBackfillResult> {
  const csrf = (window as any).csrf_token
  const res = await fetch('/api/method/healthcare.api.daily_patient_visit.run_daily_patient_visits_backfill', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({
      from_date: args.fromDate,
      to_date: args.toDate,
      setup_name: args.setupName || undefined,
      include_stopped: args.includeStopped ? 1 : 0,
    }),
  })
  const out = await res.json().catch(() => ({} as Record<string, unknown>))
  if (!res.ok || (out as Record<string, unknown>)?.exc) {
    const msg =
      (out as Record<string, unknown>)?.message ||
      (out as Record<string, unknown>)?.exc ||
      'Failed to run Daily Auto Visit backfill'
    throw new Error(typeof msg === 'string' ? msg : String(msg))
  }
  return (out as Record<string, unknown>).message as DailyPatientVisitBackfillResult
}

export function normalizeSetupServices(setup: Partial<DailyPatientVisitSetup>): DailyPatientVisitSetupServiceLine[] {
  if (setup.services?.length) {
    return setup.services.map((line) => ({
      session: line.session || '',
      amount: Number(line.amount) || 0,
    }))
  }
  if (setup.session || setup.amount) {
    return [{ session: setup.session || '', amount: Number(setup.amount) || 0 }]
  }
  return [{ session: '', amount: 0 }]
}
