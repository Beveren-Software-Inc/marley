import { useState, useEffect } from 'react'
import { fetchPatients, type PatientListItem } from '../services/patients'

export function usePatients(search?: string) {
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadPatients = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchPatients(50, 0, search)
        setPatients(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch patients'))
      } finally {
        setLoading(false)
      }
    }

    loadPatients()
  }, [search])

  return { patients, loading, error, refetch: () => {
    const loadPatients = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchPatients(50, 0, search)
        setPatients(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch patients'))
      } finally {
        setLoading(false)
      }
    }
    loadPatients()
  } }
}












