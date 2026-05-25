import { useCallback, useEffect, useState } from 'react'
import {
  fetchOpDoctorRequiredDocumentsStatus,
  type OpDoctorRequiredDocumentsStatus,
} from '../services/ipDoctorRequirements'

export function useOpDoctorRequirements(
  patient: string | undefined,
  patientVisit: string | null | undefined,
  enabled: boolean,
  refreshKey?: string | number
) {
  const [status, setStatus] = useState<OpDoctorRequiredDocumentsStatus | null>(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!enabled || !patient) {
      setStatus(null)
      return
    }
    setLoading(true)
    try {
      const data = await fetchOpDoctorRequiredDocumentsStatus(patient, patientVisit || undefined)
      setStatus(data)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [enabled, patient, patientVisit])

  useEffect(() => {
    reload()
  }, [reload, refreshKey])

  return { status, loading, reload }
}
