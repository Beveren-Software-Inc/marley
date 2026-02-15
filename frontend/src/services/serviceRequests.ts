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
  patient_accepted_cost?: boolean | number
  booked?: boolean | number
  order_group?: string
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
    // Extract error message from Frappe response
    const errorMessage = resData?.exc_type 
      ? `${resData.exc_type}: ${resData.exc || resData.message || 'Failed to create lab test from service request'}`
      : resData?.exc || resData?.message || 'Failed to create lab test from service request'
    throw new Error(errorMessage)
  }
}

export interface CreateServiceRequestData {
  patient: string
  template_dt: string
  template_dn: string
  practitioner?: string
  order_date?: string
  order_time?: string
  department?: string
  status?: string
  priority?: string
  intent?: string
  quantity?: number
  occurrence_date?: string
  occurrence_time?: string
}

export async function createServiceRequest(data: CreateServiceRequestData): Promise<ServiceRequest> {
  const response = await fetch(
    '/api/method/healthcare.api.service_request.create_service_request',
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
    return resData.message as ServiceRequest
  } else {
    throw new Error(resData?.exc_type ? resData.exc : 'Failed to create service request')
  }
}

/** Confirm payment (patient accepted cost). Required before Book Lab for Lab Test Template. */
export async function confirmPayment(serviceRequestName: string): Promise<{ ok: boolean; patient_accepted_cost: number }> {
  const csrf = (window as any).csrf_token
  const response = await fetch(
    `/api/method/healthcare.api.service_request.confirm_payment?service_request_name=${encodeURIComponent(serviceRequestName)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
      },
      credentials: 'include'
    }
  )
  const resData = await response.json()
  if (resData?.message) return resData.message
  throw new Error(resData?.exc || 'Failed to confirm payment')
}

/** Book Lab: forward to laboratory and reflect approved amount on Patient Visit. Only for Lab Test Template when payment confirmed. */
export async function bookLabAndForward(serviceRequestName: string): Promise<{ lab_test: string; patient_visit?: string }> {
  const csrf = (window as any).csrf_token
  const response = await fetch(
    '/api/method/healthcare.healthcare.doctype.service_request.service_request.book_lab_and_forward',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
      },
      body: JSON.stringify({ service_request_name: serviceRequestName }),
      credentials: 'include'
    }
  )
  const resData = await response.json()
  if (resData?.message) return resData.message
  throw new Error(resData?.exc || 'Failed to book lab')
}



