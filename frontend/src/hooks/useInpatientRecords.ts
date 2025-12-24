import { useState, useEffect } from 'react'
import { fetchInpatientRecords, type InpatientRecord } from '../services/inpatientRecords'

export function useInpatientRecords(status?: string) {
  const [records, setRecords] = useState<InpatientRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadRecords = async () => {
      try {
        setLoading(true)
        setError(null)
        const filters: Record<string, any> = {}
        if (status) {
          filters.status = status
        }
        const response = await fetchInpatientRecords(filters)
        setRecords(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch inpatient records'))
      } finally {
        setLoading(false)
      }
    }

    loadRecords()
  }, [status])

  return { records, loading, error, refetch: () => {
    const loadRecords = async () => {
      try {
        setLoading(true)
        setError(null)
        const filters: Record<string, any> = {}
        if (status) {
          filters.status = status
        }
        const response = await fetchInpatientRecords(filters)
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

