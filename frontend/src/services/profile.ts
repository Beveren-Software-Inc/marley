import { ensureCSRF } from './apiClient'

/** Extract a human-readable error from a Frappe JSON response. */
function frappeError(data: unknown, fallback: string): Error {
  const exc = (data as { _server_messages?: string })?._server_messages
  if (exc) {
    try {
      return new Error(JSON.parse(JSON.parse(exc)?.[0])?.message ?? fallback)
    } catch {
      /* ignore parse issues */
    }
  }
  return new Error(fallback)
}

/** Default company name for portal branding (Settings header). */
export async function fetchPortalCompany(): Promise<string> {
  try {
    const res = await fetch('/api/method/healthcare.api.common.get_portal_company')
    const data = await res.json()
    return data?.message?.company || ''
  } catch {
    return ''
  }
}

/** Update the logged-in user's display name (User.full_name). Returns the saved name. */
export async function updateDisplayName(fullName: string): Promise<string> {
  const csrf = (await ensureCSRF()) ?? ''
  const body = new URLSearchParams()
  body.set('full_name', fullName)
  const res = await fetch('/api/method/healthcare.api.common.update_display_name', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Frappe-CSRF-Token': csrf,
      Accept: 'application/json',
    },
    body: body.toString(),
  })
  const data = await res.json()
  if (data?.message?.full_name) return data.message.full_name as string
  throw frappeError(data, 'Failed to update display name')
}

/** Upload a new profile photo for the logged-in user. Returns the new image URL. */
export async function uploadProfilePhoto(file: File): Promise<string> {
  const csrf = (await ensureCSRF()) ?? ''
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/method/healthcare.api.common.set_profile_photo', {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Frappe-CSRF-Token': csrf, Accept: 'application/json' },
    body: form,
  })
  const data = await res.json()
  if (data?.message?.user_image) return data.message.user_image as string
  throw frappeError(data, 'Failed to upload photo')
}
