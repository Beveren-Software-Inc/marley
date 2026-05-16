import { useState, useEffect, useMemo } from 'react'
import {
  fetchWarningMessages,
  type WarningMessage,
  type NoPatientWarningScope,
  type WarningMessageListQuery,
} from '../services/warningMessages'

export function useWarningMessages(
  patient?: string,
  noPatientScope: NoPatientWarningScope = 'all',
  query?: WarningMessageListQuery,
) {
  const [warnings, setWarnings] = useState<WarningMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const queryKey = useMemo(
    () =>
      JSON.stringify({
        typeOfWarning: query?.typeOfWarning ?? '',
        practitioner: query?.practitioner ?? '',
        fromDate: query?.fromDate ?? '',
        toDate: query?.toDate ?? '',
      }),
    [query?.typeOfWarning, query?.practitioner, query?.fromDate, query?.toDate],
  )

  useEffect(() => {
    const loadWarnings = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchWarningMessages(50, 0, patient, noPatientScope, query)
        setWarnings(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch warning messages'))
      } finally {
        setLoading(false)
      }
    }

    loadWarnings()
  }, [patient, noPatientScope, queryKey])

  return {
    warnings,
    loading,
    error,
    refetch: async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchWarningMessages(50, 0, patient, noPatientScope, query)
        setWarnings(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch warning messages'))
      } finally {
        setLoading(false)
      }
    },
  }
}
