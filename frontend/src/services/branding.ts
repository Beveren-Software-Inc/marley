export type AppBranding = {
  app_logo: string
  app_name: string
}

let cached: AppBranding | null = null
let inflight: Promise<AppBranding> | null = null

function normalizeLogoUrl(path: string): string {
  const raw = (path || '').trim()
  if (!raw) return ''
  // Absolute or data URL
  if (/^(https?:|data:)/i.test(raw)) return raw
  // Site-relative file path (encode spaces etc.)
  if (raw.startsWith('/')) {
    const parts = raw.split('/').map((p, i) => (i === 0 ? '' : encodeURIComponent(decodeURIComponent(p))))
    return parts.join('/')
  }
  return `/${encodeURIComponent(raw)}`
}

export async function fetchAppBranding(): Promise<AppBranding> {
  if (cached) return cached
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const res = await fetch('/api/method/healthcare.api.common.get_app_branding', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const msg = (json?.message || {}) as Partial<AppBranding>
      cached = {
        app_logo: normalizeLogoUrl(String(msg.app_logo || '')),
        app_name: String(msg.app_name || 'Healthcare').trim() || 'Healthcare',
      }
      return cached
    } catch {
      cached = { app_logo: '', app_name: 'Healthcare' }
      return cached
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/** Clear cache (e.g. after Website Settings logo change). */
export function clearAppBrandingCache() {
  cached = null
  inflight = null
}
