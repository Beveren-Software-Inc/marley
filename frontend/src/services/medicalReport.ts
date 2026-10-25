import { apiRequest } from './apiClient'

/**
 * IP Medical Report list — served by a dedicated API because the doctype has no
 * stored practitioner_name field and the list must show the consultant's name
 * instead of the raw Healthcare Practitioner id.
 */
export async function fetchIPMedicalReports(
  patient?: string | null,
  limit = 100,
  offset = 0
): Promise<Record<string, any>[]> {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  params.set('offset', String(offset))
  if (patient) params.set('patient', patient)

  const res = await apiRequest<Record<string, any>[]>(
    `/api/method/healthcare.api.medical_report.get_ip_medical_reports?${params.toString()}`
  )
  return Array.isArray(res) ? res : []
}
