import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PatientSearch } from '../components/patients/PatientSearch'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'
import { ServiceRequestList } from '../components/serviceRequests/ServiceRequestList'
import { LabTestList } from '../components/labTests/LabTestList'

export const LabPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const patientFromUrl = searchParams.get('patient')
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(patientFromUrl || undefined)
  const [labTestRefreshKey, setLabTestRefreshKey] = useState(0)

  // Sync selectedPatient with URL on mount and when URL changes
  useEffect(() => {
    const patientParam = searchParams.get('patient')
    if (patientParam && patientParam !== selectedPatient) {
      setSelectedPatient(patientParam)
    }
  }, [searchParams])

  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient)
    const newSearchParams = new URLSearchParams(searchParams)
    if (patient) {
      newSearchParams.set('patient', patient)
    } else {
      newSearchParams.delete('patient')
    }
    setSearchParams(newSearchParams, { replace: true })
  }

  const handleLabTestCreated = () => {
    setLabTestRefreshKey(prev => prev + 1)
  }

  return (
    <div className="flex flex-col">
      <header className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
        <PatientSearch
          selectedPatient={selectedPatient || ''}
          onPatientSelect={handlePatientSelect}
          patients={[]}
        />
        <div className="flex items-center justify-end gap-3">
          <UserMenu />
          <NotificationBell />
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 p-4">
        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="font-semibold mb-4">Service Requests</div>
          <ServiceRequestList 
            patient={selectedPatient} 
            onLabTestCreated={handleLabTestCreated}
          />
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="font-semibold mb-4">Lab Tests</div>
          <LabTestList patient={selectedPatient} key={labTestRefreshKey} />
        </section>
      </div>
    </div>
  )
}



