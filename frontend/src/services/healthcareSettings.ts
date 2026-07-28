export type HealthcarePortalSettings = {
  lock_editing_data: boolean
  /** When true, therapy notes cannot be edited after 24 hours from creation. */
  therapy_note_uneditable_in_24_hour: boolean
  /** When true, vital signs cannot be edited after 24 hours from creation. */
  vital_sign_uneditable_in_24_hour: boolean
  /** When true, daily routine care docs cannot be edited after 24 hours from creation. */
  unedit_within_24hour: boolean
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
    vital_sign_uneditable_in_24_hour: Boolean(msg?.vital_sign_uneditable_in_24_hour),
    unedit_within_24hour: Boolean(msg?.unedit_within_24hour),
  }
}
