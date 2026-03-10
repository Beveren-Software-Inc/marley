import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PatientVisitList } from '../components/patientVisits/PatientVisitList'
import { PatientVisitDetails } from '../components/patientVisits/PatientVisitDetails'
import { CreatePatientVisitModal } from '../components/patientVisits/CreatePatientVisitModal'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'

export const PatientVisitPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const visitFromUrl = searchParams.get('visit')
  const searchFromUrl = searchParams.get('search')
  const patientFromUrl = searchParams.get('patient')
  const [searchQuery, setSearchQuery] = useState<string>(searchFromUrl || '')
  const [showCreateVisit, setShowCreateVisit] = useState(false)

  if (visitFromUrl) {
    // Show visit details
    return (
      <div className="flex flex-col h-full">
        <header className="sticky top-0 z-10 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 flex items-center justify-between border-b border-white/20">
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
          <div className="flex items-center gap-3">
            <UserMenu />
            <NotificationBell />
          </div>
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

  // Show visit list - all visits if no patient selected, or filtered by patient if selected
  return (
    <>
      <div className="flex flex-col h-full">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0 max-w-xl">
            <div className="relative flex items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  const value = e.target.value
                  setSearchQuery(value)
                  const newSearchParams = new URLSearchParams(searchParams)
                  if (value.trim()) {
                    newSearchParams.set('search', value)
                  } else {
                    newSearchParams.delete('search')
                  }
                  setSearchParams(newSearchParams, { replace: true })
                }}
                placeholder="Search by visit number, patient name/file number, or practitioner..."
                className="flex-1 rounded-md border border-primary/40 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-white focus:border-white"
              />
              <button
                onClick={() => setShowCreateVisit(true)}
                className="flex-shrink-0 w-9 h-9 rounded-full bg-white text-primary flex items-center justify-center hover:bg-white/90 transition-colors text-xl font-bold shadow-md border border-white/50"
                title="Create New Patient Visit"
                aria-label="Create New Patient Visit"
              >
                +
              </button>
            </div>
          </div>
          <h1 className="flex-1 text-center text-lg font-semibold hidden md:block">Patient Visits</h1>
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
            onVisitSelect={(visitName) => {
              const newSearchParams = new URLSearchParams(searchParams)
              newSearchParams.set('visit', visitName)
              setSearchParams(newSearchParams, { replace: true })
            }} 
            searchQuery={searchQuery}
            patient={patientFromUrl || undefined}
          />
          </section>
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

