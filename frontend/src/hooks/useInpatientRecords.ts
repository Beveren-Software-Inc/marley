import { useState, useEffect } from 'react'
import { fetchInpatientRecords, type InpatientRecord } from '../services/inpatientRecords'

export function useInpatientRecords(status?: string, search?: string) {
  const [records, setRecords] = useState<InpatientRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadRecords = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchInpatientRecords(status, search)
        setRecords(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch inpatient records'))
      } finally {
        setLoading(false)
      }
    }

    loadRecords()
  }, [status, search])

  return { records, loading, error, refetch: () => {
    const loadRecords = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchInpatientRecords(status, search)
        setRecords(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch inpatient records'))
      } finally {
        setLoading(false)
      }
    }
    loadRecords()
  } }
}

