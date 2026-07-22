export type HealthcarePortalSettings = {
  lock_editing_data: boolean
  /** When true, therapy notes cannot be edited after 24 hours from creation. */
  therapy_note_uneditable_in_24_hour: boolean
}

export async function fetchHealthcarePortalSettings(): Promise<HealthcarePortalSettings> {
  const response = await fetch(
    '/api/method/healthcare.api.common.get_healthcare_portal_settings',
    { credentials: 'include', headers: { Accept: 'application/json' } },
  )
  const data = await response.json()
  const msg = data?.message
  return {
    lock_editing_data: Boolean(msg?.lock_editing_data),
    therapy_note_uneditable_in_24_hour: Boolean(msg?.therapy_note_uneditable_in_24_hour),
  }
}
