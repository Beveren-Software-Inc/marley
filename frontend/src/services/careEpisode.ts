export type ActiveCareEpisodeStatus = {
  patient_visit_status: string | null
  inpatient_admission_status: string | null
  blocks_create: boolean
  block_reason: string | null
  /** Mirrors Healthcare Settings; default true until loaded from API. */
  block_clinical_records_on_discharged_ip: boolean
}

export async function fetchActiveCareEpisodeStatus(
  patientVisit?: string,
  inpatientAdmission?: string,
): Promise<ActiveCareEpisodeStatus> {
  const params = new URLSearchParams()
  if (patientVisit) params.set('patient_visit', patientVisit)
  if (inpatientAdmission) params.set('inpatient_admission', inpatientAdmission)
  const qs = params.toString()
  const url = `/api/method/healthcare.api.care_episode.get_active_care_episode_status${qs ? `?${qs}` : ''}`
  const response = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } })
  const resData = await response.json()
  if (resData?.message) {
    return resData.message as ActiveCareEpisodeStatus
  }
  throw new Error('Failed to load care episode status')
}
