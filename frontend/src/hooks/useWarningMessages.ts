import { useState, useEffect } from 'react'
import { fetchWarningMessages, type WarningMessage, type NoPatientWarningScope } from '../services/warningMessages'

export function useWarningMessages(
  patient?: string,
  noPatientScope: NoPatientWarningScope = 'all',
) {
  const [warnings, setWarnings] = useState<WarningMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadWarnings = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchWarningMessages(50, 0, patient, noPatientScope)
        setWarnings(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch warning messages'))
      } finally {
        setLoading(false)
      }
    }

    loadWarnings()
  }, [patient, noPatientScope])

  return {
    warnings,
    loading,
    error,
    refetch: async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchWarningMessages(50, 0, patient, noPatientScope)
        setWarnings(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch warning messages'))
      } finally {
        setLoading(false)
      }
    }
  }
}









