import {
  assertClinicalUpdateAllowed,
} from './editingLockStore'

let csrfFetchInFlight: Promise<string | null> | null = null

/** Ensure CSRF token exists (fetch from API if missing). Use before any POST on live/8000. */
export async function ensureCSRF(): Promise<string | null> {
  const existing = (window as any).csrf_token
  if (existing) return existing

  if (!csrfFetchInFlight) {
    csrfFetchInFlight = (async () => {
      try {
        const resp = await fetch('/api/method/frappe.sessions.get_csrf_token', {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Accept': 'application/json'
          }
        })

        if (!resp.ok) return null

        const data = await resp.json().catch(() => ({} as any))
        const token = data?.message || data?.data || null
        if (token) {
          ;(window as any).csrf_token = token
        }
        return token
      } catch {
        return null
      } finally {
        csrfFetchInFlight = null
      }
    })()
  }

  return await csrfFetchInFlight
}

function isUnsafeMethod(method?: string) {
  const m = (method || 'GET').toUpperCase()
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS'
}

/** Extract a user-facing message from a Frappe error JSON body. */
export function parseFrappeErrorPayload(data: unknown): string {
  if (!data || typeof data !== 'object') return ''

  const record = data as Record<string, unknown>

  try {
    const rawMsgs = record._server_messages
    if (rawMsgs) {
      const msgs =
        typeof rawMsgs === 'string' ? (JSON.parse(rawMsgs) as unknown[]) : rawMsgs
      if (Array.isArray(msgs) && msgs.length) {
        const first = msgs[0]
        const parsed =
          typeof first === 'string' ? (JSON.parse(first) as { message?: string }) : first
        if (parsed && typeof parsed === 'object' && parsed.message) {
          return String(parsed.message).trim()
        }
      }
    }
  } catch {
    /* fall through */
  }

  const pickFromText = (text: string): string => {
    const trimmed = text.trim()
    if (!trimmed) return ''
    const validation = trimmed.match(/ValidationError:\s*(.+)$/m)
    if (validation?.[1]) return validation[1].trim()
    const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length) {
      const last = lines[lines.length - 1]
      const lastMatch = last.match(/ValidationError:\s*(.+)$/)
      if (lastMatch?.[1]) return lastMatch[1].trim()
      return last
    }
    return trimmed
  }

  if (typeof record.message === 'string' && record.message.trim()) {
    return pickFromText(record.message)
  }
  if (typeof record.exception === 'string' && record.exception.trim()) {
    return pickFromText(record.exception)
  }

  return ''
}

async function doApiRequest<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const csrf = (window as any).csrf_token

  const resp = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      ...(options.headers || {})
    },
    ...options
  })

  if (!resp.ok) {
    // Try to get error message from response
    const contentType = resp.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      const errorData = await resp.json().catch(() => ({}))
      const cleanMessage =
        parseFrappeErrorPayload(errorData) || `Request failed with status ${resp.status}`
      throw new Error(cleanMessage)
    } else {
      // If it's HTML, it's likely a redirect or error page
      await resp.text() // Read response to avoid memory leak
      throw new Error(`Request failed with status ${resp.status}. Server returned HTML instead of JSON.`)
    }
  }

  const contentType = resp.headers.get('content-type')
  if (!contentType || !contentType.includes('application/json')) {
    const text = await resp.text()
    throw new Error(`Expected JSON but got ${contentType}. Response: ${text.substring(0, 200)}`)
  }

  const data = await resp.json()

  if (data?.exc) {
    const cleanMessage = parseFrappeErrorPayload(data)
    throw new Error(cleanMessage || 'Request failed')
  }

  // Frappe API returns data in different formats
  if (data.data !== undefined) {
    return data.data as T
  }
  if (data.message !== undefined) {
    return data.message as T
  }
  return data as T
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  assertClinicalUpdateAllowed(path, options.method)

  // Ensure CSRF token exists for unsafe methods.
  if (isUnsafeMethod(options.method)) {
    await ensureCSRF()
  }

  try {
    return await doApiRequest<T>(path, options)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)

    // If CSRF is invalid/expired, fetch a fresh token and retry once.
    if (isUnsafeMethod(options.method) && msg.toLowerCase().includes('invalid request')) {
      // force refresh token
      delete (window as any).csrf_token
      await ensureCSRF()
      return await doApiRequest<T>(path, options)
    }

    throw e
  }
}


