import { useCallback, useEffect, useState } from 'react'
import {
  fetchIpDoctorRequiredDocumentsStatus,
  type IpDoctorRequiredDocumentsStatus,
} from '../services/ipDoctorRequirements'

export function useIpDoctorRequirements(
  patient: string | undefined,
  admission: string | null | undefined,
  enabled: boolean,
  refreshKey?: string | number
) {
  const [status, setStatus] = useState<IpDoctorRequiredDocumentsStatus | null>(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!enabled || !patient) {
      setStatus(null)
      return
    }
    setLoading(true)
    try {
      const data = await fetchIpDoctorRequiredDocumentsStatus(patient, admission || undefined)
      setStatus(data)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [enabled, patient, admission])

  useEffect(() => {
    reload()
  }, [reload, refreshKey])

  return { status, loading, reload }
}
