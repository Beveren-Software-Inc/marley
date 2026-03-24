import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCareContext } from '../providers/CareContextProvider'

/**
 * Returns the globally selected patient and a stable setter that
 * updates the context, localStorage, and the URL ?patient= param in one call.
 *
 * Usage in any page:
 *   const { selectedPatient, handlePatientSelect } = useGlobalPatient()
 */
export function useGlobalPatient() {
  const { selectedPatient, setSelectedPatient } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()

  const handlePatientSelect = useCallback(
    (patient: string | undefined) => {
      setSelectedPatient(patient)
      const next = new URLSearchParams(searchParams)
      if (patient) {
        next.set('patient', patient)
      } else {
        next.delete('patient')
      }
      setSearchParams(next, { replace: true })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams.toString(), setSearchParams, setSelectedPatient]
  )

  return { selectedPatient, handlePatientSelect, setSelectedPatient }
}
