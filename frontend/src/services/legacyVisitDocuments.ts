export interface LegacyVisitDocument {
  name: string
  transaction_no?: string
  document_name?: string
  file_name?: string
  document_type?: string
  document?: string
  upload_remarks?: string
  date_created?: string
  patient?: string
  patient_name?: string
  legacy_patient_file_no?: string
  legacy_visit?: string
  patient_visit?: string
  creation?: string
  modified?: string
}

export async function fetchPatientLegacyVisitDocuments(
  patient?: string,
  limit: number = 100,
  offset: number = 0
): Promise<LegacyVisitDocument[]> {
  if (!patient) return []

  const params = new URLSearchParams()
  params.append('patient', patient)
  params.append('limit', String(limit))
  params.append('offset', String(offset))

  const response = await fetch(
    `/api/method/healthcare.api.legacy_visit_document.get_patient_legacy_visit_documents?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.exc || !response.ok) {
    throw new Error(
      (typeof resData?.message === 'string' && resData.message) ||
        'Failed to load legacy documents'
    )
  }

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LegacyVisitDocument[]
  }
  return []
}
