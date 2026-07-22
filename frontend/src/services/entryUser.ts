import { apiRequest } from './apiClient'

export interface ReassignEntryUserResult {
  changed: boolean
  entry_user: string
  previous?: string
  owner_field?: string
  full_name?: string
}

/** Reassign credited receptionist (visit_owner / custom_payment_owner). */
export async function reassignEntryUser(
  doctype: string,
  name: string,
  newUser: string,
  reason?: string
): Promise<ReassignEntryUserResult> {
  return apiRequest<ReassignEntryUserResult>(
    '/api/method/healthcare.api.entry_user_reassign.reassign_entry_user',
    {
      method: 'POST',
      body: JSON.stringify({
        doctype,
        name,
        new_user: newUser,
        reason: reason || undefined,
      }),
    }
  )
}
