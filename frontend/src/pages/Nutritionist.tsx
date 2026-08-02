import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCareContext } from '../providers/CareContextProvider'
import { PatientCareHeader } from '../components/patients/PatientCareHeader'
import { DashboardCard } from '../components/ui/DashboardCard'
import { ClinicalNotesList } from '../components/clinicalNotes/ClinicalNotesList'
import { CreateClinicalNoteModal } from '../components/clinicalNotes/CreateClinicalNoteModal'
import { AdmissionList } from '../components/admissions/AdmissionList'
import { PatientVisitList } from '../components/patientVisits/PatientVisitList'
import { TherapySessionPanel } from '../components/therapy/TherapySessionPanel'

/** Nutritionist role hub — surfaces the "Nutritionist Note" clinical notes that also
 * appear in the doctor/nurse workspaces. */
export const NutritionistPage = () => {
  const {
    selectedPatient,
    setSelectedPatient,
    activeAdmission,
    guardClinicalCreate,
  } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const screen = searchParams.get('screen') || ''
  const [notesRefreshKey, setNotesRefreshKey] = useState(0)
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0)
  const [showNoteModal, setShowNoteModal] = useState(false)

  // Single source of truth: CareContext. No local/URL sync effects (those caused blink loops).
  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient)
    const next = new URLSearchParams(searchParams)
    if (patient) next.set('patient', patient)
    else next.delete('patient')
    setSearchParams(next, { replace: true })
  }

  const header = (
    <PatientCareHeader
      selectedPatient={selectedPatient || ''}
      onPatientSelect={handlePatientSelect}
      patients={[]}
    />
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

  if (screen === 'nut-notes') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">{notesCard()}</div>
        {createModal}
      </div>
    )
  }

  if (screen === 'nut-session') {
    return (
      <div className="flex flex-col h-full min-w-0">
        {header}
        <div className="flex-1 min-w-0 overflow-y-auto p-4">
          <TherapySessionPanel
            patient={selectedPatient}
            admissionNumber={activeAdmission || undefined}
            refreshKey={sessionRefreshKey}
            onRefresh={() => setSessionRefreshKey((k) => k + 1)}
            onPatientClick={handlePatientSelect}
          />
        </div>
      </div>
    )
  }

  if (screen === 'nut-appointments') {
    return (
      <div className="flex flex-col h-full min-w-0">
        {header}
        <div className="flex-1 min-w-0 overflow-y-auto p-4">
          <TherapySessionPanel
            patient={selectedPatient}
            admissionNumber={activeAdmission || undefined}
            refreshKey={sessionRefreshKey}
            onRefresh={() => setSessionRefreshKey((k) => k + 1)}
            onPatientClick={handlePatientSelect}
            initialTab="appointments"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {header}
      <div className="p-4 space-y-4">
        {notesCard({ fixedHeight: true })}
        <DashboardCard title="Patient Visits" fixedHeight>
          <PatientVisitList patient={selectedPatient} onPatientFromVisit={handlePatientSelect} />
        </DashboardCard>

        <DashboardCard title="Inpatient" fixedHeight>
          <AdmissionList patient={selectedPatient} onPatientFromAdmission={handlePatientSelect} />
        </DashboardCard>
      </div>
      {createModal}
    </div>
  )
}
