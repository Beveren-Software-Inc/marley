import { useRoutes, Navigate } from 'react-router-dom'
import { RoleGuard } from './RoleGuard'
import { LoginPage } from '../pages/Login'
import { DoctorPage } from '../pages/Doctor'
import { NursePage } from '../pages/Nurse'
import { PatientPage } from '../pages/Patient'
import { LabPage } from '../pages/Lab'
import { PharmacyPage } from '../pages/Pharmacy'
import { ReceptionistPage } from '../pages/Receptionist'
import { SettingsPage } from '../pages/Settings'
import { QMPSPage } from '../pages/QMPS'
import { EmployeePage } from '../pages/Employee'
import { PatientVisitDetailPage } from '../pages/PatientVisitDetailPage'
import { PatientHistoryPage } from '../pages/PatientHistory'

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
      element: (
        <RoleGuard>
          <EmployeePage />
        </RoleGuard>
      )
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
      path: '/patient-visit/:visitName',
      element: (
        <RoleGuard>
          <PatientVisitDetailPage />
        </RoleGuard>
      )
    },
    { path: '/', element: <Navigate to="/login" replace /> },
    { path: '*', element: <div>Not found</div> }
  ])

  return routes
}


