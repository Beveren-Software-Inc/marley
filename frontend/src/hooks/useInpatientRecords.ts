import { useState, useEffect, useCallback } from 'react'
import { fetchInpatientRecords, type InpatientRecord } from '../services/inpatientRecords'

export function useInpatientRecords(
  status?: string,
  search?: string,
  patient?: string,
  practitioner?: string,
  fromDate?: string,
  toDate?: string,
  refreshKey?: string | number,
  limit?: number,
  offset?: number,
  excludeCancelled?: boolean
) {
  const [records, setRecords] = useState<InpatientRecord[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadRecords = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetchInpatientRecords(status, search, patient, practitioner, fromDate, toDate, limit, offset, excludeCancelled)
      setRecords(response.data)
      setTotalCount(response.total_count)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch inpatient records'))
    } finally {
      setLoading(false)
    }
  }, [status, search, patient, practitioner, fromDate, toDate, limit, offset, excludeCancelled, refreshKey])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  return {
    records,
    totalCount,
    loading,
    error,
    refetch: loadRecords,
  }
}
