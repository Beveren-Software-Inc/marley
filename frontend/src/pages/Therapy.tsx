import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCareContext } from '../providers/CareContextProvider'
import { PatientCareHeader } from '../components/patients/PatientCareHeader'
import { PatientSummaryCard } from '../components/patients/PatientSummaryCard'
import { DashboardCard } from '../components/ui/DashboardCard'
import { TherapyNotesPanel } from '../components/therapy/TherapyNotesPanel'
import { TherapySessionPanel } from '../components/therapy/TherapySessionPanel'
import { ClinicalNotesList } from '../components/clinicalNotes/ClinicalNotesList'
import { DoctorOrderList } from '../components/doctorOrder/DoctorOrderList'
import { MainNursingNoteList } from '../components/nursing/MainNursingNoteList'

export const TherapyPage = () => {
  const {
    selectedPatient: globalPatient,
    setSelectedPatient: setGlobalPatient,
    activeAdmission,
  } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const screen = searchParams.get('screen') || ''
  const patientFromUrl = searchParams.get('patient') || ''

  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(
    () => patientFromUrl || globalPatient || undefined
  )
  const [notesRefreshKey, setNotesRefreshKey] = useState(0)
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0)

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

  if (screen === 't-notes') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <TherapyNotesPanel
            patient={selectedPatient}
            refreshKey={notesRefreshKey}
            onRefresh={() => setNotesRefreshKey((k) => k + 1)}
            onPatientClick={handlePatientSelect}
          />
        </div>
      </div>
    )
  }

  if (screen === 't-session') {
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

  // Appointments — same panel as Session Scheduler, landing on the Appointments tab.
  if (screen === 't-appointments') {
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

  // ── Documentation (read-only, mirrors doctor & nurse) ────────────────────────
  if (screen === 'th-doctor-order') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <DoctorOrderList
              patient={selectedPatient}
              admission={activeAdmission || undefined}
              onPatientClick={handlePatientSelect}
            />
          </section>
        </div>
      </div>
    )
  }

  if (screen === 'th-psy-notes' || screen === 'th-psy-order' || screen === 'th-nut') {
    const noteConfig = {
      'th-psy-notes': { title: 'Psychology Notes', type: 'Psychologist Note' },
      'th-psy-order': { title: 'Psychology Orders', type: 'Psychologist Order' },
      'th-nut': { title: 'Nutrition Notes', type: 'Nutritionist Note' },
    }[screen]
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <DashboardCard title={noteConfig.title} noHeightLimit>
            <ClinicalNotesList
              patient={selectedPatient}
              clinicalNoteType={noteConfig.type}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
      </div>
    )
  }

  if (screen === 'th-nurse-notes') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <MainNursingNoteList
              patient={selectedPatient}
              admission={activeAdmission || undefined}
              onPatientClick={handlePatientSelect}
            />
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {header}
      <div className="p-4 space-y-4">
        {selectedPatient && <PatientSummaryCard patient={selectedPatient} />}

        <div className="grid gap-4 md:grid-cols-2">
          <TherapyNotesPanel
            patient={selectedPatient}
            refreshKey={notesRefreshKey}
            onRefresh={() => setNotesRefreshKey((k) => k + 1)}
            onPatientClick={handlePatientSelect}
            listingScreen="t-notes"
            fixedHeight
          />

          <DashboardCard title="Session Scheduler" listingScreen="t-session" fixedHeight>
            <TherapySessionPanel
              patient={selectedPatient}
              admissionNumber={activeAdmission || undefined}
              refreshKey={sessionRefreshKey}
              onRefresh={() => setSessionRefreshKey((k) => k + 1)}
              onPatientClick={handlePatientSelect}
              showAppointments={false}
            />
          </DashboardCard>
        </div>
      </div>
    </div>
  )
}
