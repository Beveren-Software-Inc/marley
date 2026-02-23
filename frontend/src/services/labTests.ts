export interface LabTest {
  name: string
  docstatus?: number
  patient: string
  patient_name?: string
  patient_age?: string
  patient_sex?: string
  practitioner?: string
  practitioner_name?: string
  lab_test_name?: string
  template?: string
  status?: string
  date?: string
  result_date?: string
  submitted_date?: string
  approved_date?: string
  expected_result_date?: string
  printed_on?: string
  invoiced?: number
  email_sent?: number | boolean
  sms_sent?: number | boolean
  printed?: number | boolean
  amended_from?: string
  sample?: string
  department?: string
  is_outsourced?: number
  email?: string
  mobile?: string
  report_preference?: string
  inpatient_record?: string
  service_unit?: string
  company?: string
  requesting_department?: string
  service_request?: string
  reference_document?: string
  employee_name?: string
  employee?: string
  employee_designation?: string
  reviewed_by?: string
  material_request?: string
  descriptive_result?: string
  custom_result?: string
  lab_test_comment?: string
  remarks?: string
  worksheet_instructions?: string
  normal_test_items?: any[]
  sensitivity_test_items?: any[]
}

export interface LabConsumableRow {
  item_code: string
  item_name?: string
  qty: number
  uom?: string
  warehouse?: string
}

export async function fetchLabTests(
  limit: number = 50,
  offset: number = 0,
  patient?: string,
  status?: string,
  pending_review: boolean = false,
  is_outsourced?: boolean
): Promise<LabTest[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (status) params.append('status', status)
  if (pending_review) params.append('pending_review', '1')
  if (is_outsourced !== undefined) params.append('is_outsourced', is_outsourced ? '1' : '0')

  const response = await fetch(
    `/api/method/healthcare.api.lab_test.get_lab_tests?${params.toString()}`
  )
  const resData = await response.json()
  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LabTest[]
  } else {
    return []
  }
}

export async function fetchLabTest(name: string): Promise<LabTest> {
  const response = await fetch(
    `/api/method/healthcare.api.lab_test.get_lab_test?name=${encodeURIComponent(name)}`
  )
  const resData = await response.json()

  if (resData?.message) {
    return resData.message as LabTest
  } else {
    throw new Error('Invalid response format')
  }
}

export async function getLabTestConsumables(name: string): Promise<LabConsumableRow[]> {
  const response = await fetch(
    `/api/method/healthcare.healthcare.doctype.lab_test.lab_test.get_consumables_for_lab_test?lab_test_name=${encodeURIComponent(
      name
    )}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    // Backend returns objects with item_code, item_name, qty, uom, warehouse
    return resData.message as LabConsumableRow[]
  } else {
    return []
  }
}

export interface CreateLabTestData {
  patient: string
  template?: string
  practitioner?: string
  date?: string
  time?: string
  department?: string
  service_unit?: string
  status?: string
}

export async function createLabTest(data: CreateLabTestData): Promise<LabTest> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const response = await fetch('/api/method/healthcare.api.lab_test.create_lab_test', {
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

  if (!response.ok) {
    const errorMessage = resData?.message?.message || resData?.message || 'Failed to create lab test'
    throw new Error(errorMessage)
  }

  if (resData?.message) {
    return resData.message as LabTest
  } else {
    throw new Error('Invalid response format')
  }
}

export async function requestLabConsumables(
  labTestName: string,
  items: LabConsumableRow[],
  company?: string
): Promise<string> {
  const { apiRequest } = await import('./apiClient')

  const payload: any = {
    lab_test: labTestName,
    items,
  }

  if (company) {
    payload.company = company
  }

  const mrName = await apiRequest<string>(
    '/api/method/healthcare.api.lab_test.request_lab_consumables',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )

  return mrName
}

export interface SaveAndSubmitLabTestInput {
  custom_result?: string
  lab_test_comment?: string
  worksheet_instructions?: string
  submit?: boolean
}

export async function saveAndSubmitLabTest(
  labTestName: string,
  payload: SaveAndSubmitLabTestInput
): Promise<LabTest> {
  const { apiRequest } = await import('./apiClient')

  const data = await apiRequest<LabTest>(
    '/api/method/healthcare.api.lab_test.save_and_submit_lab_test',
    {
      method: 'POST',
      body: JSON.stringify({
        name: labTestName,
        ...payload,
      }),
    }
  )

  return data
}

export async function updateLabTestRemarks(labTestName: string, remarks: string): Promise<{ name: string; remarks: string }> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<{ name: string; remarks: string }>(
    '/api/method/healthcare.api.lab_test.update_lab_test_remarks',
    {
      method: 'POST',
      body: JSON.stringify({ name: labTestName, remarks }),
    }
  )
}

import { apiRequest } from './apiClient'

export async function updateLabTestStatus(
  lab_test_name: string,
  new_status: 'Approved' | 'Rejected'
): Promise<void> {
  await apiRequest<void>(
    '/api/method/healthcare.api.lab_test.update_lab_test_status',
    {
      method: 'POST',
      body: JSON.stringify({
        lab_test_name,
        new_status,
      }),
    }
  )
}


export function getLabTestUrl(name: string): string {
  return `/healthcare/lab-test/${name}`
}