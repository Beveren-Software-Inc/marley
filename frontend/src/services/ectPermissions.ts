/** ECT dashboard form doctypes → whether the signed-in user may read them. */
export type ECTFormReadPermissions = Record<string, boolean>

/**
 * F046: the ECT dashboard gates its cards on the user's real read permission on
 * the backing doctype instead of a hard-coded role list, so doctors/physicians
 * (and any other permitted role) see the anesthesia sub-workflow cards too.
 *
 * Backed by `healthcare.api.ect_details.get_ect_form_read_permissions`.
 */
export async function fetchECTFormReadPermissions(): Promise<ECTFormReadPermissions> {
  const response = await fetch(
    '/api/method/healthcare.api.ect_details.get_ect_form_read_permissions',
    {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    }
  )

  const resData = await response.json().catch(() => ({}))

  if (!response.ok || resData?.exc) {
    throw new Error('Failed to load ECT form permissions')
  }

  const perms = resData?.message
  if (perms && typeof perms === 'object' && !Array.isArray(perms)) {
    return perms as ECTFormReadPermissions
  }

  throw new Error('Invalid ECT form permissions response')
}
