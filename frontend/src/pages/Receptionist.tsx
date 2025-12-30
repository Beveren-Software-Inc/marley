import { useState } from 'react'
import { dummyPatients } from '../config/patients'
import { AdmissionList } from '../components/admissions/AdmissionList'
import { PatientList } from '../components/patients/PatientList'
import { PatientSearch } from '../components/patients/PatientSearch'
import { NotificationBell } from '../components/notifications/NotificationBell'

type View = 'default' | 'patient' | 'admission'

export const ReceptionistPage = () => {
  const [selectedPatient, setSelectedPatient] = useState('John Doe')
  const [currentView, setCurrentView] = useState<View>('default')

  return (
    <div className="flex flex-col h-full">
      <header className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center gap-3 bg-primary text-white px-4 py-3">
        <PatientSearch
          selectedPatient={selectedPatient}
          onPatientSelect={setSelectedPatient}
          patients={dummyPatients}
        />
        <div className="flex items-center justify-end gap-3">
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
          <div className="text-xs opacity-80">
            <span>Reception · Main</span>
          </div>
          <NotificationBell />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {currentView === 'default' && (
          <div className="flex flex-col gap-4 p-4">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <h2 className="font-semibold mb-3">Reception Screens</h2>
              <p className="text-sm text-slate-600 mb-4">
                Use the buttons above to navigate to Patient or Admission management.
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-slate-800">
                <li>New OP Registration</li>
                <li>Search Existing Patient (File No / Name / ID)</li>
                <li>Book Appointment with OP</li>
                <li>Check In / Check Out</li>
                <li>New IP Admission</li>
                <li>Admission Register View</li>
                <li>Print Admission Form / Labels</li>
              </ul>
            </section>
          </div>
        )}

        {currentView === 'patient' && (
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Patient Management</h2>
              <p className="text-sm text-slate-600 mt-1">
                View and manage patient records. Use the search box to find specific patients.
              </p>
            </div>
            <PatientList />
          </div>
        )}

        {currentView === 'admission' && (
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Admission Management</h2>
              <p className="text-sm text-slate-600 mt-1">
                Manage patient admissions. Click "Admit" on scheduled admissions to proceed.
              </p>
            </div>
            <AdmissionList />
          </div>
        )}
      </div>
    </div>
  )
}



