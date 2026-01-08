export interface Appointment {
  name: string
  patient?: string
  patient_name?: string
  appointment_date?: string
  appointment_time?: string
  status?: string
  appointment_type?: string
  department?: string
  practitioner?: string
  practitioner_name?: string
}

export async function fetchPractitionerAppointments(
  limit: number = 50,
  offset: number = 0,
  status?: string
): Promise<Appointment[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (status) params.append('status', status)

  const response = await fetch(
    `/api/method/healthcare.api.patient_appointment.get_practitioner_appointments?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as Appointment[]
  } else {
    return []
  }
}

