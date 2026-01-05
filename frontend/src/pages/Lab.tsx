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
  const screen = searchParams.get('screen')
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

  // Render based on screen
  if (screen === 'l-out') {
    // Outsourced Tests - show only lab tests where is_outsourced = 1
    return (
      <div className="flex flex-col">
        <header className="flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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

        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4">Outsourced Tests</div>
            <LabTestList patient={selectedPatient} isOutsourced={true} key={labTestRefreshKey} />
          </section>
        </div>
      </div>
    )
  }

  if (screen === 'l-results') {
    // Lab Test & Result - show all lab tests
    return (
      <div className="flex flex-col">
        <header className="flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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

        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4">Lab Test & Result</div>
            <LabTestList patient={selectedPatient} key={labTestRefreshKey} />
          </section>
        </div>
      </div>
    )
  }

  // Default view - Service Requests and Lab Tests side by side
  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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



