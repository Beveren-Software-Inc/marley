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

export async function fetchPatientVisits(status?: string, search?: string) {
  const params = new URLSearchParams()
  if (status) params.append('status', status)
  if (search) params.append('search', search)
  
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





