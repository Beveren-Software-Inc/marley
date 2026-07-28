import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCareContext } from '../providers/CareContextProvider'
import { PatientCareHeader } from '../components/patients/PatientCareHeader'
import { DashboardCard } from '../components/ui/DashboardCard'
import { TherapyNotesPanel } from '../components/therapy/TherapyNotesPanel'
import { TherapySessionPanel } from '../components/therapy/TherapySessionPanel'
import { ClinicalNotesList } from '../components/clinicalNotes/ClinicalNotesList'
import { DoctorOrderList } from '../components/doctorOrder/DoctorOrderList'
import { MainNursingNoteList } from '../components/nursing/MainNursingNoteList'
import { AdmissionList } from '../components/admissions/AdmissionList'
import { PatientVisitList } from '../components/patientVisits/PatientVisitList'

export const TherapyPage = () => {
  const {
    selectedPatient,
    setSelectedPatient,
    activeAdmission,
  } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const screen = searchParams.get('screen') || ''
  const [notesRefreshKey, setNotesRefreshKey] = useState(0)
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0)

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
            embedded
          />
        </DashboardCard>

        <DashboardCard title="Patient Visits" fixedHeight>
          <PatientVisitList patient={selectedPatient} onPatientFromVisit={handlePatientSelect} />
        </DashboardCard>

        <DashboardCard title="Inpatient" fixedHeight>
          <AdmissionList patient={selectedPatient} onPatientFromAdmission={handlePatientSelect} />
        </DashboardCard>
      </div>
    </div>
  )
}
