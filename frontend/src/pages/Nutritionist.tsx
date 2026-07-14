import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCareContext } from '../providers/CareContextProvider'
import { PatientCareHeader } from '../components/patients/PatientCareHeader'
import { PatientSummaryCard } from '../components/patients/PatientSummaryCard'
import { DashboardCard } from '../components/ui/DashboardCard'
import { ClinicalNotesList } from '../components/clinicalNotes/ClinicalNotesList'
import { CreateClinicalNoteModal } from '../components/clinicalNotes/CreateClinicalNoteModal'

/** Nutritionist role hub — surfaces the "Nutritionist Note" clinical notes that also
 * appear in the doctor/nurse workspaces. Modelled on the Occupational Therapist page. */
export const NutritionistPage = () => {
  const {
    selectedPatient: globalPatient,
    setSelectedPatient: setGlobalPatient,
    guardClinicalCreate,
  } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const screen = searchParams.get('screen') || ''
  const patientFromUrl = searchParams.get('patient') || ''

  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(
    () => patientFromUrl || globalPatient || undefined
  )
  const [notesRefreshKey, setNotesRefreshKey] = useState(0)
  const [showNoteModal, setShowNoteModal] = useState(false)

  useEffect(() => {
    const patientParam = searchParams.get('patient')
    if (patientParam && patientParam !== selectedPatient) {
      setSelectedPatient(patientParam)
    }
  }, [searchParams, selectedPatient])

  useEffect(() => {
    const patient = selectedPatient || globalPatient
    if (!patient) return
    if (searchParams.get('patient')) return
    const next = new URLSearchParams(searchParams)
    next.set('patient', patient)
    setSearchParams(next, { replace: true })
  }, [screen, selectedPatient, globalPatient, searchParams, setSearchParams])

  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient)
    setGlobalPatient(patient)
    const next = new URLSearchParams(searchParams)
    if (patient) next.set('patient', patient)
    else next.delete('patient')
    setSearchParams(next, { replace: true })
  }

  const headerPatient = selectedPatient || globalPatient || ''
  const header = (
    <PatientCareHeader selectedPatient={headerPatient} onPatientSelect={handlePatientSelect} patients={[]} />
  )

  const notesCard = (opts?: { listingScreen?: string; fixedHeight?: boolean }) => (
    <DashboardCard
      title="Nutritionist Notes"
      listingScreen={opts?.listingScreen}
      fixedHeight={opts?.fixedHeight}
      onAdd={() => guardClinicalCreate(() => setShowNoteModal(true))}
      addButtonTitle="Add Nutritionist Note"
    >
      <ClinicalNotesList
        patient={selectedPatient}
        clinicalNoteType="Nutritionist Note"
        key={notesRefreshKey}
        onPatientClick={handlePatientSelect}
      />
    </DashboardCard>
  )

  const createModal = showNoteModal && (
    <CreateClinicalNoteModal
      onClose={() => setShowNoteModal(false)}
      onSuccess={() => {
        setNotesRefreshKey((k) => k + 1)
        setShowNoteModal(false)
      }}
      initialPatient={selectedPatient}
      defaultClinicalNoteType="Nutritionist Note"
      title="Add Nutritionist Note"
    />
  )

  // Full-screen Nutritionist Notes view (sidebar link / card expand)
  if (screen === 'nut-notes') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">{notesCard()}</div>
        {createModal}
      </div>
    )
  }

  // Default landing
  return (
    <div className="flex flex-col">
      {header}
      <div className="p-4 space-y-4">
        {selectedPatient && <PatientSummaryCard patient={selectedPatient} />}
        {notesCard()}
      </div>
      {createModal}
    </div>
  )
}
