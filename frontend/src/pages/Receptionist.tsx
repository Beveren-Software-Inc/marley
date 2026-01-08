import { useState } from 'react'
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

type View = 'default' | 'patient' | 'admission'

export const ReceptionistPage = () => {
  const [selectedPatient, setSelectedPatient] = useState<string>('John Doe')
  const [currentView, setCurrentView] = useState<View>('default')
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)
  const [appointmentRefreshKey, setAppointmentRefreshKey] = useState(0)
  const [showPatientVisitModal, setShowPatientVisitModal] = useState(false)
  const [patientVisitRefreshKey, setPatientVisitRefreshKey] = useState(0)
  const [showAdmissionModal, setShowAdmissionModal] = useState(false)
  const [admissionRefreshKey, setAdmissionRefreshKey] = useState(0)
  const [showPatientModal, setShowPatientModal] = useState(false)
  const [patientRefreshKey, setPatientRefreshKey] = useState(0)

  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient || '')
  }

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
            <AdmissionList refreshKey={admissionRefreshKey} />
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
          onSuccess={(visitName) => {
            setPatientVisitRefreshKey(prev => prev + 1)
            setShowPatientVisitModal(false)
          }}
        />
      )}

      {showAdmissionModal && (
        <CreateAdmissionModal
          onClose={() => setShowAdmissionModal(false)}
          onSuccess={(admissionName) => {
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
    </div>
  )
}



