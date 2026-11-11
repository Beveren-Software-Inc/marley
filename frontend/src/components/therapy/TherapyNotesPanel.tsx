import { useState } from 'react'
import { CreateClinicalNoteModal } from '../clinicalNotes/CreateClinicalNoteModal'
import { NotesCareViewCard } from '../clinicalNotes/NotesCareViewCard'
import { THERAPY_EXTRA_NOTE_TYPES } from '../clinicalNotes/noteTypeGroups'
import { DEFAULT_NOTES_VIEW_STORAGE_KEYS } from '../../hooks/useNotesViewPreference'
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

  return (
    <>
      <NotesCareViewCard
        title="Therapy Notes"
        notesListTitle="Therapy Notes"
        patient={patient}
        clinicalNoteType="Therapist Note"
        includeClinicalNoteTypes={THERAPY_EXTRA_NOTE_TYPES}
        scopeToCareContext={false}
        refreshKey={refreshKey}
        onPatientClick={onPatientClick}
        onAdd={() => guardClinicalCreate(() => setShowModal(true))}
        addButtonTitle="Add Therapy Note"
        listingScreen={listingScreen}
        fixedHeight={fixedHeight}
        noHeightLimit={!fixedHeight}
        allowEditWithin24h
        viewStorageKey={DEFAULT_NOTES_VIEW_STORAGE_KEYS.therapy}
        embedded={embedded}
      />

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
