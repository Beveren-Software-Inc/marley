export interface LabTest {
  name: string
  docstatus?: number
  patient: string
  patient_name?: string
  patient_age?: string
  patient_sex?: string
  gender?: string
  practitioner?: string
  practitioner_name?: string
  lab_test_name?: string
  template?: string
  status?: string
  date?: string
  result_date?: string
  submitted_date?: string
  female_min_range?: number | null
  female_max_range?: number | null
  male_min_range?: number | null
  male_max_range?: number | null
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
  lab_test_group?: string
  is_group_lab_test?: number
  reference_document?: string
  employee_name?: string
  employee?: string
  employee_designation?: string
  reviewed_by?: string
  material_request?: string
  amount?: number
  grand_total?: number
  min_range?: number | null
  max_range?: number | null
  results?: string | null
  descriptive_result?: string
  custom_result?: string
  lab_test_comment?: string
  /** Remarks table (Remark child): list of { rrmark } */
  remarks?: Array<{ rrmark?: string }>
  worksheet_instructions?: string
  normal_test_items?: any[]
  sensitivity_test_items?: any[]
  /** Patient Upload Document child table (same as Admission/Discharge) */
  documents?: Array<{ file_name?: string; document_type?: string; transaction_no?: string; upload_remarks?: string; document?: string }>
  /** Sample instances child table – one row per required/actual sample */
  sample_instances?: Array<{ sample?: string; sample_qty?: number; sample_details?: string; sample_collection?: string }>
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
  is_outsourced?: boolean,
  from_date?: string,
  to_date?: string,
  template?: string,
  patient_type?: string,
  by_nurse?: boolean
): Promise<LabTest[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (status) params.append('status', status)
  if (pending_review) params.append('pending_review', '1')
  if (is_outsourced !== undefined) params.append('is_outsourced', is_outsourced ? '1' : '0')
  if (from_date) params.append('from_date', from_date)
  if (to_date) params.append('to_date', to_date)
  if (template) params.append('template', template)
  if (patient_type) params.append('patient_type', patient_type)
  if (by_nurse !== undefined) params.append('by_nurse', by_nurse ? '1' : '0')

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
  cost_center: string
  template?: string
  practitioner?: string
  date?: string
  time?: string
  department?: string
  service_unit?: string
  status?: string
  documents?: Array<{ file_name?: string; document_type?: string; transaction_no?: string; upload_remarks?: string; document?: string }>
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

/** One editable row of Normal Test Result (compound lab test). */
export interface NormalTestResultRow {
  lab_test_name?: string
  lab_test_event?: string
  result_value?: string
  lab_test_uom?: string
  normal_range?: string
  lab_test_comment?: string
  template?: string
  secondary_uom?: string
  conversion_factor?: number
  secondary_uom_result?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  require_result_value?: boolean
  allow_blank?: boolean
}

/** Details fetched from a Lab Test Template for the result-entry UI. */
export interface LabTestTemplateDetails {
  lab_test_template_type?: string
  min_range?: number | null
  max_range?: number | null
  worksheet_instructions?: string
  sample_details?: string
  lab_test_uom?: string
  normal_range?: string
  /** Compound test rows from normal_test_templates child table on the template */
  normal_test_templates?: Array<{
    lab_test_event?: string
    lab_test_uom?: string
    normal_range?: string,
    female_min_range?: number | null
    male_min_range?: number | null
    female_max_range?: number | null
    male_max_range?: number | null
    result_type?: string
    result_mul_value?: string
  }>
}

/** One row in the Observation Sample Collection child table. */
export interface ObservationSampleCollectionRow {
  sample?: string
  sample_type?: string
  uom?: string
  status?: string
  observation_template?: string
  collection_date_time?: string
  sample_qty?: number
  collection_point?: string
  collected_by?: string
  medical_department?: string
  specimen?: string
}

export async function fetchLabTestTemplateDetails(template: string): Promise<LabTestTemplateDetails> {
  const res = await fetch(
    `/api/method/healthcare.api.lab_test.get_lab_test_template_details?template=${encodeURIComponent(template)}`
  )
  const data = await res.json()
  return (data?.message || {}) as LabTestTemplateDetails
}

export interface SaveAndSubmitLabTestInput {
  custom_result?: string
  lab_test_comment?: string
  worksheet_instructions?: string
  documents?: Array<{ file_name?: string; document_type?: string; transaction_no?: string; upload_remarks?: string; document?: string }>
  normal_test_items?: NormalTestResultRow[]
  submit?: boolean
  amount?: number
  discount_margin?: string
  discount?: number
  discount_amount?: number
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

export interface UpdateLabTestBasicInput {
  template?: string
  practitioner?: string
  department?: string
  service_unit?: string
  date?: string
  time?: string
  status?: string
  priority?: string
  is_outsourced?: number
  outsource_lab_name?: string
  outsource_ref_no?: string
}

export async function updateLabTestBasic(
  labTestName: string,
  payload: UpdateLabTestBasicInput
): Promise<LabTest> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<LabTest>(
    '/api/method/healthcare.api.lab_test.update_lab_test_basic',
    {
      method: 'POST',
      body: JSON.stringify({ name: labTestName, data: payload }),
    }
  )
}

/** One row in the Lab Test remarks table (Remark child with field rrmark). */
export interface LabTestRemarkRow {
  rrmark?: string
}

export async function updateLabTestRemarks(labTestName: string, remarks: LabTestRemarkRow[]): Promise<{ name: string; remarks: LabTestRemarkRow[] }> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<{ name: string; remarks: LabTestRemarkRow[] }>(
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
  new_status: 'Reviewed' | 'Rejected'
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

export async function finishGroupLabTests(
  serviceRequestName: string
): Promise<{ ok: boolean; service_request: string; finished: boolean }> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<{ ok: boolean; service_request: string; finished: boolean }>(
    '/api/method/healthcare.api.lab_test.finish_group_lab_tests',
    {
      method: 'POST',
      body: JSON.stringify({
        service_request_name: serviceRequestName,
      }),
    }
  )
}

export async function createSampleCollectionForLabSample(
  labTestName: string,
  rowIndex: number,
  sampleDetails?: string,
  collectionPoint?: string,
  referringPractitioner?: string,
  observationRows?: ObservationSampleCollectionRow[]
): Promise<{ sample_collection: string }> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<{ sample_collection: string }>(
    '/api/method/healthcare.api.lab_test.create_sample_collection_for_lab_sample',
    {
      method: 'POST',
      body: JSON.stringify({
        lab_test_name: labTestName,
        row_index: rowIndex,
        sample_details: sampleDetails,
        collection_point: collectionPoint,
        referring_practitioner: referringPractitioner,
        observation_rows: observationRows?.length ? observationRows : undefined,
      }),
    }
  )
}


export function getLabTestUrl(name: string): string {
  return `/healthcare/lab-test/${name}`
}


export async function fetchLabTestsByInpatientRecord(
  inpatientRecord: string
): Promise<LabTest[]> {
  if (!inpatientRecord) {
    console.error('Inpatient record ID is required')
    return []
  }

  try {
    const response = await fetch(
      `/api/method/healthcare.api.lab_test.get_lab_tests_by_inpatient_record?inpatient_record=${encodeURIComponent(inpatientRecord)}`
    )
    const resData = await response.json()
    console.log('Fetch lab tests by inpatient record response:', resData)
    if (resData?.message && Array.isArray(resData.message)) {
      return resData.message as LabTest[]
    }
    
    return []
  } catch (error) {
    console.error('Failed to fetch lab tests by inpatient record:', error)
    return []
  }
}

// NEW: Fetch lab test by ID
export async function fetchLabTestById(name: string): Promise<LabTest | null> {
  if (!name) {
    throw new Error('Lab test ID is required')
  }

  try {
    const response = await fetch(
      `/api/method/healthcare.api.lab_test.get_lab_test_by_id?name=${encodeURIComponent(name)}`
    )
    const resData = await response.json()
    
    if (resData?.message) {
      return resData.message as LabTest
    }
    
    return null
  } catch (error) {
    console.error('Failed to fetch lab test:', error)
    throw error
  }
}
