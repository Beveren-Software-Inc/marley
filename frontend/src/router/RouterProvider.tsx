import { useRoutes, Navigate } from 'react-router-dom'
import { RoleGuard } from './RoleGuard'
import { LoginPage } from '../pages/Login'
import { DoctorPage } from '../pages/Doctor'
import { NursePage } from '../pages/Nurse.tsx'
import { PatientPage } from '../pages/Patient'
import { LabPage } from '../pages/Lab'
import { PharmacyPage } from '../pages/Pharmacy'
import { ReceptionistPage } from '../pages/Receptionist'
import { SettingsPage } from '../pages/Settings'
import { QMPSPage } from '../pages/QMPS'
import { StaffActivityAuditPage } from '../pages/StaffActivityAudit'
import { EmployeePage } from '../pages/Employee'
import { PatientVisitDetailPage } from '../pages/PatientVisitDetailPage'
import { DischargePatientPage } from '../pages/DischargePatientPage'
import { PatientHistoryPage } from '../pages/PatientHistory'
import { PsychologistPage } from '../pages/Psychologist'
import { TherapyPage } from '../pages/Therapy'
import { AnesthesiologistPage } from '../pages/Anesthesiologist'
import { InsurancePage } from '../pages/Insurance'
import { SHOW_EMPLOYEE_PORTAL } from '../config/features'
import { useAuth } from '../providers/AuthProvider'
import { getDefaultRouteForUser } from '../config/permissions'

const EmployeeRoute = () => {
  const { user } = useAuth()
  if (!SHOW_EMPLOYEE_PORTAL) {
    const roles =
      user?.roles?.length
        ? user.roles
        : ([user?.role, user?.role_profile_name].filter(Boolean) as string[])
    return <Navigate to={getDefaultRouteForUser(roles)} replace />
  }
  return (
    <RoleGuard>
      <EmployeePage />
    </RoleGuard>
  )
}

export const RouterProvider = () => {
  const routes = useRoutes([
    { path: '/login', element: <LoginPage /> },
    {
      path: '/doctor',
      element: (
        <RoleGuard roles={['doctor']}>
          <DoctorPage />
        </RoleGuard>
      )
    },
    {
      path: '/nurse',
      element: (
        <RoleGuard roles={['nurse']}>
          <NursePage />
        </RoleGuard>
      )
    },
    {
      path: '/patient',
      element: (
        <RoleGuard roles={['patient']}>
          <PatientPage />
        </RoleGuard>
      )
    },
    {
      path: '/lab',
      element: (
        <RoleGuard roles={['lab']}>
          <LabPage />
        </RoleGuard>
      )
    },
    {
      path: '/pharmacy',
      element: (
        <RoleGuard>
          <PharmacyPage />
        </RoleGuard>
      )
    },
    {
      path: '/reception',
      element: (
        <RoleGuard roles={['admin']}>
          <ReceptionistPage />
        </RoleGuard>
      )
    },
    {
      path: '/patient-history',
      element: (
        <RoleGuard>
          <PatientHistoryPage />
        </RoleGuard>
      )
    },
    {
      path: '/employee',
      element: <EmployeeRoute />,
    },
    {
      path: '/settings',
      element: (
        <RoleGuard>
          <SettingsPage />
        </RoleGuard>
      )
    },
    {
      path: '/qmps',
      element: (
        <RoleGuard>
          <QMPSPage />
        </RoleGuard>
      )
    },
    {
      path: '/staff-activity-audit',
      element: (
        <RoleGuard>
          <StaffActivityAuditPage />
        </RoleGuard>
      )
    },
    {
      path: '/patient-visit/:visitName',
      element: (
        <RoleGuard>
          <PatientVisitDetailPage />
        </RoleGuard>
      )
    },
    {
      path: '/discharge/:admissionName',
      element: (
        <RoleGuard>
          <DischargePatientPage />
        </RoleGuard>
      )
    },
    {
      path: '/psychologist',
      element: (
        <RoleGuard roles={['psychologist']}>
          <PsychologistPage />
        </RoleGuard>
      )
    },
    {
      path: '/therapy',
      element: (
        <RoleGuard roles={['therapist']}>
          <TherapyPage />
        </RoleGuard>
      )
    },
    {
      path: '/anesthesiologist',
      element: (
        <RoleGuard roles={['anesthesiologist']}>
          <AnesthesiologistPage />
        </RoleGuard>
      )
    },
    {
      path: '/insurance',
      element: (
        <RoleGuard roles={['insurance']}>
          <InsurancePage />
        </RoleGuard>
      )
    },
    { path: '/', element: <Navigate to="/login" replace /> },
    { path: '*', element: <div>Not found</div> }
  ])

  return routes
}


