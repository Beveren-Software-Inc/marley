import { PatientSearch } from './PatientSearch'
import { NotificationBell } from '../notifications/NotificationBell'
import { UserMenu } from '../user/UserMenu'
import { ClosedCareEpisodeBanner } from '../ui/ClosedCareEpisodeBanner'

type PatientCareHeaderProps = {
  selectedPatient: string
  onPatientSelect: (patient: string | undefined) => void
  patients?: string[]
  showAlertsBanner?: boolean
}

/** Primary navbar + closed-care-episode notice directly underneath (above page cards). */
export function PatientCareHeader({
  selectedPatient,
  onPatientSelect,
  patients = [],
  showAlertsBanner,
}: PatientCareHeaderProps) {
  return (
    <div className="sticky top-0 z-20 flex flex-col flex-shrink-0">
      <header className="flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
        <div className="flex-1 min-w-0">
          <PatientSearch
            selectedPatient={selectedPatient}
            onPatientSelect={onPatientSelect}
            patients={patients}
            showAlertsBanner={showAlertsBanner}
          />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <UserMenu />
          <NotificationBell />
        </div>
      </header>
      <ClosedCareEpisodeBanner />
    </div>
  )
}
