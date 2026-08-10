import { useState } from 'react'
import { DashboardCard } from '../ui/DashboardCard'
import { AppointmentList } from '../appointments/AppointmentList'
import { CreateAppointmentModal } from '../appointments/CreateAppointmentModal'
import { PatientVisitList } from '../patientVisits/PatientVisitList'
import { CreatePatientVisitModal } from '../patientVisits/CreatePatientVisitModal'
import { AdmissionList } from '../admissions/AdmissionList'
import { CreateAdmissionModal } from '../admissions/CreateAdmissionModal'
import { useCareContext } from '../../providers/CareContextProvider'
import { toast } from '../../hooks/useToast'
import type { PatientVisitListRow } from '../../services/patientVisits'
import type { InpatientRecord } from '../../services/inpatientRecords'

/**
 * Standardised dashboard cards — Appointments, Patient Visits and
 * Patient Admissions render identically on the doctor, nurse, reception and
 * pharmacy dashboards (and their full-screen listings via `fullScreen`). Change
 * them here and every portal follows. Create modals + refresh live inside.
 */

interface CommonCardProps {
  patient?: string
  onPatientSelect?: (patient: string) => void
  /** Full-page listing variant (no fixed height). */
  fullScreen?: boolean
  /** Sidebar screen id for the ↗ full listing of this role. */
  listingScreen?: string
}

export function AppointmentsCard({
  patient,
  onPatientSelect,
  fullScreen = false,
  listingScreen,
  doctorScheduleMode = false,
  receptionWalkInActions = false,
  defaultTodayDates = false,
  onOpenVisitInHeader,
}: CommonCardProps & {
  doctorScheduleMode?: boolean
  receptionWalkInActions?: boolean
  defaultTodayDates?: boolean
  onOpenVisitInHeader?: () => void
}) {
  const { guardClinicalCreate } = useCareContext()
  const [showCreate, setShowCreate] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <>
      <DashboardCard
        fixedHeight={!fullScreen}
        noHeightLimit={fullScreen}
        title="Appointments"
        onAdd={() => guardClinicalCreate(() => setShowCreate(true))}
        addButtonTitle="Add Appointment"
        listingScreen={listingScreen}
        allowCreateOnClosedEpisode
      >
        <AppointmentList
          compact={!fullScreen}
          detailedColumns
          doctorScheduleMode={doctorScheduleMode && !patient}
          showAll={!doctorScheduleMode || !!patient}
          receptionWalkInActions={receptionWalkInActions}
          defaultTodayDates={defaultTodayDates}
          patient={patient || undefined}
          refreshKey={refreshKey}
          onPatientClick={onPatientSelect}
          onOpenVisitInHeader={onOpenVisitInHeader}
        />
      </DashboardCard>
      {showCreate && (
        <CreateAppointmentModal
          initialPatient={patient || undefined}
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false)
            setRefreshKey((k) => k + 1)
            toast.success('Appointment created')
          }}
        />
      )}
    </>
  )
}

export function OutpatientVisitsCard({
  patient,
  onPatientSelect,
  fullScreen = false,
  listingScreen,
  onVisitActivate,
  showAppointmentAmount = false,
}: CommonCardProps & {
  onVisitActivate?: (visit: PatientVisitListRow) => void
  showAppointmentAmount?: boolean
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <>
      <DashboardCard
        fixedHeight={!fullScreen}
        noHeightLimit={fullScreen}
        title="Patient Visits"
        onAdd={() => setShowCreate(true)}
        addButtonTitle="Create Patient Visit"
        listingScreen={listingScreen}
        allowCreateOnClosedEpisode
      >
        <PatientVisitList
          detailedColumns
          defaultToCurrentPractitioner
          patient={patient || undefined}
          refreshKey={refreshKey}
          onPatientFromVisit={onPatientSelect}
          onVisitActivate={onVisitActivate}
          showAppointmentAmount={showAppointmentAmount}
        />
      </DashboardCard>
      {showCreate && (
        <CreatePatientVisitModal
          initialPatient={patient || undefined}
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false)
            setRefreshKey((k) => k + 1)
          }}
        />
      )}
    </>
  )
}

export function InpatientAdmissionsCard({
  patient,
  onPatientSelect,
  fullScreen = false,
  listingScreen,
  onAdmissionActivate,
  tall = false,
}: CommonCardProps & {
  onAdmissionActivate?: (record: InpatientRecord) => void
  /** Taller listing viewport (e.g. Lab page). */
  tall?: boolean
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <>
      <DashboardCard
        fixedHeight={!fullScreen}
        noHeightLimit={fullScreen}
        tall={tall && !fullScreen}
        title="Patient Admissions"
        onAdd={() => setShowCreate(true)}
        addButtonTitle="Create Admission"
        listingScreen={listingScreen}
        allowCreateOnClosedEpisode
      >
        <AdmissionList
          key={refreshKey}
          patient={patient || undefined}
          onAdmissionActivate={onAdmissionActivate}
          onPatientFromAdmission={onPatientSelect}
        />
      </DashboardCard>
      {showCreate && (
        <CreateAdmissionModal
          patientName={patient || undefined}
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false)
            setRefreshKey((k) => k + 1)
            toast.success('Inpatient admission created successfully')
          }}
        />
      )}
    </>
  )
}
