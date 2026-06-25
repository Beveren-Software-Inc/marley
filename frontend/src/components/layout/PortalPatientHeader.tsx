import { PatientSearch } from '../patients/PatientSearch'
import { NotificationBell } from '../notifications/NotificationBell'
import { UserMenu } from '../user/UserMenu'
import { MobileNavMenuButton } from './MobileNavMenuButton'

type PortalPatientHeaderProps = {
  selectedPatient: string
  onPatientSelect: (patient: string | undefined) => void
  patients?: string[]
  showAlertsBanner?: boolean
  skipStoredPatientRestore?: boolean
}

/** Green patient-search bar: mobile menu + search rows; desktop adds profile & notifications. */
export function PortalPatientHeader({
  selectedPatient,
  onPatientSelect,
  patients = [],
  showAlertsBanner,
  skipStoredPatientRestore,
}: PortalPatientHeaderProps) {
  const searchProps = {
    selectedPatient,
    onPatientSelect,
    patients,
    showAlertsBanner,
    skipStoredPatientRestore,
    leadingSlot: <MobileNavMenuButton />,
  }

  return (
    <>
      <header className="md:hidden bg-primary text-white px-3 py-2 border-b border-white/20 shrink-0">
        <PatientSearch {...searchProps} renderAlertsPortal={false} />
      </header>
      <header className="hidden md:flex items-center gap-3 bg-primary text-white px-4 py-3 border-b border-white/20 shrink-0">
        <div className="flex-1 min-w-0">
          <PatientSearch
            selectedPatient={selectedPatient}
            onPatientSelect={onPatientSelect}
            patients={patients}
            showAlertsBanner={showAlertsBanner}
            skipStoredPatientRestore={skipStoredPatientRestore}
          />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <UserMenu placement="header" />
          <NotificationBell placement="header" />
        </div>
      </header>
    </>
  )
}
