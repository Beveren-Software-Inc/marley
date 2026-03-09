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

      const raw = (errorData && (errorData.message ?? errorData.exc)) || ''

      const extractUserMessage = (value: any): string => {
        let msg: any = value
        if (!msg) return ''

        // If it's already an array, use the last entry
        if (Array.isArray(msg)) {
          msg = msg[msg.length - 1] || ''
        }

        // If it's a JSON-encoded array string (like Frappe tracebacks), parse it
        if (typeof msg === 'string' && msg.trim().startsWith('[')) {
          try {
            const parsed = JSON.parse(msg)
            if (Array.isArray(parsed) && parsed.length) {
              msg = parsed[parsed.length - 1]
            }
          } catch {
            // ignore JSON parse errors and fall back to raw string
          }
        }

        if (typeof msg !== 'string') {
          msg = String(msg)
        }

        // For traceback-like strings, take the last non-empty line as the user-facing message
        const lines = msg
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)

        if (lines.length) {
          msg = lines[lines.length - 1]
        }

        return msg
      }

      const cleanMessage = extractUserMessage(raw) || `Request failed with status ${resp.status}`
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


