export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const csrf = (window as any).csrf_token

  const resp = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      ...(options.headers || {})
    },
    ...options
  })

  if (!resp.ok) {
    throw new Error(`Request failed with status ${resp.status}`)
  }

  const data = (await resp.json()) as { data?: T }
  return (data?.data ?? (data as unknown as T))
}


