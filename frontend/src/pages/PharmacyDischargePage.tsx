import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCareContext } from '../providers/CareContextProvider'
import { PatientCareHeader } from '../components/patients/PatientCareHeader'
import { PharmacyDischargePanel } from '../components/pharmacy/PharmacyDischargePanel'

export function PharmacyDischargePage() {
  const { setSelectedPatient: setGlobalPatient } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const patientFromUrl = searchParams.get('patient') || ''

  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(
    () => patientFromUrl || undefined
  )

  useEffect(() => {
    setSelectedPatient(searchParams.get('patient') || undefined)
  }, [searchParams])

  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient)
    setGlobalPatient(patient)
    const next = new URLSearchParams(searchParams)
    if (patient) next.set('patient', patient)
    else next.delete('patient')
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="flex flex-col min-h-0">
      <PatientCareHeader
        selectedPatient={selectedPatient || ''}
        onPatientSelect={handlePatientSelect}
        skipStoredPatientRestore
      />
      <div className="flex-1 overflow-y-auto p-4">
        <section className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 min-h-[420px]">
          <PharmacyDischargePanel patient={selectedPatient} />
        </section>
      </div>
    </div>
  )
}
