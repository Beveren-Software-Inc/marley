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
  service_unit_name: string
  service_unit_type: string
  occupancy_status: string
  company: string
}

export async function fetchInpatientRecords(status?: string) {
  const url = `/api/method/healthcare.api.inpatient_record.get_inpatient_records${status ? `?status=${encodeURIComponent(status)}` : ''}`
  
  const response = await fetch(url)
  console.log("Hapa",response)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as InpatientRecord[]
  } else {
    throw new Error('Invalid response format')
  }
}

export async function fetchInpatientRecord(name: string) {
  const response = await fetch(
    `/api/method/healthcare.api.inpatient_record.get_inpatient_record?name=${encodeURIComponent(name)}`
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
    `/api/method/healthcare.api.inpatient_record.get_package_details?admission_no=${encodeURIComponent(admissionNo)}`
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

export async function fetchServiceUnits(serviceUnitType?: string, occupancyStatus?: string) {
  const params = new URLSearchParams()
  if (serviceUnitType) params.append('service_unit_type', serviceUnitType)
  if (occupancyStatus) params.append('occupancy_status', occupancyStatus)
  
  const url = `/api/method/healthcare.api.inpatient_record.get_service_units${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as ServiceUnit[]
  } else {
    return [] // Return empty array on error
  }
}

export async function admitPatient(
  inpatientRecordName: string,
  serviceUnit: string,
  checkIn: string,
  expectedDischarge?: string
) {
  const csrf = (window as any).csrf_token
  
  const response = await fetch(
    `/api/method/healthcare.api.inpatient_record.admit_patient`,
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

