import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useCareContext } from '../../providers/CareContextProvider'

const DISMISS_STORAGE_KEY = 'healthcare_closed_care_banner_dismissed'

function readDismissedEpisodeKey(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return sessionStorage.getItem(DISMISS_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeDismissedEpisodeKey(key: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (key) {
      sessionStorage.setItem(DISMISS_STORAGE_KEY, key)
    } else {
      sessionStorage.removeItem(DISMISS_STORAGE_KEY)
    }
  } catch {
    /* ignore */
  }
}

function closedEpisodeKey(
  mode: 'OP' | 'IP' | null,
  activeVisit?: string,
  activeAdmission?: string,
): string | null {
  if (mode === 'OP' && activeVisit) return `OP:${activeVisit}`
  if (mode === 'IP' && activeAdmission) return `IP:${activeAdmission}`
  return null
}

/** Shown under the header when the selected OP visit or IP admission is closed for new records. */
export function ClosedCareEpisodeBanner() {
  const {
    mode,
    activeVisit,
    activeAdmission,
    isActiveCareEpisodeClosed,
    activeCareBlockReason,
    activeVisitStatus,
    activeAdmissionStatus,
  } = useCareContext()

  const episodeKey = useMemo(
    () => closedEpisodeKey(mode, activeVisit, activeAdmission),
    [mode, activeVisit, activeAdmission],
  )

  const [dismissedKey, setDismissedKey] = useState<string | null>(() => readDismissedEpisodeKey())

  useEffect(() => {
    setDismissedKey(readDismissedEpisodeKey())
  }, [episodeKey])

  if (!isActiveCareEpisodeClosed || !episodeKey) return null
  if (dismissedKey === episodeKey) return null

  const label =
    mode === 'OP' && activeVisit
      ? `Visit ${activeVisit} (${activeVisitStatus})`
      : mode === 'IP' && activeAdmission
        ? `Admission ${activeAdmission} (${activeAdmissionStatus})`
        : null

  const handleDismiss = () => {
    writeDismissedEpisodeKey(episodeKey)
    setDismissedKey(episodeKey)
  }

  return (
    <div
      className="relative border-b border-amber-300 bg-amber-50 pl-4 pr-10 py-2.5 text-sm text-amber-950 shadow-sm"
      role="status"
    >
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-2 top-2 rounded p-1 text-amber-800/80 hover:bg-amber-200/60 hover:text-amber-950 transition-colors"
        title="Dismiss notice (create restrictions still apply)"
        aria-label="Dismiss closed care episode notice"
      >
        <X className="h-4 w-4" strokeWidth={2.25} />
      </button>
      <p className="font-semibold pr-6">Care episode closed</p>
      <p className="mt-1 pr-2">
        {activeCareBlockReason ??
          'You cannot add appointments, labs, prescriptions, or other clinical records for this episode.'}
      </p>
      {label && (
        <p className="mt-1 text-xs text-amber-800 pr-2">
          Current selection: {label}. Use the OP/IP search in the header to select or create an open visit or active
          admission. Creating records for this episode remains blocked.
        </p>
      )}
    </div>
  )
}
