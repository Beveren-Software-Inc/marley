import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCareContext } from '../providers/CareContextProvider'
import { PatientCareHeader } from '../components/patients/PatientCareHeader'
import { PatientSummaryCard } from '../components/patients/PatientSummaryCard'
import { DashboardCard } from '../components/ui/DashboardCard'
import { TherapyNotesPanel } from '../components/therapy/TherapyNotesPanel'
import { TherapySessionPanel } from '../components/therapy/TherapySessionPanel'

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
