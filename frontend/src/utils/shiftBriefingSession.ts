export type ShiftBriefingRole = 'nurse' | 'doctor'

const STORAGE_KEYS: Record<ShiftBriefingRole, string> = {
  nurse: 'healthcare.nurseShiftBriefingShown',
  doctor: 'healthcare.doctorShiftBriefingShown',
}

export function wasShiftBriefingShown(role: ShiftBriefingRole): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEYS[role]) === '1'
  } catch {
    return false
  }
}

export function markShiftBriefingShown(role: ShiftBriefingRole): void {
  try {
    sessionStorage.setItem(STORAGE_KEYS[role], '1')
  } catch {
    // sessionStorage may be unavailable (private mode, etc.)
  }
}
