import { useState, useEffect } from 'react'
import { fetchPatientVisits, type PatientVisit } from '../services/patientVisits'

export function usePatientVisits(status?: string, search?: string, patient?: string) {
  const [visits, setVisits] = useState<PatientVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadVisits = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchPatientVisits(status, search, patient)
        setVisits(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch patient visits'))
      } finally {
        setLoading(false)
      }
    }

    loadVisits()
  }, [status, search, patient])

  return { visits, loading, error, refetch: () => {
    const loadVisits = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchPatientVisits(status, search, patient)
        setVisits(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch patient visits'))
      } finally {
        setLoading(false)
      }
    }
    loadVisits()
  } }
}






