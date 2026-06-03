export interface DoctorOrderRow {
  name: string
  trans_no: string | null
  trans_date: string | null
  inpatient_admission: string | null
  patient: string | null
  patient_name: string | null
  cost_center: string | null
  doctor: string | null
  doctor_name: string | null
  doctor_entry_date: string | null
  doctor_order: string | null
  nurse: string | null
  nurse_name: string | null
  nurse_entry_date: string | null
  nurses_remarks: string | null
  status: string | null
  request: string | null
  creation: string
  modified?: string
}

export type CreateDoctorOrderInput = {
  inpatient_admission?: string
  patient?: string
  patient_name?: string
  cost_center?: string
  doctor?: string
  doctor_name?: string
  doctor_entry_date?: string
  doctor_order?: string
  request?: string
  trans_date?: string
}

export type UpdateDoctorOrderNurseInput = {
  name: string
  nurses_remarks?: string
  finished?: boolean
  nurse?: string
  nurse_name?: string
  nurse_entry_date?: string
}

function parseListResponse(data: { message?: unknown }): DoctorOrderRow[] {
  const msg = data?.message
  if (msg && typeof msg === 'object' && (msg as { success?: boolean }).success) {
    return ((msg as { data?: DoctorOrderRow[] }).data) || []
  }
  if (Array.isArray(msg)) return msg as DoctorOrderRow[]
  return []
}

export type DoctorOrderListFilters = {
  patient?: string
  admission?: string
  doctor?: string
  nurse?: string
  /** Empty = all statuses */
  status?: string
  page?: number
  pageSize?: number
}

export async function fetchDoctorOrders(
  filters: DoctorOrderListFilters = {}
): Promise<DoctorOrderRow[]> {
  const {
    patient,
    admission,
    doctor,
    nurse,
    status,
    page = 1,
    pageSize = 50,
  } = filters
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (patient) params.set('patient', patient)
  if (admission) params.set('admission', admission)
  if (doctor) params.set('doctor', doctor)
  if (nurse) params.set('nurse', nurse)
  if (status) params.set('status', status)

  const res = await fetch(`/api/method/healthcare.api.doctor_order.get_doctor_orders?${params}`)
  const data = await res.json()
  return parseListResponse(data)
}

export async function fetchNextDoctorOrderTransNo(): Promise<string> {
  const res = await fetch('/api/method/healthcare.api.doctor_order.get_next_doctor_order_trans_no')
  const data = await res.json()
  const msg = data?.message
  return typeof msg === 'string' ? msg : ''
}

export async function createDoctorOrder(
  input: CreateDoctorOrderInput
): Promise<{ success: boolean; name?: string; trans_no?: string; message?: string }> {
  const csrfToken = (window as unknown as Record<string, string>).csrf_token || ''
  const res = await fetch('/api/method/healthcare.api.doctor_order.create_doctor_order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ data: JSON.stringify(input) }),
  })
  const data = await res.json()
  return data?.message ?? { success: false, message: 'Unknown error' }
}

export async function setDoctorOrderStatus(
  name: string,
  status: 'Finished' | 'Canceled'
): Promise<{ success: boolean; name?: string; status?: string; message?: string }> {
  const csrfToken = (window as unknown as Record<string, string>).csrf_token || ''
  const res = await fetch('/api/method/healthcare.api.doctor_order.set_doctor_order_status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ name, status }),
  })
  const data = await res.json()
  return data?.message ?? { success: false, message: 'Unknown error' }
}

export async function updateDoctorOrderNurseResponse(
  input: UpdateDoctorOrderNurseInput
): Promise<{ success: boolean; name?: string; status?: string; message?: string }> {
  const csrfToken = (window as unknown as Record<string, string>).csrf_token || ''
  const res = await fetch(
    '/api/method/healthcare.api.doctor_order.update_doctor_order_nurse_response',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Frappe-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ data: JSON.stringify(input) }),
    }
  )
  const data = await res.json()
  return data?.message ?? { success: false, message: 'Unknown error' }
}
