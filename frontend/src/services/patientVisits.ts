export interface PatientVisit {
  name: string
  patient: string
  patient_name: string
  status: 'Open' | 'Ordered' | 'Completed' | 'Cancelled'
  encounter_date: string
  encounter_time?: string
  practitioner: string
  practitioner_name?: string
  medical_department?: string
  visit_type?: string
  file_number?: string
  inpatient_record?: string
  inpatient_status?: string
  appointment?: string
  company?: string
}

export async function fetchPatientVisits(status?: string, search?: string, patient?: string) {
  const params = new URLSearchParams()
  if (status) params.append('status', status)
  if (search) params.append('search', search)
  if (patient) params.append('patient', patient)
  
  const url = `/api/method/healthcare.api.patient_visit.get_patient_visits${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as PatientVisit[]
  } else {
    throw new Error('Invalid response format')
  }
}

export async function fetchPatientVisit(name: string) {
  const response = await fetch(
    `/api/method/healthcare.api.patient_visit.get_patient_visit?name=${encodeURIComponent(name)}`
  )
  const resData = await response.json()

  if (resData?.message) {
    return resData.message as PatientVisit
  } else {
    throw new Error('Invalid response format')
  }
}

export interface PatientVisitTypeOption {
  name: string
  visit_type: string
}

/** Fetch Patient Visit Type list for dropdown (ECG, ECT, IOP, follow-up, etc.) */
export async function fetchPatientVisitTypes(): Promise<PatientVisitTypeOption[]> {
  const response = await fetch(
    '/api/resource/Patient%20Visit%20Type?fields=["name","visit_type"]&limit_page_length=100'
  )
  const resData = await response.json()
  if (resData?.data && Array.isArray(resData.data)) {
    return resData.data as PatientVisitTypeOption[]
  }
  return []
}





export async function cancelVisit(visitName: string, reason: string): Promise<void> {
  const response = await fetch(`/api/method/healthcare.api.patient_visit.cancel_patient_visit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visit_name: visitName, reason_for_cancel: reason })
  })

  const resData = await response.json()
  if (resData?.message !== 'success') {
    throw new Error(resData?.message || 'Failed to cancel visit')
  }
}


// Create an invoice for a visit
export async function createInvoice(visitName: string): Promise<string> {
  const response = await fetch(`/api/method/healthcare.api.patient_visit.create_invoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visit_name: visitName })
  })
  const resData = await response.json()
  if (!resData?.message) {
    throw new Error('Failed to create invoice')
  }
  return resData.message as string // return invoice name/id
}