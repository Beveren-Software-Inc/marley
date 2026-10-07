import { useState } from 'react'
import { useAppBranding } from '../../hooks/useAppBranding'

type AppBrandLogoProps = {
  /** Extra classes on the outer white pill (sidebar default). */
  className?: string
  /** Image height classes — keep in sync with previous static logo. */
  imgClassName?: string
  /** Fallback "H" letter size. */
  fallbackClassName?: string
}

/**
 * Dynamic brand mark from Website Settings → App Logo.
 * Blank / broken logo → letter "H" (Hospital), same footprint as before.
 */
export function AppBrandLogo({
  className = 'rounded-md bg-white shadow-sm px-2 py-1 flex items-center justify-center overflow-hidden shrink-0 max-h-9',
  imgClassName = 'block h-7 w-auto max-w-[100px] object-contain object-center select-none',
  fallbackClassName = 'flex h-7 w-7 items-center justify-center text-primary font-bold text-lg leading-none select-none',
}: AppBrandLogoProps) {
  const { app_logo, app_name, hasLogo } = useAppBranding()
  const [imgFailed, setImgFailed] = useState(false)
  const showImage = hasLogo && !imgFailed

  return (
    <div className={className} title={app_name || 'Healthcare'}>
      {showImage ? (
        <img
          src={app_logo}
          alt={app_name || 'Hospital'}
          className={imgClassName}
          draggable={false}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className={fallbackClassName} aria-label={app_name || 'Hospital'}>
          H
        </span>
      )}
    </div>
  )
}
