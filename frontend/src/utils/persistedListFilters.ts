/** Persist list filter choices across page refresh (session-scoped). */

export function readPersistedListFilters<T extends Record<string, unknown>>(
  storageKey: string,
): Partial<T> | null {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as Partial<T>
  } catch {
    return null
  }
}

export function writePersistedListFilters(
  storageKey: string,
  filters: Record<string, unknown>,
): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(filters))
  } catch {
    // sessionStorage may be unavailable
  }
}

export function clearPersistedListFilters(storageKey: string): void {
  try {
    sessionStorage.removeItem(storageKey)
  } catch {
    // ignore
  }
}

export function admissionListFilterStorageKey(pathname: string): string {
  if (pathname.startsWith('/doctor')) return 'healthcare:admissionListFilters:doctor'
  if (pathname.startsWith('/nurse')) return 'healthcare:admissionListFilters:nurse'
  if (pathname.startsWith('/receptionist') || pathname.startsWith('/reception')) {
    return 'healthcare:admissionListFilters:reception'
  }
  if (pathname.startsWith('/therapy')) return 'healthcare:admissionListFilters:therapy'
  if (pathname.startsWith('/psychologist')) return 'healthcare:admissionListFilters:psychologist'
  if (pathname.startsWith('/nutritionist')) return 'healthcare:admissionListFilters:nutritionist'
  return `healthcare:admissionListFilters:${pathname || 'default'}`
}
