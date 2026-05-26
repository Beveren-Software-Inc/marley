import { PortalPatientHeader } from './PortalPatientHeader'

interface PortalTopBarProps {
  selectedPatient?: string
  onPatientSelect?: (patient: string | undefined) => void
}

/** Green patient-search bar shared across doctor/nurse portal screens. */
export const PortalTopBar = ({ selectedPatient = '', onPatientSelect }: PortalTopBarProps) => (
  <PortalPatientHeader
    selectedPatient={selectedPatient}
    onPatientSelect={onPatientSelect ?? (() => {})}
    patients={[]}
  />
)
