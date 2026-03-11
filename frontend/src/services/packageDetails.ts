export interface PackageDetail {
  name: string
  admission_no: string
  file_number?: string
  patient_full_name?: string
  patient_category?: string
  from_date?: string
  to_date?: string
  total_days?: number
  transaction_amount?: number
  currency?: string
  vch_status?: string
  remarks?: string
  company?: string
}

export async function fetchPackageDetails(
  limit: number = 50,
  offset: number = 0,
  patient?: string,
  admission_no?: string
): Promise<PackageDetail[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (admission_no) params.append('admission_no', admission_no)

  const response = await fetch(
    `/api/method/healthcare.api.package_detail.get_package_details?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as PackageDetail[]
  } else {
    return []
  }
}

// Dashboard: available packages, active admission, assigned package (from Quotation)
export interface AvailablePackage {
  name: string
  package_name: string
  package_category?: string
  category_name?: string
  no_of_days?: number
  package_rate?: number
  cost_center?: string
}

export interface ActiveAdmission {
  name: string
  patient: string
  patient_name?: string
  status: string
  scheduled_date?: string
  admitted_datetime?: string
  expected_discharge?: string
}

export interface AssignedPackage {
  quotation_name: string
  inpatient_package: string
  package_name: string
  no_of_days?: number
  package_rate?: number
  admission_no: string
}

export interface PackageDetailRecord {
  name: string
  admission_no: string
  from_date?: string
  to_date?: string
  total_days?: number
  transaction_amount?: number
  currency?: string
  vch_status?: string
  remarks?: string
}

export interface PackageDetailDashboard {
  available_packages: AvailablePackage[]
  packages_available_count: number
  default_currency: string
  active_admission: ActiveAdmission | null
  assigned_package: AssignedPackage | null
  package_detail_records: PackageDetailRecord[]
}

export async function fetchPackageDetailDashboard(
  patient?: string
): Promise<PackageDetailDashboard> {
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)

  const url = `/api/method/healthcare.api.inpatient_admission.get_package_detail_dashboard${params.toString() ? `?${params.toString()}` : ''}`
  const res = await fetch(url)
  const data = await res.json()

  if (data?.exc || !res.ok) {
    throw new Error(data?.exc || data?.message || 'Failed to load package detail dashboard')
  }

  return (data?.message || data?.data) as PackageDetailDashboard
}





