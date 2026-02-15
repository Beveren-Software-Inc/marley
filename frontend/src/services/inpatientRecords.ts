import { apiRequest } from './apiClient'

export interface InpatientOccupancy {
  service_unit?: string
  service_unit_name?: string
  check_in?: string
  check_out?: string
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
  expected_discharge?: string
  admission_service_unit_type?: string
  medical_department?: string
  primary_practitioner?: string
  secondary_practitioner?: string
  admission_encounter?: string
  current_occupancy?: InpatientOccupancy
  charges?: AdmissionCharges
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
}

export async function fetchInpatientRecords(status?: string, search?: string, patient?: string) {
  const params = new URLSearchParams()
  if (status) params.append('status', status)
  if (search) params.append('search', search)
  if (patient) params.append('patient', patient)
  
  const url = `/api/method/healthcare.api.inpatient_admission.get_inpatient_records${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as InpatientRecord[]
  } else {
    throw new Error('Invalid response format')
  }
}

export async function fetchInpatientRecord(name: string) {
  const response = await fetch(
    `/api/method/healthcare.api.inpatient_admission.get_inpatient_record?name=${encodeURIComponent(name)}`
  )
  const resData = await response.json()
console.log("Hapa",resData)
  if (resData?.message) {
    return resData.message as InpatientRecord
  } else {
    throw new Error('Invalid response format')
  }
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

export async function fetchServiceUnits(serviceUnitType?: string, occupancyStatus?: string, search?: string, roomCategory?: string) {
  const params = new URLSearchParams()
  if (serviceUnitType) params.append('service_unit_type', serviceUnitType)
  if (occupancyStatus) params.append('occupancy_status', occupancyStatus)
  if (search) params.append('search', search)
  if (roomCategory) params.append('room_category', roomCategory)
  
  const url = `/api/method/healthcare.api.inpatient_admission.get_service_units${params.toString() ? `?${params.toString()}` : ''}`
  console.log('Fetching service units with URL:', url)
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as ServiceUnit[]
  } else {
    return [] // Return empty array on error
  }
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
  const csrf = (window as any).csrf_token
  
  const response = await fetch(
    `/api/method/healthcare.api.inpatient_admission.create_admission_quotation`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
  serviceUnit: string,
  checkIn: string,
  expectedDischarge?: string
) {
  const csrf = (window as any).csrf_token
  
  const response = await fetch(
    `/api/method/healthcare.api.inpatient_admission.admit_patient`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
      },
      body: JSON.stringify({
        name: inpatientRecordName,
        service_unit: serviceUnit,
        check_in: checkIn,
        expected_discharge: expectedDischarge || null
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

export async function createDischarge(admissionName: string, dischargeData: any) {
  return await apiRequest(
    `/api/method/healthcare.api.inpatient_admission.create_and_submit_discharge`,
    {
      method: 'POST',
      body: JSON.stringify({
        admission_name: admissionName,
        discharge_data: dischargeData
      })
    }
  )
}

export async function cancelAdmission(inpatientRecordName: string, reason?: string) {
  const csrf = (window as any).csrf_token
  
  const response = await fetch(
    `/api/method/healthcare.healthcare.doctype.inpatient_admission.inpatient_admission.set_ip_order_cancelled`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
  const resData = await response.json()

  if (resData?.message) {
    return resData.message as InpatientRecord
  } else if (resData?.message === null) {
    return null
  }
  
  throw new Error('Invalid response format')
}

