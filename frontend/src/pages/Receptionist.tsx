import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { dummyPatients } from '../config/patients'
import { AdmissionList } from '../components/admissions/AdmissionList'
import { PatientList } from '../components/patients/PatientList'
import { PatientSearch } from '../components/patients/PatientSearch'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'
import { AppointmentList } from '../components/appointments/AppointmentList'
import { CreateAppointmentModal } from '../components/appointments/CreateAppointmentModal'
import { PatientVisitList } from '../components/patientVisits/PatientVisitList'
import { CreatePatientVisitModal } from '../components/patientVisits/CreatePatientVisitModal'
import { CreateAdmissionModal } from '../components/admissions/CreateAdmissionModal'
import { CreatePatientModal } from '../components/patients/CreatePatientModal'
import { ServiceRequestList } from '../components/serviceRequests/ServiceRequestList'
import { CreateServiceRequestModal } from '../components/serviceRequests/CreateServiceRequestModal'
import { FollowUpList } from '../components/followUp/FollowUpList'
import { IOPDayListWithHeader } from '../components/iop/IOPDayList'
import { IOPEnrollmentListWithHeader } from '../components/iop/IOPEnrollmentList'

type View = 'default' | 'patient' | 'admission' | 'visit' | 'followup' | 'iop' | 'appointments-freeze' | 'service-requests' | 'receipt-voucher' | 'op-dashboard' | 'ip-dashboard'

export const ReceptionistPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const screen = searchParams.get('screen')
  const [selectedPatient, setSelectedPatient] = useState<string>('')
  const [currentView, setCurrentView] = useState<View>('default')
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)
  const [appointmentRefreshKey, setAppointmentRefreshKey] = useState(0)
  const [showPatientVisitModal, setShowPatientVisitModal] = useState(false)
  const [patientVisitRefreshKey, setPatientVisitRefreshKey] = useState(0)
  const [showCreateServiceRequest, setShowCreateServiceRequest] = useState(false)
  const [serviceRequestRefreshKey, setServiceRequestRefreshKey] = useState(0)
  const [showAdmissionModal, setShowAdmissionModal] = useState(false)
  const [admissionRefreshKey, setAdmissionRefreshKey] = useState(0)
  const [showPatientModal, setShowPatientModal] = useState(false)
  const [patientRefreshKey, setPatientRefreshKey] = useState(0)
  const [showBulkScheduleModal, setShowBulkScheduleModal] = useState(false)

  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient || '')
  }

  // Sync view with URL: when screen param is missing or unknown, show reception homepage
  useEffect(() => {
    if (screen === 'r-reg') {
      setCurrentView('admission')
    } else if (screen === 'r-visit') {
      setCurrentView('visit')
    } else if (screen === 'r-appointment') {
      setShowAppointmentModal(true)
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('screen')
      setSearchParams(newParams, { replace: true })
    } else if (screen === 'r-ip-adm') {
      setShowAdmissionModal(true)
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('screen')
      setSearchParams(newParams, { replace: true })
    } else if (screen === 'r-new-op') {
      setShowPatientModal(true)
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('screen')
      setSearchParams(newParams, { replace: true })
    } else if (screen === 'r-new-visit') {
      setShowPatientVisitModal(true)
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('screen')
      setSearchParams(newParams, { replace: true })
    } else if (screen === 'r-followup') {
      setCurrentView('followup')
    } else if (screen === 'r-iop') {
      setCurrentView('iop')
    } else if (screen === 'r-appointments-freeze') {
      setCurrentView('appointments-freeze')
    } else if (screen === 'r-service-requests') {
      setCurrentView('service-requests')
    } else if (screen === 'r-receipt-voucher') {
      setCurrentView('receipt-voucher')
    } else if (screen === 'r-op-dashboard') {
      setCurrentView('op-dashboard')
    } else if (screen === 'r-ip-dashboard') {
      setCurrentView('ip-dashboard')
    } else {
      // No screen param or unknown: show reception homepage (e.g. after "Back to Reception" or sidebar Home)
      setCurrentView('default')
    }
  }, [screen, searchParams, setSearchParams])

  return (
    <div className="flex flex-col h-full">
      <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
        <div className="flex-1 min-w-0">
          <PatientSearch
            selectedPatient={selectedPatient}
            onPatientSelect={handlePatientSelect}
            patients={dummyPatients}
          />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setCurrentView('patient')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              currentView === 'patient'
                ? 'bg-white/20 text-white'
                : 'bg-white/10 text-white/90 hover:bg-white/20'
            }`}
          >
            Patient
          </button>
          <button
            onClick={() => setCurrentView('admission')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              currentView === 'admission'
                ? 'bg-white/20 text-white'
                : 'bg-white/10 text-white/90 hover:bg-white/20'
            }`}
          >
            Admission
          </button>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <UserMenu />
          <NotificationBell />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {currentView === 'patient' && (
          <div className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Patient Management</h2>
                <p className="text-sm text-slate-600 mt-1">
                  View and manage patient records. Use the search box to find specific patients.
                </p>
              </div>
              <button
                onClick={() => setShowPatientModal(true)}
                className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Patient"
              >
                +
              </button>
            </div>
            <PatientList refreshKey={patientRefreshKey} />
          </div>
        )}

        {currentView === 'admission' && (
          <div className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Admission Management</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Manage patient admissions. Click "Admit" on scheduled admissions to proceed.
                </p>
              </div>
              <button
                onClick={() => setShowAdmissionModal(true)}
                className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Admission"
              >
                +
              </button>
            </div>
            <AdmissionList 
              refreshKey={admissionRefreshKey}
              onAdmissionSelect={() => {}} 
            />
          </div>
        )}

        {currentView === 'visit' && (
          <div className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Patient Visits</h2>
                <p className="text-sm text-slate-600 mt-1">
                  View and manage patient visits. Use the search box to find specific visits.
                </p>
              </div>
              <button
                onClick={() => setShowPatientVisitModal(true)}
                className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Patient Visit"
              >
                +
              </button>
            </div>
            <PatientVisitList 
              patient={selectedPatient || undefined}
              refreshKey={patientVisitRefreshKey}
            />
          </div>
        )}

        {currentView === 'followup' && (
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Follow-up Dashboard</h2>
              <p className="text-sm text-slate-600 mt-1">
                OP &amp; IP discharged follow-up list. Filter by status (default: Open) and cost center. Send reminder per row or send all reminders.
              </p>
            </div>
            <FollowUpList refreshKey={patientVisitRefreshKey} />
          </div>
        )}

        {currentView === 'iop' && (
          <div className="p-4">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">IOP Dashboard</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Intensive Outpatient: schedule IOP days (slots) and enroll patients. Create a Patient Visit from an enrollment to link the visit.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkScheduleModal(true)}
                className="flex-shrink-0 px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors whitespace-nowrap"
              >
                Bulk Schedule
              </button>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <IOPDayListWithHeader refreshKey={patientVisitRefreshKey} />
              <IOPEnrollmentListWithHeader refreshKey={patientVisitRefreshKey} />
            </div>
          </div>
        )}

        {currentView === 'appointments-freeze' && (
          <div className="p-4">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Appointments</h2>
                <p className="text-sm text-slate-600 mt-1">
                  When doctors are not available or on leave, freeze or cancel slots. Release when they return.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAppointmentModal(true)}
                className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 text-sm font-bold flex-shrink-0"
                title="New Appointment"
              >
                +
              </button>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[500px]">
              <AppointmentList showAll={true} patient={selectedPatient || undefined} refreshKey={appointmentRefreshKey} />
            </div>
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              To freeze or release practitioner schedules, use the backend: Healthcare → Practitioner Schedule, or open Appointments in the backend.
              <a href="/app/Patient%20Appointment" target="_blank" rel="noopener noreferrer" className="ml-2 underline font-medium">Open Appointments</a>
            </div>
          </div>
        )}

        {currentView === 'service-requests' && (
          <div className="p-4">
            <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Service Requests / Booked Lab</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Lab and procedure requests. Create with +, then Confirm Payment and Book Lab to forward to laboratory.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateServiceRequest(true)}
                className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 text-lg font-bold shrink-0"
                title="Create Service Request"
              >
                +
              </button>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[500px]">
              <ServiceRequestList
                patient={selectedPatient || undefined}
                refreshKey={serviceRequestRefreshKey}
                template_dt="Lab Test Template"
              />
            </div>
            {showCreateServiceRequest && (
              <CreateServiceRequestModal
                onClose={() => setShowCreateServiceRequest(false)}
                onSuccess={() => {
                  setServiceRequestRefreshKey((k) => k + 1)
                  setShowCreateServiceRequest(false)
                }}
                initialPatient={selectedPatient || undefined}
              />
            )}
          </div>
        )}

        {currentView === 'receipt-voucher' && (
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Receipt Voucher</h2>
              <p className="text-sm text-slate-600 mt-1">
                For employee (pharmacy) and OP other branches.
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <p className="text-slate-600 mb-4">Receipt vouchers are managed in the backend (Accounts / Journal Entry).</p>
              <a
                href="/app/Journal%20Entry"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90"
              >
                Open Journal Entry
              </a>
            </div>
          </div>
        )}

        {(currentView === 'op-dashboard' || currentView === 'ip-dashboard') && (
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">
                {currentView === 'op-dashboard' ? 'OP Dashboard' : 'IP Dashboard'}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {currentView === 'op-dashboard'
                  ? 'Outpatient: patients, appointments, visits. Change user for entry and receipt voucher as needed.'
                  : 'Inpatient: admissions, transfers, discharge. Cost center per hospital.'}
              </p>
            </div>
            {currentView === 'op-dashboard' && (
              <div className="grid gap-4 md:grid-cols-2">
                <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
                  <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                    <span>Patient List</span>
                    <button onClick={() => setShowPatientModal(true)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 text-sm font-bold" title="Add Patient">+</button>
                  </div>
                  <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                    <PatientList refreshKey={patientRefreshKey} />
                  </div>
                </section>
                <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
                  <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                    <span>Appointments</span>
                    <button onClick={() => setShowAppointmentModal(true)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 text-sm font-bold" title="Add Appointment">+</button>
                  </div>
                  <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                    <AppointmentList showAll={true} patient={selectedPatient || undefined} refreshKey={appointmentRefreshKey} />
                  </div>
                </section>
              </div>
            )}
            {currentView === 'ip-dashboard' && (
              <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[500px]">
                <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                  <span>IP Admission List</span>
                  <button onClick={() => setShowAdmissionModal(true)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 text-sm font-bold" title="Add Admission">+</button>
                </div>
                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                  <AdmissionList patient={selectedPatient || undefined} refreshKey={admissionRefreshKey} onAdmissionSelect={() => {}} />
                </div>
              </div>
            )}
          </div>
        )}

        {currentView === 'default' && (
          <>
            <div className="grid gap-4 md:grid-cols-2 p-4">
              <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
                <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                  <span>Patient List</span>
                  <button
                    onClick={() => setShowPatientModal(true)}
                    className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                    title="Add Patient"
                  >
                    +
                  </button>
                </div>
                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                  <PatientList refreshKey={patientRefreshKey} />
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
                <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                  <span>Appointments</span>
                  <button
                    onClick={() => setShowAppointmentModal(true)}
                    className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                    title="Add Appointment"
                  >
                    +
                  </button>
                </div>
                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                  <AppointmentList 
                    showAll={true} 
                    patient={selectedPatient || undefined}
                    refreshKey={appointmentRefreshKey}
                  />
                </div>
              </section>
            </div>

            <div className="grid gap-4 md:grid-cols-2 px-4 pb-4">
              <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
                <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                  <span>Patient Visits</span>
                  <button
                    onClick={() => setShowPatientVisitModal(true)}
                    className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                    title="Add Patient Visit"
                  >
                    +
                  </button>
                </div>
                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                  <PatientVisitList 
                    patient={selectedPatient || undefined}
                    refreshKey={patientVisitRefreshKey}
                  />
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
                <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                  <span>IP Admission List</span>
                  <button
                    onClick={() => setShowAdmissionModal(true)}
                    className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                    title="Add Admission"
                  >
                    +
                  </button>
                </div>
                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                  <AdmissionList 
                    patient={selectedPatient || undefined}
                    refreshKey={admissionRefreshKey}
                    onAdmissionSelect={() => {}} 
                  />
                </div>
              </section>
            </div>
          </>
        )}
      </div>

      {showAppointmentModal && (
        <CreateAppointmentModal
          onClose={() => setShowAppointmentModal(false)}
          onSuccess={() => {
            setAppointmentRefreshKey(prev => prev + 1)
            setShowAppointmentModal(false)
          }}
          initialPatient={selectedPatient || undefined}
        />
      )}

      {showPatientVisitModal && (
        <CreatePatientVisitModal
          onClose={() => setShowPatientVisitModal(false)}
          onSuccess={(_visitName) => {
            setPatientVisitRefreshKey(prev => prev + 1)
            setShowPatientVisitModal(false)
          }}
        />
      )}

      {showAdmissionModal && (
        <CreateAdmissionModal
          onClose={() => setShowAdmissionModal(false)}
          onSuccess={(_admissionName) => {
            setAdmissionRefreshKey(prev => prev + 1)
            setShowAdmissionModal(false)
          }}
        />
      )}

      {showPatientModal && (
        <CreatePatientModal
          onClose={() => setShowPatientModal(false)}
          onSuccess={(patientName) => {
            setPatientRefreshKey(prev => prev + 1)
            setShowPatientModal(false)
            if (patientName) {
              setSelectedPatient(patientName)
            }
          }}
        />
      )}

      {/* TODO: replace with your BulkScheduleModal component */}
      {showBulkScheduleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Bulk Schedule</h2>
              <button
                onClick={() => setShowBulkScheduleModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-slate-500">Bulk Schedule modal coming soon.</p>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowBulkScheduleModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}