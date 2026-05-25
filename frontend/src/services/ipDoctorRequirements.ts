export interface IpDoctorRequiredDocumentsStatus {
  patient: string
  admission?: string | null
  medical_history: boolean
  suicide_risk: boolean
  history_form: boolean
  all_complete: boolean
}

export interface OpDoctorRequiredDocumentsStatus {
  patient: string
  patient_visit?: string | null
  medical_history: boolean
  all_complete: boolean
}

export async function fetchIpDoctorRequiredDocumentsStatus(
  patient: string,
  admission?: string | null
): Promise<IpDoctorRequiredDocumentsStatus> {
  const params = new URLSearchParams({ patient })
  if (admission) params.append('admission', admission)

  const res = await fetch(
    `/api/method/healthcare.api.ip_doctor_requirements.get_ip_doctor_required_documents_status?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc) {
    throw new Error(data.exc || data.message || 'Failed to load required documents status')
  }
  const message = data?.message as IpDoctorRequiredDocumentsStatus | undefined
  if (!message) {
    throw new Error('Invalid response for required documents status')
  }
  return message
}

export async function fetchOpDoctorRequiredDocumentsStatus(
  patient: string,
  patientVisit?: string | null
): Promise<OpDoctorRequiredDocumentsStatus> {
  const params = new URLSearchParams({ patient })
  if (patientVisit) params.append('patient_visit', patientVisit)

  const res = await fetch(
    `/api/method/healthcare.api.ip_doctor_requirements.get_op_doctor_required_documents_status?${params.toString()}`
  )
  const data = await res.json()
  if (data?.exc) {
    throw new Error(data.exc || data.message || 'Failed to load required documents status')
  }
  const message = data?.message as OpDoctorRequiredDocumentsStatus | undefined
  if (!message) {
    throw new Error('Invalid response for required documents status')
  }
  return message
}
