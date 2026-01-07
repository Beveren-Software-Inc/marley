import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PatientSearch } from '../components/patients/PatientSearch'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'
import { ServiceRequestList } from '../components/serviceRequests/ServiceRequestList'
import { LabTestList } from '../components/labTests/LabTestList'
import { CreateLabTestModal } from '../components/labTests/CreateLabTestModal'
import { CreateServiceRequestModal } from '../components/serviceRequests/CreateServiceRequestModal'

export const LabPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const patientFromUrl = searchParams.get('patient')
  const screen = searchParams.get('screen')
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(patientFromUrl || undefined)
  const [labTestRefreshKey, setLabTestRefreshKey] = useState(0)
  const [showLabTestModal, setShowLabTestModal] = useState(false)
  const [showServiceRequestModal, setShowServiceRequestModal] = useState(false)
  const [serviceRequestRefreshKey, setServiceRequestRefreshKey] = useState(0)

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
    setServiceRequestRefreshKey(prev => prev + 1) // Also refresh service requests
  }

  const handleServiceRequestCreated = () => {
    setServiceRequestRefreshKey(prev => prev + 1)
  }

  // Render based on screen
  if (screen === 'l-req') {
    // Lab Test Requests - show service requests with Lab Test Template
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
            <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
              <span>Lab Test Requests</span>
              <button
                onClick={() => setShowServiceRequestModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                title="Add Service Request"
              >
                +
              </button>
            </div>
            <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
              <ServiceRequestList 
                patient={selectedPatient} 
                onLabTestCreated={handleLabTestCreated}
                refreshKey={serviceRequestRefreshKey}
              />
            </div>
          </section>
        </div>
        {showServiceRequestModal && (
          <CreateServiceRequestModal
            onClose={() => setShowServiceRequestModal(false)}
            onSuccess={() => {
              setShowServiceRequestModal(false)
              handleServiceRequestCreated()
            }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  if (screen === 'l-out') {
    // Outsourced Tests - show only lab tests where is_outsourced = 1
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
            <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
              <span>Outsourced Tests</span>
              <button
                onClick={() => setShowLabTestModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                title="Add Lab Test"
              >
                +
              </button>
            </div>
            <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
              <LabTestList patient={selectedPatient} isOutsourced={true} key={labTestRefreshKey} />
            </div>
          </section>
        </div>
        {showLabTestModal && (
          <CreateLabTestModal
            onClose={() => setShowLabTestModal(false)}
            onSuccess={() => {
              setShowLabTestModal(false)
              handleLabTestCreated()
            }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  if (screen === 'l-results') {
    // Lab Test & Result - show all lab tests
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20">
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
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
            <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
              <span>Lab Test & Result</span>
              <button
                onClick={() => setShowLabTestModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                title="Add Lab Test"
              >
                +
              </button>
            </div>
            <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
              <LabTestList patient={selectedPatient} key={labTestRefreshKey} />
            </div>
          </section>
        </div>
        {showLabTestModal && (
          <CreateLabTestModal
            onClose={() => setShowLabTestModal(false)}
            onSuccess={() => {
              setShowLabTestModal(false)
              handleLabTestCreated()
            }}
            initialPatient={selectedPatient}
          />
        )}
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
        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
          <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
            <span>Service Requests</span>
            <button
              onClick={() => setShowServiceRequestModal(true)}
              className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
              title="Add Service Request"
            >
              +
            </button>
          </div>
          <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
            <ServiceRequestList 
              patient={selectedPatient} 
              onLabTestCreated={handleLabTestCreated}
              refreshKey={serviceRequestRefreshKey}
            />
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
          <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
            <span>Lab Tests</span>
            <button
              onClick={() => setShowLabTestModal(true)}
              className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
              title="Add Lab Test"
            >
              +
            </button>
          </div>
          <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
            <LabTestList patient={selectedPatient} key={labTestRefreshKey} />
          </div>
        </section>
      </div>

      {showLabTestModal && (
        <CreateLabTestModal
          onClose={() => setShowLabTestModal(false)}
          onSuccess={() => {
            setShowLabTestModal(false)
            handleLabTestCreated()
          }}
          initialPatient={selectedPatient}
        />
      )}

      {showServiceRequestModal && (
        <CreateServiceRequestModal
          onClose={() => setShowServiceRequestModal(false)}
          onSuccess={() => {
            setShowServiceRequestModal(false)
            handleServiceRequestCreated()
          }}
          initialPatient={selectedPatient}
        />
      )}
    </div>
  )
}



