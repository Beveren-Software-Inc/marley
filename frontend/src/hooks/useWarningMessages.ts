import { useState, useEffect, useMemo } from 'react'
import {
  fetchWarningMessages,
  type WarningMessage,
  type NoPatientWarningScope,
  type WarningMessageListQuery,
} from '../services/warningMessages'
import { DEFAULT_PAGE_SIZE, type PageSize } from '../components/ui/PaginationControls'

export function useWarningMessages(
  patient?: string,
  noPatientScope: NoPatientWarningScope = 'all',
  query?: WarningMessageListQuery,
  page: number = 1,
  pageSize: PageSize = DEFAULT_PAGE_SIZE,
) {
  const [warnings, setWarnings] = useState<WarningMessage[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const queryKey = useMemo(
    () =>
      JSON.stringify({
        typeOfWarning: query?.typeOfWarning ?? '',
        practitioner: query?.practitioner ?? '',
        fromDate: query?.fromDate ?? '',
        toDate: query?.toDate ?? '',
        includeSpecialPhoneWarnings: query?.includeSpecialPhoneWarnings ? '1' : '0',
        specialPhoneScope: query?.specialPhoneScope ?? 'standard',
      }),
    [
      query?.typeOfWarning,
      query?.practitioner,
      query?.fromDate,
      query?.toDate,
      query?.includeSpecialPhoneWarnings,
      query?.specialPhoneScope,
    ],
  )

  useEffect(() => {
    const loadWarnings = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchWarningMessages(
          pageSize,
          (page - 1) * pageSize,
          patient,
          noPatientScope,
          query,
        )
        setWarnings(response.data)
        setTotalCount(response.total_count)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch warning messages'))
      } finally {
        setLoading(false)
      }
    }

    loadWarnings()
  }, [patient, noPatientScope, queryKey, page, pageSize])

  return {
    warnings,
    totalCount,
    loading,
    error,
    refetch: async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchWarningMessages(
          pageSize,
          (page - 1) * pageSize,
          patient,
          noPatientScope,
          query,
        )
        setWarnings(response.data)
        setTotalCount(response.total_count)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch warning messages'))
      } finally {
        setLoading(false)
      }
    },
  }
}
