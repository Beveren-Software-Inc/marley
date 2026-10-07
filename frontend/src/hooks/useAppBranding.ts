import { useEffect, useState } from 'react'
import { fetchAppBranding, type AppBranding } from '../services/branding'

const EMPTY: AppBranding = { app_logo: '', app_name: 'Healthcare' }

/** Website Settings app logo / name for portal chrome. */
export function useAppBranding() {
  const [branding, setBranding] = useState<AppBranding>(EMPTY)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchAppBranding().then((b) => {
      if (!cancelled) {
        setBranding(b)
        setLoaded(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { ...branding, loaded, hasLogo: Boolean(branding.app_logo) }
}
