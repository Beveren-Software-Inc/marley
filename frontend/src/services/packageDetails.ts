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


