import { useParams, useNavigate } from 'react-router-dom'
import { PatientVisitDetails } from '../components/patientVisits/PatientVisitDetails'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'

/**
 * Standalone page for a single Patient Visit (by route /patient-visit/:visitName).
 * Used when opening a visit from IOP Enrollments or Appointments so the link
 * stays inside the healthcare app instead of a blank page.
 */
export const PatientVisitDetailPage = () => {
  const { visitName } = useParams<{ visitName: string }>()
  const navigate = useNavigate()

  if (!visitName) {
    return (
      <div className="p-4 text-slate-600">
        Missing visit reference. <button type="button" onClick={() => navigate('/reception')} className="text-primary underline">Go to Reception</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <header className="sticky top-0 z-10 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 flex items-center justify-between border-b border-white/20">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/reception')}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-md text-sm transition-colors"
          >
            ← Back to Reception
          </button>
          <h1 className="text-lg font-semibold">Patient Visit: {visitName}</h1>
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
            visitNo={visitName}
            onUpdate={() => window.location.reload()}
          />
        </section>
      </div>
    </div>
  )
}
