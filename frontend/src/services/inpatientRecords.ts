import { apiRequest } from './apiClient'

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

export interface ServiceUnit {
  name: string
  service_unit_name: string
  service_unit_type: string
  occupancy_status: string
  company: string
}

export async function fetchInpatientRecords(filters?: Record<string, any>) {
  let filterString = ''
  if (filters) {
    const filterArray = Object.entries(filters).map(([key, value]) => {
      if (typeof value === 'string') {
        return `["${key}","=","${value}"]`
      }
      return `["${key}","=",${JSON.stringify(value)}]`
    })
    filterString = `&filters=[${filterArray.join(',')}]`
  }
  
  const response = await apiRequest<{ data: InpatientRecord[] }>(
    `/api/resource/Inpatient Record?fields=["name","patient","patient_name","status","scheduled_date","admitted_datetime","expected_discharge","admission_service_unit_type","medical_department","primary_practitioner","secondary_practitioner","admission_encounter"]&order_by=scheduled_date desc${filterString}`
  )
  
  return Array.isArray(response) ? response : response?.data || []
}

export async function fetchInpatientRecord(name: string) {
  return apiRequest<InpatientRecord>(`/api/resource/Inpatient Record/${name}`)
}

export async function fetchPackageDetails(admissionNo: string) {
  const filterString = `&filters=[["admission_no","=","${admissionNo}"]]`
  const response = await apiRequest<{ data: PackageDetail[] }>(
    `/api/resource/Package Detail?fields=["name","admission_no","from_date","to_date","total_days","transaction_amount","currency","vch_status","remarks"]${filterString}`
  )
  return Array.isArray(response) ? response : response?.data || []
}

export async function fetchServiceUnits(filters?: Record<string, any>) {
  let filterString = ''
  if (filters) {
    const filterArray = Object.entries(filters)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return `["${key}","=","${value}"]`
        }
        return `["${key}","=",${JSON.stringify(value)}]`
      })
    if (filterArray.length > 0) {
      filterString = `&filters=[${filterArray.join(',')}]`
    }
  }
  
  const response = await apiRequest<{ data: ServiceUnit[] }>(
    `/api/resource/Healthcare Service Unit?fields=["name","service_unit_name","service_unit_type","occupancy_status","company"]${filterString}`
  )
  return Array.isArray(response) ? response : response?.data || []
}

export async function admitPatient(
  inpatientRecordName: string,
  serviceUnit: string,
  checkIn: string,
  expectedDischarge?: string
) {
  const csrf = (window as any).csrf_token
  
  const resp = await fetch(`/api/method/healthcare.healthcare.doctype.inpatient_record.inpatient_record.admit`, {
    method: 'POST',
    credentials: 'include',
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
  })

  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}))
    throw new Error(errorData.message || errorData.exc || `Request failed with status ${resp.status}`)
  }

  const data = await resp.json()
  return data.message || data
}

