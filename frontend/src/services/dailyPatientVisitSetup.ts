// services/dailyPatientVisit.ts

export interface DailyPatientVisitSetup {
  name?: string
  patient: string
  patient_name?: string
  admission?: string
  discharge?: string
  from_date: string
  to_date: string
  time: string
  session?: string
  is_active: boolean
  amount: number
}

export async function createDailyPatientVisitSetup(data: DailyPatientVisitSetup): Promise<DailyPatientVisitSetup> {
  const csrf = (window as any).csrf_token
      console.log('Creating Daily Patient Visit Setup with data:', data)

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
    throw new Error(resData.exc_type ? `${resData.exc_type}: ${resData.exc}` : resData.exc)
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
    throw new Error(resData.exc_type ? `${resData.exc_type}: ${resData.exc}` : resData.exc)
  }
  return resData.message
}

export async function fetchDailyPatientVisitSetups(
  patient?: string,
  activeOnly: boolean = false
): Promise<DailyPatientVisitSetup[]> {
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  if (activeOnly) params.append('active_only', '1')
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