import { PatientList } from '../components/patients/PatientList'
import { PatientSearch } from '../components/patients/PatientSearch'
import { UserMenu } from '../components/user/UserMenu'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

export const PatientPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()

  // ✅ Initialize directly from URL (no undefined variables)
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(() => {
    return searchParams.get('patient') || undefined
  })

  // ✅ Sync with URL WITHOUT causing cascading renders
  useEffect(() => {
    const patientParam = searchParams.get('patient')

    setSelectedPatient(prev => {
      if (prev === patientParam) return prev // ✅ prevents loop
      return patientParam || undefined
    })
  }, [searchParams])

  // ✅ Handle selection + update URL
  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient)

    const newParams = new URLSearchParams(searchParams)

    if (patient) {
      newParams.set('patient', patient)
    } else {
      newParams.delete('patient')
    }

    setSearchParams(newParams, { replace: true })
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
        <div className="flex-1 min-w-0">
          <PatientSearch
            selectedPatient={selectedPatient || ''}
            onPatientSelect={handlePatientSelect}
            patients={[]}
          />
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <UserMenu />
          <NotificationBell />
        </div>
      </header>

      {/* Content */}
      <div className="flex flex-col gap-4 p-4">
        {/* Patient List Section */}
        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Patients</h2>
          </div>

          <PatientList />
        </section>
      </div>
    </div>
  )
}