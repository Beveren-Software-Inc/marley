import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCareContext } from '../providers/CareContextProvider'
import { PatientCareHeader } from '../components/patients/PatientCareHeader'
import { ClinicalNotesList } from '../components/clinicalNotes/ClinicalNotesList'
import { CreateClinicalNoteModal } from '../components/clinicalNotes/CreateClinicalNoteModal'
import { DiagnosisSymptomsScreen } from '../components/diagnosis/DiagnosisSymptomsScreen'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { PatientHistoryList } from '../components/patientHistory/PatientHistoryList'
import { PhysicalExaminationList } from '../components/physicalExam/PhysicalExaminationList'
import { MedicalHistoryView } from '../components/medicalHistory/MedicalHistoryView'
import { PatientSummaryCard } from '../components/patients/PatientSummaryCard'
import { DashboardCard } from '../components/ui/DashboardCard'

export const PsychologistPage = () => {
  const { selectedPatient: globalPatient, setSelectedPatient: setGlobalPatient, guardClinicalCreate } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const screen = searchParams.get('screen') || ''
  const patientFromUrl = searchParams.get('patient') || ''

  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(() => patientFromUrl || globalPatient || undefined)

  const [showPsychNoteModal, setShowPsychNoteModal] = useState(false)
  const [showPsychOrderModal, setShowPsychOrderModal] = useState(false)

  const [clinicalNotesRefreshKey, setClinicalNotesRefreshKey] = useState(0)

  useEffect(() => {
    const patientParam = searchParams.get('patient')
    if (patientParam && patientParam !== selectedPatient) {
      setSelectedPatient(patientParam)
    }
  }, [searchParams, selectedPatient])

  // Restore patient in URL when sidebar navigation drops the query param
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

  // ── Psychologist Notes ────────────────────────────────────────────────────────
  if (screen === 'p-notes') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <DashboardCard
            title="Psychologist Notes"
            onAdd={() => guardClinicalCreate(() => setShowPsychNoteModal(true))}
            addButtonTitle="Add Psychologist Note"
            noHeightLimit
          >
            <ClinicalNotesList
              patient={selectedPatient}
              clinicalNoteType="Psychologist Note"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showPsychNoteModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowPsychNoteModal(false)}
            onSuccess={() => { setClinicalNotesRefreshKey(p => p + 1); setShowPsychNoteModal(false) }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Psychologist Note"
            title="Add Psychologist Note"
          />
        )}
      </div>
    )
  }

  // ── Psychologist Orders ───────────────────────────────────────────────────────
  if (screen === 'p-orders') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <DashboardCard
            title="Psychologist Orders"
            onAdd={() => guardClinicalCreate(() => setShowPsychOrderModal(true))}
            addButtonTitle="Add Psychologist Order"
            noHeightLimit
          >
            <ClinicalNotesList
              patient={selectedPatient}
              clinicalNoteType="Psychologist Order"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showPsychOrderModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowPsychOrderModal(false)}
            onSuccess={() => { setClinicalNotesRefreshKey(p => p + 1); setShowPsychOrderModal(false) }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Psychologist Order"
            title="Add Psychologist Order"
          />
        )}
      </div>
    )
  }

  // ── Diagnoses (read-only for psychologist) ──────────────────────────────────
  if (screen === 'p-dx') {
    return (
      <div className="flex flex-col h-[calc(100dvh-2.25rem)] max-h-[calc(100dvh-2.25rem)] overflow-hidden">
        {header}
        <div className="flex-1 min-h-0 overflow-hidden">
          <DiagnosisSymptomsScreen allowCreate={false} />
        </div>
      </div>
    )
  }

  // ── Warning Messages (read-only) ──────────────────────────────────────────────
  if (screen === 'p-warn') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <DashboardCard title="Warning Messages" noHeightLimit>
            <WarningMessagesList patient={selectedPatient} onPatientClick={handlePatientSelect} />
          </DashboardCard>
        </div>
      </div>
    )
  }

  // ── Medical History / Allergies (read-only) ───────────────────────────────────
  if (screen === 'p-mh') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <DashboardCard title="Medical History / Allergies" noHeightLimit filterable={false}>
            {selectedPatient ? (
              <MedicalHistoryView patient={selectedPatient} />
            ) : (
              <div className="py-16 text-center text-slate-400">Select a patient to view medical history.</div>
            )}
          </DashboardCard>
        </div>
      </div>
    )
  }

  // ── Patient History (read-only) ───────────────────────────────────────────────
  if (screen === 'p-patient-history') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <DashboardCard title="Patient History" noHeightLimit>
            <PatientHistoryList patient={selectedPatient} onPatientClick={handlePatientSelect} />
          </DashboardCard>
        </div>
      </div>
    )
  }

  // ── Physical Examination (read-only) ──────────────────────────────────────────
  if (screen === 'p-physical') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <DashboardCard title="Physical Examination" noHeightLimit filterable={false}>
            <PhysicalExaminationList patient={selectedPatient} onPatientClick={handlePatientSelect} />
          </DashboardCard>
        </div>
      </div>
    )
  }

  // ── Default Dashboard ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      {header}
      <div className="p-4 space-y-4">
        {selectedPatient && <PatientSummaryCard patient={selectedPatient} />}

        <div className="grid gap-4 md:grid-cols-2">
          <DashboardCard
            title="Psychologist Notes"
            listingScreen="p-notes"
            onAdd={() => guardClinicalCreate(() => setShowPsychNoteModal(true))}
            addButtonTitle="Add Psychologist Note"
            fixedHeight
          >
            <ClinicalNotesList
              patient={selectedPatient}
              clinicalNoteType="Psychologist Note"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>

          <DashboardCard
            title="Psychologist Orders"
            listingScreen="p-orders"
            onAdd={() => guardClinicalCreate(() => setShowPsychOrderModal(true))}
            addButtonTitle="Add Psychologist Order"
            fixedHeight
          >
            <ClinicalNotesList
              patient={selectedPatient}
              clinicalNoteType="Psychologist Order"
              key={`order-${clinicalNotesRefreshKey}`}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>

          <DashboardCard title="Warning Messages" listingScreen="p-warn" fixedHeight>
            <WarningMessagesList patient={selectedPatient} onPatientClick={handlePatientSelect} />
          </DashboardCard>

          <DashboardCard title="Patient History" listingScreen="p-patient-history" fixedHeight>
            <PatientHistoryList patient={selectedPatient} onPatientClick={handlePatientSelect} />
          </DashboardCard>

          <DashboardCard title="Physical Examination" listingScreen="p-physical" fixedHeight filterable={false}>
            <PhysicalExaminationList patient={selectedPatient} onPatientClick={handlePatientSelect} />
          </DashboardCard>

          <DashboardCard title="Medical History / Allergies" listingScreen="p-mh" fixedHeight filterable={false}>
            {selectedPatient ? (
              <MedicalHistoryView patient={selectedPatient} />
            ) : (
              <p className="py-4 text-center text-sm text-slate-400">Select a patient</p>
            )}
          </DashboardCard>
        </div>
      </div>

      {showPsychNoteModal && (
        <CreateClinicalNoteModal
          onClose={() => setShowPsychNoteModal(false)}
          onSuccess={() => { setClinicalNotesRefreshKey(p => p + 1); setShowPsychNoteModal(false) }}
          initialPatient={selectedPatient}
          defaultClinicalNoteType="Psychologist Note"
          title="Add Psychologist Note"
        />
      )}
      {showPsychOrderModal && (
        <CreateClinicalNoteModal
          onClose={() => setShowPsychOrderModal(false)}
          onSuccess={() => { setClinicalNotesRefreshKey(p => p + 1); setShowPsychOrderModal(false) }}
          initialPatient={selectedPatient}
          defaultClinicalNoteType="Psychologist Order"
          title="Add Psychologist Order"
        />
      )}
    </div>
  )
}
