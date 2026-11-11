import { ClinicalNotesList } from './ClinicalNotesList'
import { DashboardCard } from '../ui/DashboardCard'
import { AdmissionList } from '../admissions/AdmissionList'
import { PatientVisitList } from '../patientVisits/PatientVisitList'
import { TherapyNotesViewToggle } from '../therapy/TherapyNotesViewToggle'
import { useNotesViewPreference } from '../../hooks/useNotesViewPreference'
import { useCareContext } from '../../providers/CareContextProvider'

interface NotesCareViewCardProps {
  /** Card title while the notes listing is active. */
  title: string
  patient?: string
  clinicalNoteType: string
  includeClinicalNoteTypes?: string[]
  scopeToCareContext?: boolean
  refreshKey?: number
  onPatientClick?: (patient: string | undefined) => void
  onAdd?: () => void
  addButtonTitle: string
  listingScreen?: string
  fixedHeight?: boolean
  noHeightLimit?: boolean
  /** Show ⋮ Edit for notes still within 24h of creation (therapy notes). */
  allowEditWithin24h?: boolean
  /** localStorage key used to keep the selected view across refreshes. */
  viewStorageKey: string
  /** Render only the notes list (no DashboardCard or view toggle). */
  embedded?: boolean
  /** Title passed to ClinicalNotesList. Defaults to `title`. */
  notesListTitle?: string
}

/**
 * Notes card whose header can switch in place between the notes listing,
 * the patient's admissions and their OP visits. The selected view is saved
 * per card so it survives a page refresh.
 */
export function NotesCareViewCard({
  title,
  patient,
  clinicalNoteType,
  includeClinicalNoteTypes,
  scopeToCareContext,
  refreshKey = 0,
  onPatientClick,
  onAdd,
  addButtonTitle,
  listingScreen,
  fixedHeight = false,
  noHeightLimit = false,
  allowEditWithin24h,
  viewStorageKey,
  embedded = false,
  notesListTitle,
}: NotesCareViewCardProps) {
  const { applyIpCareContext } = useCareContext()
  const [view, setView] = useNotesViewPreference(viewStorageKey)

  const notesList = (
    <ClinicalNotesList
      patient={patient}
      clinicalNoteType={clinicalNoteType}
      includeClinicalNoteTypes={includeClinicalNoteTypes}
      scopeToCareContext={scopeToCareContext}
      title={notesListTitle ?? title}
      key={refreshKey}
      onPatientClick={onPatientClick}
      onAdd={embedded ? onAdd : undefined}
      allowEditWithin24h={allowEditWithin24h}
    />
  )

  if (embedded) return notesList

  const body =
    view === 'admission' ? (
      <AdmissionList
        patient={patient}
        onPatientFromAdmission={onPatientClick}
        onAdmissionActivate={(record) => {
          // Align the page patient first, then apply IP context so the
          // provider's patient-change cleanup cannot clear the admission.
          if (record.patient) onPatientClick?.(record.patient)
          applyIpCareContext({
            patient: record.patient,
            admission: record.name,
            admissionLabel: record.name,
          })
          setView('notes')
        }}
      />
    ) : view === 'visit' ? (
      <PatientVisitList
        patient={patient}
        onPatientFromVisit={onPatientClick}
        onVisitActivate={() => setView('notes')}
      />
    ) : (
      notesList
    )

  return (
    <DashboardCard
      title={view === 'admission' ? 'Admissions' : view === 'visit' ? 'OP Visits' : title}
      listingScreen={listingScreen}
      onAdd={onAdd}
      addButtonTitle={addButtonTitle}
      headerExtra={<TherapyNotesViewToggle view={view} onChange={setView} />}
      fixedHeight={fixedHeight}
      noHeightLimit={noHeightLimit}
    >
      {body}
    </DashboardCard>
  )
}
