export interface ServiceRequest {
  name: string
  patient: string
  patient_name?: string
  practitioner?: string
  practitioner_name?: string
  template_dt?: string
  template_dn?: string
  template_name?: string
  status?: string
  order_date?: string
  order_time?: string
  occurrence_date?: string
  occurrence_time?: string
  medical_department?: string
  billing_status?: string
  priority?: string
  intent?: string
}

export async function fetchServiceRequests(
  limit: number = 50,
  offset: number = 0,
  patient?: string,
  template_dt?: string,
  status?: string
): Promise<ServiceRequest[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (template_dt) params.append('template_dt', template_dt)
  if (status) params.append('status', status)

  const response = await fetch(
    `/api/method/healthcare.api.service_request.get_service_requests?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as ServiceRequest[]
  } else {
    return []
  }
}

export async function createLabTestFromServiceRequest(serviceRequestName: string): Promise<{ name: string; patient: string; patient_name?: string; template?: string; lab_test_name?: string; status?: string }> {
  const response = await fetch(
    `/api/method/healthcare.api.service_request.create_lab_test_from_service_request?service_request=${encodeURIComponent(serviceRequestName)}`,
    {
      method: 'POST'
    }
  )
  const resData = await response.json()

  if (resData?.message) {
    return resData.message
  } else {
    throw new Error('Failed to create lab test from service request')
  }
}


