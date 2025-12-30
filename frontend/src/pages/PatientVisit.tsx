import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PatientVisitList } from '../components/patientVisits/PatientVisitList'
import { PatientVisitDetails } from '../components/patientVisits/PatientVisitDetails'
import { CreatePatientVisitModal } from '../components/patientVisits/CreatePatientVisitModal'
import { NotificationBell } from '../components/notifications/NotificationBell'

export const PatientVisitPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const visitFromUrl = searchParams.get('visit')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [showCreateVisit, setShowCreateVisit] = useState(false)

  if (visitFromUrl) {
    // Show visit details
    return (
      <div className="flex flex-col h-full">
        <header className="bg-primary text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                const newSearchParams = new URLSearchParams(searchParams)
                newSearchParams.delete('visit')
                setSearchParams(newSearchParams, { replace: true })
              }}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-md text-sm transition-colors"
            >
              ← Back to Visits
            </button>
            <h1 className="text-lg font-semibold">Patient Visit: {visitFromUrl}</h1>
          </div>
          <NotificationBell />
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4">Visit Details</div>
            <PatientVisitDetails 
              visitNo={visitFromUrl} 
              onUpdate={() => {
                // Refresh if needed
                window.location.reload()
              }}
            />
          </section>
        </div>
      </div>
    )
  }

  // Show visit list
  return (
    <>
      <div className="flex flex-col h-full">
        <header className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center gap-3 bg-primary text-white px-4 py-3">
          <div className="w-full max-w-xl">
            <div className="relative flex items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by visit number, patient name/file number, or practitioner..."
                className="flex-1 rounded-md border border-primary/40 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-white focus:border-white"
              />
              <button
                onClick={() => setShowCreateVisit(true)}
                className="flex-shrink-0 w-10 h-10 rounded-md bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
                title="Create New Patient Visit"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex items-center justify-center gap-3">
            <h1 className="text-lg font-semibold">Patient Visits</h1>
            <NotificationBell />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <PatientVisitList 
            onVisitSelect={(visitName) => {
              const newSearchParams = new URLSearchParams(searchParams)
              newSearchParams.set('visit', visitName)
              setSearchParams(newSearchParams, { replace: true })
            }} 
            searchQuery={searchQuery} 
          />
        </div>
      </div>

      {showCreateVisit && (
        <CreatePatientVisitModal
          onClose={() => setShowCreateVisit(false)}
          onSuccess={(visitName) => {
            setShowCreateVisit(false)
            const newSearchParams = new URLSearchParams(searchParams)
            newSearchParams.set('visit', visitName)
            setSearchParams(newSearchParams, { replace: true })
          }}
        />
      )}
    </>
  )
}

