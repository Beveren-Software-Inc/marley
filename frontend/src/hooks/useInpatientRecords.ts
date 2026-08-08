import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchInpatientRecords,
  resolveAdmissionListStatusFilter,
  type InpatientRecord,
} from '../services/inpatientRecords'

export function useInpatientRecords(
  /** UI status filter (includes "Discharge in Progress"; mapped for API). */
  status?: string,
  search?: string,
  patient?: string,
  practitioner?: string,
  fromDate?: string,
  toDate?: string,
  refreshKey?: string | number,
  limit?: number,
  offset?: number,
  excludeCancelled?: boolean,
  costCenter?: string
) {
  const [records, setRecords] = useState<InpatientRecord[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const recordsRef = useRef<InpatientRecord[]>([])

  const loadRecords = useCallback(async () => {
    try {
      if (recordsRef.current.length === 0) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }
      setError(null)
      const resolved = resolveAdmissionListStatusFilter(status)
      const response = await fetchInpatientRecords(
        resolved.status,
        search,
        patient,
        practitioner,
        fromDate,
        toDate,
        limit,
        offset,
        excludeCancelled,
        costCenter,
        resolved.dischargeInProgress
      )
      setRecords(response.data)
      setTotalCount(response.total_count)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch inpatient records'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [status, search, patient, practitioner, fromDate, toDate, limit, offset, excludeCancelled, costCenter, refreshKey])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  return {
    records,
    totalCount,
    loading,
    refreshing,
    error,
    refetch: loadRecords,
  }
}
