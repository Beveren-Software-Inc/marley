import { useState } from 'react'
import { ClinicalNotesList } from '../clinicalNotes/ClinicalNotesList'
import { CreateClinicalNoteModal } from '../clinicalNotes/CreateClinicalNoteModal'
import { DashboardCard } from '../ui/DashboardCard'
import { useCareContext } from '../../providers/CareContextProvider'

interface TherapyNotesPanelProps {
  patient?: string
  refreshKey?: number
  onRefresh?: () => void
  onPatientClick?: (patient: string | undefined) => void
  embedded?: boolean
  listingScreen?: string
  fixedHeight?: boolean
}

export function TherapyNotesPanel({
  patient,
  refreshKey = 0,
  onRefresh,
  onPatientClick,
  embedded = false,
  listingScreen,
  fixedHeight,
}: TherapyNotesPanelProps) {
  const { guardClinicalCreate } = useCareContext()
  const [showModal, setShowModal] = useState(false)

  const list = (
    <ClinicalNotesList
      patient={patient}
      clinicalNoteType="Therapist Note"
      title="Therapy Notes"
      key={refreshKey}
      onPatientClick={onPatientClick}
      onAdd={embedded ? () => guardClinicalCreate(() => setShowModal(true)) : undefined}
      allowEditWithin24h
    />
  )

  return (
    <>
      {embedded ? (
        list
      ) : (
        <DashboardCard
          title="Therapy Notes"
          listingScreen={listingScreen}
          onAdd={() => guardClinicalCreate(() => setShowModal(true))}
          addButtonTitle="Add Therapy Note"
          fixedHeight={fixedHeight}
          noHeightLimit={!fixedHeight}
        >
          {list}
        </DashboardCard>
      )}

      {showModal && (
        <CreateClinicalNoteModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            onRefresh?.()
            setShowModal(false)
          }}
          initialPatient={patient}
          defaultClinicalNoteType="Therapist Note"
          title="Add Therapy Note"
        />
      )}
    </>
  )
}
