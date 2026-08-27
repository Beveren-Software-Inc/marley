import { useEffect, useState } from 'react'
import { isAdmin, isDoctorRole } from '../config/permissions'
import { useCareContext } from '../providers/CareContextProvider'
import {
  getCurrentUserPractitionerOption,
  type LinkFieldOption,
} from '../services/common'

/** Shared class for a locked (auto-chosen) practitioner field. */
export const LOCKED_PRACTITIONER_INPUT_CLASS =
  'w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700 cursor-not-allowed focus:outline-none'

/**
 * Doctors linked to a Healthcare Practitioner cannot change the auto-chosen
 * practitioner on create forms. System Manager / Administrator / Healthcare
 * Administrator stay editable. Only applies when Healthcare Settings
 * lock_doctors_name_choosing is enabled.
 */
export function shouldLockAutoPractitioner(roles: string[] | undefined): boolean {
  if (!roles?.length) return false
  if (isAdmin(roles)) return false
  return isDoctorRole(roles)
}

export type LockedLinkedPractitioner = {
  /** True when field must be read-only (setting on + doctor + linked practitioner, not admin). */
  locked: boolean
  /** Eligible by role (doctor, not admin) — may still be unlocked if setting off or no link. */
  lockEligible: boolean
  practitionerId: string | null
  practitionerLabel: string
  option: LinkFieldOption | null
  loading: boolean
}

/**
 * Resolve the logged-in user's linked Healthcare Practitioner and whether
 * create-form practitioner fields should be locked.
 */
export function useLockedLinkedPractitioner(): LockedLinkedPractitioner {
  const { userRole, lockDoctorsNameChoosing } = useCareContext()
  const lockEligible =
    Boolean(lockDoctorsNameChoosing) && shouldLockAutoPractitioner(userRole)
  const [option, setOption] = useState<LinkFieldOption | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const opt = await getCurrentUserPractitionerOption()
        if (!cancelled) setOption(opt?.name ? opt : null)
      } catch {
        if (!cancelled) setOption(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const practitionerId = option?.name || null
  const practitionerLabel = (option?.label || option?.name || '').trim()
  const locked = Boolean(lockEligible && practitionerId)

  return {
    locked,
    lockEligible,
    practitionerId,
    practitionerLabel,
    option,
    loading,
  }
}
