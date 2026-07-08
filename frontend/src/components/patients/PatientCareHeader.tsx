import { ClosedCareEpisodeBanner } from '../ui/ClosedCareEpisodeBanner'
import { PortalPatientHeader } from '../layout/PortalPatientHeader'

type PatientCareHeaderProps = {
  selectedPatient: string
  onPatientSelect: (patient: string | undefined) => void
  patients?: string[]
  showAlertsBanner?: boolean
  skipStoredPatientRestore?: boolean
}

/** Primary navbar + closed-care-episode notice directly underneath (above page cards). */
export function PatientCareHeader({
  selectedPatient,
  onPatientSelect,
  patients = [],
  showAlertsBanner,
  skipStoredPatientRestore,
}: PatientCareHeaderProps) {
  return (
    <div className="sticky top-0 z-30 flex flex-col flex-shrink-0">
      <PortalPatientHeader
        selectedPatient={selectedPatient}
        onPatientSelect={onPatientSelect}
        patients={patients}
        showAlertsBanner={showAlertsBanner}
        skipStoredPatientRestore={skipStoredPatientRestore}
      />
      <ClosedCareEpisodeBanner />
    </div>
  )
}
