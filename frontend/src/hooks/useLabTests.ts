import { useState, useEffect } from 'react'
import { fetchLabTests, type LabTest } from '../services/labTests'

export function useLabTests(patient?: string, status?: string, pendingReview: boolean = false) {
  const [labTests, setLabTests] = useState<LabTest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadLabTests = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchLabTests(50, 0, patient, status, pendingReview)
        setLabTests(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch lab tests'))
      } finally {
        setLoading(false)
      }
    }

    loadLabTests()
  }, [patient, status, pendingReview])

  return {
    labTests,
    loading,
    error,
    refetch: async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchLabTests(50, 0, patient, status, pendingReview)
        setLabTests(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch lab tests'))
      } finally {
        setLoading(false)
      }
    }
  }
}

