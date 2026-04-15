// services/dailyPatientVisit.ts

export interface DailyPatientVisitSetup {
  name?: string
  patient: string
  patient_name?: string
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