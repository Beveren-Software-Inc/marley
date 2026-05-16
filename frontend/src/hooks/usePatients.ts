import { useState, useEffect, useCallback } from 'react'
import { fetchPatientsPaginated, type PatientListItem } from '../services/patients'

export function usePatients(search?: string, limit: number = 20, offset: number = 0) {
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [fullDirectoryRestricted, setFullDirectoryRestricted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadPatients = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetchPatientsPaginated(limit, offset, search)
      setPatients(response.data)
      setTotalCount(response.total_count)
      setFullDirectoryRestricted(Boolean(response.full_directory_restricted))
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch patients'))
    } finally {
      setLoading(false)
    }
  }, [search, limit, offset])

  useEffect(() => {
    loadPatients()
  }, [loadPatients])

  return { patients, totalCount, fullDirectoryRestricted, loading, error, refetch: loadPatients }
}
