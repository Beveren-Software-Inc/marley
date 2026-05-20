import { PatientSearch } from '../patients/PatientSearch'
import { UserMenu } from '../user/UserMenu'
import { NotificationBell } from '../notifications/NotificationBell'

interface PortalTopBarProps {
  selectedPatient?: string
  onPatientSelect?: (patient: string | undefined) => void
}

/** Green patient-search bar shared across doctor/nurse portal screens. */
export const PortalTopBar = ({ selectedPatient = '', onPatientSelect }: PortalTopBarProps) => (
  <header className="sticky top-0 z-30 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20 shrink-0">
    <div className="flex-1 min-w-0">
      <PatientSearch
        selectedPatient={selectedPatient}
        onPatientSelect={onPatientSelect ?? (() => {})}
        patients={[]}
      />
    </div>
    <div className="flex items-center gap-3 flex-shrink-0">
      <UserMenu />
      <NotificationBell />
    </div>
  </header>
)
