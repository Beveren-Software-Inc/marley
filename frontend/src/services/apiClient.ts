export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
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
      throw new Error(errorData.message || errorData.exc || `Request failed with status ${resp.status}`)
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


