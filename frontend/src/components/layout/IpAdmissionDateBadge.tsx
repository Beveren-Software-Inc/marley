import { useEffect, useState } from 'react'
import { useCareContext } from '../../providers/CareContextProvider'
import { fetchInpatientRecord } from '../../services/inpatientRecords'
import { formatAdmissionDateSpan } from '../../utils/admissionDateTime'

/** Admission (→ discharge) dates for the active IP context — shown at the navbar right, not in search fields. */
export function IpAdmissionDateBadge({ className = '' }: { className?: string }) {
  const { mode, activeAdmission } = useCareContext()
  const [dateSpan, setDateSpan] = useState('')

  useEffect(() => {
    if (mode !== 'IP' || !activeAdmission) {
      setDateSpan('')
      return
    }
    let cancelled = false
    fetchInpatientRecord(activeAdmission)
      .then((record) => {
        if (!cancelled) setDateSpan(formatAdmissionDateSpan(record))
      })
      .catch(() => {
        if (!cancelled) setDateSpan('')
      })
    return () => {
      cancelled = true
    }
  }, [mode, activeAdmission])

  if (mode !== 'IP' || !activeAdmission || !dateSpan) return null

  return (
    <span
      className={`shrink-0 text-[10px] md:text-xs text-white/90 whitespace-nowrap tabular-nums ${className}`}
      title="Admission dates"
    >
      {dateSpan}
    </span>
  )
}
