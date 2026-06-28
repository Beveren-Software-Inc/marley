const DEFAULT_MESSAGE =
  'Editing is locked in Healthcare Settings. You can create new records but cannot modify existing data.'

let lockEditingData = false
let editingLockMessage = DEFAULT_MESSAGE

export function setEditingLockState(locked: boolean, message?: string) {
  lockEditingData = locked
  editingLockMessage = message?.trim() || DEFAULT_MESSAGE
}

export function isEditingLockActive(): boolean {
  return lockEditingData
}

export function getEditingLockMessage(): string {
  return editingLockMessage
}

/** Block portal/API calls that modify existing records when editing is locked. */
export function assertClinicalUpdateAllowed(path: string, method?: string): void {
  if (!lockEditingData) return

  const m = (method || 'GET').toUpperCase()
  const isUpdateMethod =
    path.includes('.update_') ||
    ((m === 'PUT' || m === 'PATCH') && path.includes('/api/resource/'))

  if (!isUpdateMethod) return

  throw new Error(editingLockMessage)
}

let fetchGuardInstalled = false

/** Intercept fetch so update API calls are blocked when editing is locked. */
export function installClinicalEditingFetchGuard(): void {
  if (typeof window === 'undefined' || fetchGuardInstalled) return
  fetchGuardInstalled = true

  const originalFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    const method =
      init?.method ??
      (typeof input !== 'string' && !(input instanceof URL) ? input.method : undefined)

    assertClinicalUpdateAllowed(url, method)
    return originalFetch(input, init)
  }
}
