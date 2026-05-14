import { useState, useEffect, useCallback } from 'react'
import { fetchLabTests, type LabTest } from '../services/labTests'

export function useLabTests(
  patient?: string,
  status?: string,
  pendingReview: boolean = false,
  isOutsourced?: boolean,
  fromDate?: string,
  toDate?: string,
  template?: string,
  patientType?: string,
  byNurse?: boolean,
  limit: number = 20,
  offset: number = 0,
) {
  const [labTests, setLabTests] = useState<LabTest[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadLabTests = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetchLabTests(
        limit,
        offset,
        patient,
        status,
        pendingReview,
        isOutsourced,
        fromDate,
        toDate,
        template,
        patientType,
        byNurse
      )
      setLabTests(response.data)
      setTotalCount(response.total_count)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch lab tests'))
    } finally {
      setLoading(false)
    }
  }, [patient, status, pendingReview, isOutsourced, fromDate, toDate, template, patientType, byNurse, limit, offset])

  useEffect(() => {
    loadLabTests()
  }, [loadLabTests])

  return {
    labTests,
    totalCount,
    loading,
    error,
    refetch: loadLabTests,
  }
}





