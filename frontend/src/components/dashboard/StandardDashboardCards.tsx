import { useState } from 'react'
import { DashboardCard } from '../ui/DashboardCard'
import { AppointmentList } from '../appointments/AppointmentList'
import { CreateAppointmentModal } from '../appointments/CreateAppointmentModal'
import { PatientVisitList } from '../patientVisits/PatientVisitList'
import { CreatePatientVisitModal } from '../patientVisits/CreatePatientVisitModal'
import { AdmissionList } from '../admissions/AdmissionList'
import { CreateAdmissionModal } from '../admissions/CreateAdmissionModal'
import { UploadPatientDocumentsModal, type UploadDocumentsTarget } from '../documents/UploadPatientDocumentsModal'
import { useCareContext } from '../../providers/CareContextProvider'
import { toast } from '../../hooks/useToast'
import type { PatientVisitListRow } from '../../services/patientVisits'
import type { InpatientRecord } from '../../services/inpatientRecords'
import { isDoctorRole } from '../../config/permissions'

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
  hideLabPharmacyAmounts = false,
  squeezeLayout = false,
}: CommonCardProps & {
  onVisitActivate?: (visit: PatientVisitListRow) => void
  showAppointmentAmount?: boolean
  /** Doctor home: hide Services / Lab / Pharmacy amount columns. */
  hideLabPharmacyAmounts?: boolean
  /** Doctor home card only: squeeze columns and hide Balance. */
  squeezeLayout?: boolean
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [uploadTarget, setUploadTarget] = useState<UploadDocumentsTarget | null>(null)
  const { userRole, allowDoctorsToCreatePatientVisit, mode, activeVisit, selectedPatient } = useCareContext()
  const showCreateButton = !isDoctorRole(userRole) || allowDoctorsToCreatePatientVisit
  const patientId = patient || selectedPatient

  const openUpload = () => {
    if (mode === 'OP' && activeVisit) {
      setUploadTarget({
        doctype: 'Patient Visit',
        name: activeVisit,
        label: `Upload Documents — ${activeVisit}`,
      })
      return
    }
    if (patientId) {
      setUploadTarget({
        doctype: 'Patient',
        name: patientId,
        label: `Upload Documents — ${patientId}`,
      })
      return
    }
    toast.error('Select a patient, or an OP visit, before uploading documents.')
  }

  return (
    <>
      <DashboardCard
        fixedHeight={!fullScreen}
        noHeightLimit={fullScreen}
        title="Patient Visits"
        onAdd={showCreateButton ? () => setShowCreate(true) : undefined}
        addButtonTitle="Create Patient Visit"
        onUpload={openUpload}
        uploadButtonTitle="Upload documents"
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
          hideLabPharmacyAmounts={hideLabPharmacyAmounts}
          squeezeLayout={squeezeLayout}
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
      {uploadTarget && (
        <UploadPatientDocumentsModal
          target={uploadTarget}
          onClose={() => setUploadTarget(null)}
          onSuccess={() => setUploadTarget(null)}
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
  const [uploadTarget, setUploadTarget] = useState<UploadDocumentsTarget | null>(null)
  const { mode, activeAdmission, selectedPatient } = useCareContext()
  const patientId = patient || selectedPatient

  const openUpload = () => {
    if (mode === 'IP' && activeAdmission) {
      setUploadTarget({
        doctype: 'Inpatient Admission',
        name: activeAdmission,
        label: `Upload Documents — ${activeAdmission}`,
      })
      return
    }
    if (patientId) {
      setUploadTarget({
        doctype: 'Patient',
        name: patientId,
        label: `Upload Documents — ${patientId}`,
      })
      return
    }
    toast.error('Select a patient, or an IP admission, before uploading documents.')
  }

  return (
    <>
      <DashboardCard
        fixedHeight={!fullScreen}
        noHeightLimit={fullScreen}
        tall={tall && !fullScreen}
        title="Patient Admissions"
        onAdd={() => setShowCreate(true)}
        addButtonTitle="Create Admission"
        onUpload={openUpload}
        uploadButtonTitle="Upload documents"
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
      {uploadTarget && (
        <UploadPatientDocumentsModal
          target={uploadTarget}
          onClose={() => setUploadTarget(null)}
          onSuccess={() => {
            setUploadTarget(null)
            setRefreshKey((k) => k + 1)
          }}
        />
      )}
    </>
  )
}
