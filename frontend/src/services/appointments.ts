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

export interface CreateAppointmentData {
  patient: string
  appointment_type: string
  appointment_date: string
  appointment_time?: string
  practitioner?: string
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

export async function fetchAllAppointments(
  limit: number = 50,
  offset: number = 0,
  status?: string,
  patient?: string
): Promise<Appointment[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (status) params.append('status', status)
  if (patient) params.append('patient', patient)

  const response = await fetch(
    `/api/method/healthcare.api.patient_appointment.get_all_appointments?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as Appointment[]
  } else {
    return []
  }
}

export async function createAppointment(data: CreateAppointmentData): Promise<Appointment> {
  const response = await fetch(
    '/api/method/healthcare.api.patient_appointment.create_appointment',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data })
    }
  )
  const resData = await response.json()

  if (resData?.message) {
    return resData.message as Appointment
  } else {
    throw new Error(resData?.exc_type ? resData.exc : 'Failed to create appointment')
  }
}

