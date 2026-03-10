import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PatientVisitList } from '../components/patientVisits/PatientVisitList'
import { CreatePatientVisitModal } from '../components/patientVisits/CreatePatientVisitModal'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'
import { PatientSearch } from '../components/patients/PatientSearch'

export const PatientVisitPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchFromUrl = searchParams.get('search')
  const patientFromUrl = searchParams.get('patient')
  const [searchQuery, setSearchQuery] = useState<string>(searchFromUrl || '')
  const [showCreateVisit, setShowCreateVisit] = useState(false)
  const [visitRefreshKey, setVisitRefreshKey] = useState(0)
  const [selectedPatient, setSelectedPatient] = useState<string>(patientFromUrl || '')

  const handlePatientSelect = (patient: string | undefined) => {
    const value = patient || ''
    setSelectedPatient(value)
    const newSearchParams = new URLSearchParams(searchParams)
    if (value) {
      newSearchParams.set('patient', value)
    } else {
      newSearchParams.delete('patient')
    }
    setSearchParams(newSearchParams, { replace: true })
  }

  // Show visit list - all visits if no patient selected, or filtered by patient if selected
  return (
    <>
      <div className="flex flex-col h-full">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient}
              onPatientSelect={handlePatientSelect}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800">Patient Visits</h2>
              <button
                onClick={() => setShowCreateVisit(true)}
                className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-lg font-bold flex-shrink-0"
                title="Create New Patient Visit"
                aria-label="Create New Patient Visit"
              >
                +
              </button>
            </div>
            <PatientVisitList 
              searchQuery={searchQuery}
              patient={selectedPatient || undefined}
              refreshKey={visitRefreshKey}
            />
          </section>
        </div>
      </div>

      {showCreateVisit && (
        <CreatePatientVisitModal
          onClose={() => setShowCreateVisit(false)}
          onSuccess={(visitName) => {
            setShowCreateVisit(false)
            setVisitRefreshKey(prev => prev + 1)
          }}
        />
      )}
    </>
  )
}

