import { apiRequest } from './apiClient'
import { ensureCSRF } from './apiClient'
import type { PatientDocumentRow } from './patients'


export interface InpatientOccupancy {
  service_unit?: string
  service_unit_name?: string
  check_in?: string
  check_out?: string
  left?: boolean | number
  invoiced?: number
}

export interface AdmissionCharges {
  admission_cost?: number
  case_management_fee?: number
  room_charges?: number
}

export interface InpatientRecord {
  name: string
  patient: string
  patient_name: string
  status: 'Admission Scheduled' | 'Admitted' | 'Discharge Scheduled' | 'Discharged' | 'Cancelled'
  scheduled_date: string
  admitted_datetime?: string
  admission_date?: string
  admission_time?: string
  expected_discharge?: string
  gender?: string
  blood_group?: string
  dob?: string
  mobile?: string
  email?: string
  phone?: string
  expected_length_of_stay?: number
  admission_ordered_for?: string
  company?: string
  cost_center?: string
  admission_by_cpr?: string
  reference_by?: string
  admission_service_unit_type?: string
  medical_department?: string
  primary_practitioner?: string
  secondary_practitioner?: string
  admission_doctor_name?: string
  admission_by_doctor?: string
  admission_by_nm?: string
  psychologist_doctor_name?: string
  psychologist_doctor?: string
  resident_doctor_name?: string
  residents_doctor_no?: string
  escort?: boolean | number
  guardian_name?: string
  contact_relationship?: string
  contact_mobile?: string
  contact_phone?: string
  contact_email?: string
  admission_encounter?: string
  current_occupancy?: InpatientOccupancy
  charges?: AdmissionCharges
  admission_cost?: number
  case_management_fee?: number
  room_charges?: number
  admission_practitioner?: string
  admission_instruction?: string
  weight?: number
  height?: number
  blood_pressure?: string
  pulse?: number
  temp?: number
  resp_rate?: number
  general_condition?: string
  cns?: string
  cvs_resp?: string
  git?: string
  others?: string
  allergies?: string
  medication_history?: string
  medical_history?: string
  surgical_history?: string
  discharge_ordered_date?: string
  discharge_datetime?: string
  discharge_instructions?: string
  discharge_note?: string
  followup_date?: string
  discharge_practitioner?: string
  admission_nursing_checklist_template?: string
  discharge_nursing_checklist_template?: string
  inpatient_occupancies?: InpatientOccupancy[]
  bed_no?: string
  service_unit_selections?: { service_unit?: string }[]
  patient_ip_category?: string
  patient_relatives?: {
    relative_relation?: string
    relationship_with_patient?: string
    relative_name?: string
    relative_id_num?: string
    cpr__id_no?: string
    relative_phone_no?: string
    relative_alternative_phone_no?: string
    relative_alternative_phone_no_2?: string
    relation_email?: string
    any_remarks?: string
  }[]
  patient_visitors?: PatientVisitorRow[]
  signature?: string
  e_signatures?: PatientDocumentRow[]
  patient_documents?: PatientDocumentRow[]
}

export interface PackageDetail {
  name: string
  admission_no: string
  from_date: string
  to_date: string
  total_days: number
  transaction_amount: number
  currency: string
  vch_status: string
  remarks?: string
}

export interface PackageDetailsResponse {
  packages: PackageDetail[]
  defaultCurrency: string
}

export interface ServiceUnit {
  name: string
  healthcare_service_unit_name: string
  service_unit_type: string
  occupancy_status: string
  company: string
  room_category?: string
  cost_center?: string
}

export interface HospitalBed {
  name: string
  bed_no: string
  service_unit?: string
  occupancy_status?: string
  room_category?: string
  company?: string
}

/** Bed No doctype (linked from Inpatient Admission.bed_no). */
export type BedNoRecord = Pick<HospitalBed, 'name' | 'bed_no' | 'service_unit' | 'occupancy_status'>

export interface ChecklistItem {
  action_required: string
  department?: string
  user?: string
  name1?: string
  date_time?: string
  click?: number
  description?: string
}


export interface InpatientRecordsPaginatedResponse {
  data: InpatientRecord[]
  total_count: number
}

export async function fetchInpatientRecords(
  status?: string,
  search?: string,
  patient?: string,
  practitioner?: string,
  fromDate?: string,
  toDate?: string,
  limit?: number,
  offset?: number,
  excludeCancelled?: boolean
): Promise<InpatientRecordsPaginatedResponse> {
  const params = new URLSearchParams()
  if (status) params.append('status', status)
  if (search) params.append('search', search)
  if (patient) params.append('patient', patient)
  if (practitioner) params.append('practitioner', practitioner)
  if (fromDate) params.append('from_date', fromDate)
  if (toDate) params.append('to_date', toDate)
  if (excludeCancelled) params.append('exclude_cancelled', '1')
  if (limit !== undefined) params.append('limit', limit.toString())
  if (offset !== undefined) params.append('offset', offset.toString())

  const url = `/api/method/healthcare.api.inpatient_admission.get_inpatient_records${params.toString() ? `?${params.toString()}` : ''}`
  const response = await fetch(url)
  const resData = await response.json()

  const msg = resData?.message
  if (msg && typeof msg === 'object' && 'data' in msg) {
    return { data: msg.data as InpatientRecord[], total_count: msg.total_count ?? 0 }
  }
  if (msg && Array.isArray(msg)) {
    return { data: msg as InpatientRecord[], total_count: msg.length }
  }
  throw new Error('Invalid response format')
}

export async function fetchInpatientRecord(name: string) {
  const response = await fetch(
    `/api/method/healthcare.api.inpatient_admission.get_inpatient_record?name=${encodeURIComponent(name)}`
  )
  const resData = await response.json()
  if (resData?.message) {
    return resData.message as InpatientRecord
  } else {
    throw new Error('Invalid response format')
  }
}

export async function updateInpatientAdmission(
  name: string,
  payload: Record<string, unknown>
): Promise<InpatientRecord> {
  return await apiRequest<InpatientRecord>(
    '/api/method/healthcare.api.inpatient_admission.update_inpatient_admission',
    {
      method: 'POST',
      body: JSON.stringify({ name, data: payload }),
    }
  )
}

export async function fetchPackageDetails(admissionNo: string): Promise<PackageDetailsResponse> {
  const response = await fetch(
    `/api/method/healthcare.api.inpatient_admission.get_package_details?admission_no=${encodeURIComponent(admissionNo)}`
  )
  const resData = await response.json()

  if (resData?.message) {
    // API returns { packages: [], default_currency: 'BHD' }
    if (resData.message.packages && Array.isArray(resData.message.packages)) {
      return {
        packages: resData.message.packages as PackageDetail[],
        defaultCurrency: resData.message.default_currency || 'BHD'
      }
    }
    // Fallback for old format
    if (Array.isArray(resData.message)) {
      return {
        packages: resData.message as PackageDetail[],
        defaultCurrency: 'BHD'
      }
    }
  }
  
  return { packages: [], defaultCurrency: 'BHD' }
}

export interface DurationPricing {
  duration_class: string
  duration_name?: string
  from_day: number
  to_day?: number
  amount: number
}

export interface InpatientPackage {
  name: string
  package_name: string
  package_category?: string
  category_name?: string
  no_of_days: number
  package_rate: number
  active: number
  cost_center?: string
  duration_pricing?: DurationPricing[]
}

export interface InpatientPackagesResponse {
  packages: InpatientPackage[]
  default_currency: string
}

export async function fetchInpatientPackages(category?: string, activeOnly: boolean = true): Promise<InpatientPackagesResponse> {
  const params = new URLSearchParams()
  if (category) params.append('category', category)
  if (!activeOnly) params.append('active_only', '0')
  
  const url = `/api/method/healthcare.api.inpatient_package.get_inpatient_packages${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  
  if (!response.ok) {
    console.error('Failed to fetch inpatient packages:', response.status, response.statusText)
    throw new Error(`Failed to fetch packages: ${response.statusText}`)
  }
  
  const resData = await response.json()

  if (resData?.message) {
    const result = {
      packages: resData.message.packages || [],
      default_currency: resData.message.default_currency || 'BHD'
    }
    console.log('Fetched inpatient packages:', result)
    return result
  }
  
  console.warn('No packages in response:', resData)
  return { packages: [], default_currency: 'BHD' }
}

export async function fetchServiceUnits(
  serviceUnitType?: string,
  occupancyStatus?: string,
  search?: string,
  roomCategory?: string,
  costCenter?: string
) {
  const params = new URLSearchParams()
  if (serviceUnitType) params.append('service_unit_type', serviceUnitType)
  if (occupancyStatus) params.append('occupancy_status', occupancyStatus)
  if (search) params.append('search', search)
  if (roomCategory) params.append('room_category', roomCategory)
  if (costCenter) params.append('cost_center', costCenter)

  const url = `/api/method/healthcare.api.inpatient_admission.get_service_units${params.toString() ? `?${params.toString()}` : ''}`
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as ServiceUnit[]
  } else {
    return []
  }
}

export async function fetchServiceUnitChargeItem(
  serviceUnit: string
): Promise<{ item_code?: string; service_unit_type?: string; rate?: number }> {
  const params = new URLSearchParams({ service_unit: serviceUnit })
  const response = await fetch(
    `/api/method/healthcare.api.inpatient_admission.get_service_unit_charge_item?${params.toString()}`
  )
  const resData = await response.json()
  if (resData?.message && typeof resData.message === 'object') {
    return resData.message as { item_code?: string; service_unit_type?: string; rate?: number }
  }
  return {}
}

export async function fetchMedicalSupervisionChargePreview(
  serviceUnit?: string
): Promise<{
  configured?: boolean
  template?: string
  service_name?: string
  item_code?: string
  rate?: number
  service_unit?: string
  service_unit_item_code?: string
}> {
  const params = new URLSearchParams()
  if (serviceUnit) params.append('service_unit', serviceUnit)
  const response = await fetch(
    `/api/method/healthcare.api.inpatient_admission.get_medical_supervision_charge_preview${params.toString() ? `?${params.toString()}` : ''}`
  )
  const resData = await response.json()
  if (resData?.message && typeof resData.message === 'object') {
    return resData.message as {
      configured?: boolean
      template?: string
      service_name?: string
      item_code?: string
      rate?: number
      service_unit?: string
      service_unit_item_code?: string
    }
  }
  return {}
}

export async function fetchBedNumbers(
  options?: {
    occupancyStatus?: string
    search?: string
    costCenter?: string
    /** Only beds linked to one of these Healthcare Service Unit / room names. */
    serviceUnitNames?: string[]
  }
) {
  const params = new URLSearchParams()
  if (options?.occupancyStatus) params.append('occupancy_status', options.occupancyStatus)
  if (options?.search) params.append('search', options.search)
  if (options?.costCenter) params.append('cost_center', options.costCenter)
  if (options?.serviceUnitNames !== undefined) {
    params.append('service_units', JSON.stringify(options.serviceUnitNames))
  }

  const url = `/api/method/healthcare.api.inpatient_admission.get_bed_numbers${params.toString() ? `?${params.toString()}` : ''}`
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as BedNoRecord[]
  }
  return []
}

/** @deprecated Use fetchBedNumbers — kept for older callers. */
export async function fetchHospitalBeds(
  options?: {
    occupancyStatus?: string
    search?: string
    roomCategory?: string
    company?: string
    costCenter?: string
    serviceUnitNames?: string[]
  }
) {
  return fetchBedNumbers({
    occupancyStatus: options?.occupancyStatus,
    search: options?.search,
    costCenter: options?.costCenter,
    serviceUnitNames: options?.serviceUnitNames,
  })
}

export interface TransferToCostCenterResult {
  transfer_admission_event: string
  inpatient_admission: string
  cost_center: string
  to_service_unit?: string
  billing?: {
    skipped?: boolean
    invoices?: string[]
    details?: Array<{ invoice: string; cost_center?: string | null }>
    split_by_cost_center?: boolean
    message?: string
  }
}

export interface PatientVisitorInput {
  visitors_name: string
  relationship_with_patient: string
  cpr__id_no?: string
  any_remarks?: string
}

export interface PatientVisitorRow extends PatientVisitorInput {
  name: string
  entered_by: string
  entered_date: string
}

export async function addPatientVisitor(admissionName: string, data: PatientVisitorInput): Promise<PatientVisitorRow> {
  const payload = {
    admission: admissionName,
    visitors_name: data.visitors_name,
    relationship_with_patient: data.relationship_with_patient,
    cpr__id_no: data.cpr__id_no,
    any_remarks: data.any_remarks,
  }
const csrf = await ensureCSRF()
  const res = await fetch('/api/method/healthcare.api.inpatient_admission.add_patient_visitor', {
    method: 'POST',
      
    headers: {
      'Content-Type': 'application/json',
...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),      
    },
    body: JSON.stringify(payload),
    credentials: 'include',
  })

  const out = await res.json()
  if (!res.ok || out?.exc) {
    const msg =
      (out && (out.message || out.exc || out._error_message)) ||
      `Failed to add visitor (${res.status})`
    throw new Error(msg)
  }

  return out.message as PatientVisitorRow
}

export async function transferToAnotherCostCenter(
  inpatientAdmission: string,
  toCostCenter: string,
  options?: { toServiceUnit?: string; reason?: string; transferDatetime?: string }
): Promise<TransferToCostCenterResult> {
  const body: Record<string, unknown> = {
    inpatient_admission: inpatientAdmission,
    to_cost_center: toCostCenter.trim(),
  }
  if (options?.toServiceUnit) body.to_service_unit = options.toServiceUnit
  if (options?.reason) body.reason = options.reason
  if (options?.transferDatetime) body.transfer_datetime = options.transferDatetime
  const csrf = await ensureCSRF()
  const res = await apiRequest<TransferToCostCenterResult>(
    '/api/method/healthcare.healthcare.doctype.inpatient_admission.inpatient_admission.transfer_to_another_cost_center',
    { method: 'POST', 
      credentials: 'include',
    headers: { 'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
     },
      body: JSON.stringify(body) }
  )
  return res
}

export async function calculatePackagePrice(packageName: string, days: number): Promise<{ total_price: number; base_rate: number; days: number }> {
  const params = new URLSearchParams()
  params.append('package_name', packageName)
  params.append('days', days.toString())
  
  const url = `/api/method/healthcare.api.inpatient_package.calculate_package_price?${params.toString()}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message) {
    return resData.message
  } else {
    throw new Error('Failed to calculate package price')
  }
}

export async function createAdmissionQuotation(
  admissionName: string,
  packageName: string,
  days: number,
  totalAmount: number,
  serviceUnit?: string
): Promise<{ success: boolean; sales_order_name: string; message: string }> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const response = await fetch(
    `/api/method/healthcare.api.inpatient_admission.create_admission_quotation`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
      },
      body: JSON.stringify({
        admission_name: admissionName,
        package_name: packageName,
        days: days,
        total_amount: totalAmount,
        service_unit: serviceUnit || null
      })
    }
  )
  
  const resData = await response.json()

  if (!response.ok) {
    throw new Error(resData.message || resData.exc || `Request failed with status ${response.status}`)
  }

  if (resData?.message) {
    return resData.message
  }
  
  throw new Error('Invalid response format')
}

export async function checkAdmissionQuotation(
  admissionName: string,
  packageName: string
): Promise<{ exists: boolean; quotation_name?: string }> {
  const params = new URLSearchParams()
  params.append('admission_name', admissionName)
  params.append('package_name', packageName)
  
  const url = `/api/method/healthcare.api.inpatient_admission.check_admission_quotation?${params.toString()}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message) {
    return resData.message
  }
  
  return { exists: false }
}


export async function admitPatient(
  inpatientRecordName: string,
  serviceUnit: string | undefined,
  checkIn: string,
  expectedDischarge?: string,
  patientDocuments?: {
    file_name?: string
    document_type?: string
    transaction_no?: string
    upload_remarks?: string
    document?: string
  }[],
  patientRelatives?: {
    relative_relation?: string
    relative_name?: string
    relative_id_num?: string
    any_remarks?: string
    relative_phone_no?: string
    relative_alternative_phone_no?: string
    relative_alternative_phone_no_2?: string
  }[],
  allServiceUnits?: string[],
  inpatientPackage?: string,
  ratePerDay?: number,
  standardPackage?: 0 | 1,
  hospitalBed?: string | null,
  bedNo?: string | null,
) {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const response = await fetch(
    `/api/method/healthcare.api.inpatient_admission.admit_patient`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
      },
      body: JSON.stringify({
        name: inpatientRecordName,
        service_unit: serviceUnit || null,
        check_in: checkIn,
        expected_discharge: expectedDischarge || null,
        service_units: allServiceUnits && allServiceUnits.length > 0 ? allServiceUnits : null,
        hospital_bed: hospitalBed || bedNo || null,
        bed_no: bedNo || hospitalBed || null,
        patient_documents: patientDocuments && patientDocuments.length > 0
          ? patientDocuments
          : null,
        patient_relatives: patientRelatives && patientRelatives.length > 0
          ? patientRelatives
          : null,
        inpatient_package: inpatientPackage || null,
        rate_per_day: ratePerDay ?? null,
        standard_package: standardPackage ?? null,
      })
    }
  )

  const resData = await response.json()

  if (!response.ok) {
    throw new Error(resData.message || resData.exc || `Request failed with status ${response.status}`)
  }

  if (resData?.message) {
    return resData.message
  }

  return resData
}

export async function scheduleDischarge(dischargeData: {
  patient: string
  inpatient_record: string
  discharge_practitioner?: string
  admission_nursing_checklist_template?: string
  discharge_nursing_checklist_template?: string
  discharge_ordered_datetime?: string
  followup_date?: string
  discharge_instructions?: string
  discharge_note?: string
}) {
  return await apiRequest(
    `/api/method/healthcare.healthcare.doctype.inpatient_admission.inpatient_admission.schedule_discharge`,
    {
      method: 'POST',
      body: JSON.stringify({ args: dischargeData })
    }
  )
}

export async function dischargePatient(inpatientRecordName: string) {
  return await apiRequest(
    `/api/method/healthcare.healthcare.doctype.inpatient_admission.inpatient_admission.discharge_patient`,
    {
      method: 'POST',
      body: JSON.stringify({ name: inpatientRecordName })
    }
  )
}

// Structured error for unbilled services — thrown instead of generic Error
export class UnbilledServicesError extends Error {
  services: { type: string; ids: string[] }[]

  constructor(services: { type: string; ids: string[] }[]) {
    super('Cannot discharge patient because there are unbilled services.')
    this.name = 'UnbilledServicesError'
    this.services = services
  }
}

/**
 * Parse Frappe's HTML error message for unbilled services.
 * The HTML contains rows of: [Healthcare Service Type] [Document IDs]
 * e.g. "Lab Test | HLC-LAB-2026-00005-1, HLC-LAB-2026-00006"
 */
function parseUnbilledServicesHtml(html: string): { type: string; ids: string[] }[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const rows = doc.querySelectorAll('tr')
  const services: { type: string; ids: string[] }[] = []

  rows.forEach(row => {
    const cells = row.querySelectorAll('td')
    if (cells.length >= 2) {
      const type = cells[0].textContent?.trim()
      const idsRaw = cells[1].textContent?.trim()
      if (type && idsRaw) {
        services.push({
          type,
          ids: idsRaw.split(',').map(s => s.trim()).filter(Boolean),
        })
      }
    }
  })

  return services
}

export interface ServerDischargeDraft {
  name: string
  docstatus?: number
  form_data: Record<string, string>
  discharge_checklist?: unknown[]
  nursing_checklist?: unknown[]
  patient_documents?: unknown[]
  patient_relatives?: unknown[]
  extra_charges?: Array<{
    charge_type?: string
    charge_today?: number
    service_unit?: string
    amount?: number
    sales_order?: string
    item_code?: string
  }>
}

export async function fetchDischargeDraftForAdmission(
  admissionName: string
): Promise<ServerDischargeDraft | null> {
  const params = new URLSearchParams({ admission_name: admissionName })
  const draft = await apiRequest<ServerDischargeDraft | null>(
    `/api/method/healthcare.api.inpatient_admission.get_discharge_draft_for_admission?${params.toString()}`
  )
  return draft && typeof draft === 'object' && draft.name ? draft : null
}

export type DischargeExtraChargeType = 'Room Charges' | 'Medical Supervision' | 'Observation'

export async function saveDischargeDraftToServer(
  admissionName: string,
  dischargeData: Record<string, unknown>,
  options?: { syncObservation?: boolean; syncChargeTypes?: DischargeExtraChargeType[] }
): Promise<{
  name: string
  message?: string
  observation?: string
  observation_record?: string
  sales_order?: string
  today_charge_sales_order?: string
  charge_sales_order?: string
  charge_sales_orders?: Record<string, string>
}> {
  return apiRequest(
    '/api/method/healthcare.api.inpatient_admission.save_discharge_draft',
    {
      method: 'POST',
      body: JSON.stringify({
        admission_name: admissionName,
        discharge_data: dischargeData,
        sync_observation: options?.syncObservation ? 1 : 0,
        sync_charge_types: options?.syncChargeTypes?.length ? options.syncChargeTypes : undefined,
      }),
    }
  )
}

export async function deleteDischargeObservation(
  admissionName: string
): Promise<{ message?: string }> {
  return apiRequest(
    '/api/method/healthcare.api.inpatient_admission.delete_discharge_observation',
    {
      method: 'POST',
      body: JSON.stringify({ admission_name: admissionName }),
    }
  )
}

export async function deleteDischargeTodayCharge(
  admissionName: string
): Promise<{ message?: string }> {
  return apiRequest(
    '/api/method/healthcare.api.inpatient_admission.delete_discharge_today_charge',
    {
      method: 'POST',
      body: JSON.stringify({ admission_name: admissionName }),
    }
  )
}

export async function deleteDischargeExtraCharge(
  admissionName: string,
  chargeType: DischargeExtraChargeType
): Promise<{ message?: string }> {
  return apiRequest(
    '/api/method/healthcare.api.inpatient_admission.delete_discharge_extra_charge',
    {
      method: 'POST',
      body: JSON.stringify({ admission_name: admissionName, charge_type: chargeType }),
    }
  )
}

export async function createDischarge(admissionName: string, dischargeData: any) {
  try {
    return await apiRequest(
      `/api/method/healthcare.api.inpatient_admission.create_and_submit_discharge`,
      {
        method: 'POST',
        body: JSON.stringify({
          admission_name: admissionName,
          discharge_data: dischargeData,
        }),
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Detect Frappe's "Unbilled Services" validation error
    if (message.toLowerCase().includes('unbilled')) {
      // The Frappe error message may embed HTML — extract it from the raw message
      const htmlMatch = message.match(/<table[\s\S]*<\/table>/i)
        || message.match(/<tr[\s\S]*<\/tr>/i)

      if (htmlMatch) {
        const services = parseUnbilledServicesHtml(htmlMatch[0])
        if (services.length > 0) {
          throw new UnbilledServicesError(services)
        }
      }

      // Fallback: try to extract service types from plain text
      // e.g. "Please invoice the following before discharge: Healthcare Service Documents"
      const afterColon = message.split(/before discharge[:\s]*/i)[1]
      if (afterColon) {
        const types = afterColon
          .split(/[,;]/)
          .map(s => s.trim())
          .filter(Boolean)
        if (types.length > 0) {
          throw new UnbilledServicesError(types.map(type => ({ type, ids: [] })))
        }
      }

      // Last resort: generic unbilled error with no detail
      throw new UnbilledServicesError([])
    }

    throw err
  }
}
export async function cancelAdmission(inpatientRecordName: string, reason?: string) {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const response = await fetch(
    `/api/method/healthcare.healthcare.doctype.inpatient_admission.inpatient_admission.set_ip_order_cancelled`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
      },
      body: JSON.stringify({ 
        inpatient_record: inpatientRecordName,
        reason: reason || 'Cancelled by user',
        encounter: null
      })
    }
  )
  
  const resData = await response.json()

  if (resData.exc || !response.ok) {
    throw new Error(resData.exc || resData.message || `Request failed with status ${response.status}`)
  }

  return resData.message
}

export async function getPatientActiveAdmission(patient: string): Promise<InpatientRecord | null> {
  const response = await fetch(
    `/api/method/healthcare.api.inpatient_admission.get_patient_active_admission?patient=${encodeURIComponent(patient)}`
  )
  const resData = await response.json().catch(() => ({}))

  if (!response.ok) {
    const msg = resData?.message || resData?.exc || 'Failed to fetch active admission'
    throw new Error(typeof msg === 'string' ? msg : String(msg))
  }

  // Frappe wraps return value in `message`; null means no active admission
  if ('message' in resData) {
    return resData.message ? (resData.message as InpatientRecord) : null
  }

  return null
}

// Create an invoice for an inpatient admission
export async function createInvoiceForInpatientAdmission(inpatientAdmissionName: string): Promise<{
  sales_invoice: string;
  status: string;
  message: string;
}> {
  const csrf = await ensureCSRF()
  const response = await fetch(`/api/method/healthcare.api.inpatient_admission.create_invoice_from_inpatient_admission`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
     },
    body: JSON.stringify({ inpatient_admission_name: inpatientAdmissionName })
  });
  
  const resData = await response.json();
  
  if (!resData?.message) {
    throw new Error(resData?.exception || 'Failed to create invoice');
  }
  
  return resData.message;
}

