import { useState } from 'react'
import { PatientSearch } from '../components/patients/PatientSearch'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { LabTestReportsList } from '../components/labTests/LabTestReportsList'

export const NursePage = () => {
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(undefined)

  return (
    <div className="flex flex-col">
      <header className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center gap-3 bg-primary text-white px-4 py-3">
        <PatientSearch
          selectedPatient={selectedPatient || ''}
          onPatientSelect={(patient) => setSelectedPatient(patient || undefined)}
          patients={[]}
        />
        <div className="flex justify-end text-xs opacity-80">
          <span>Branch: Main · Dummy</span>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 p-4">
        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="font-semibold mb-4">IP Warning Messages / Medications / Allergy</div>
          <WarningMessagesList patient={selectedPatient} />
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="font-semibold mb-4">Lab Reports List & Status</div>
          <LabTestReportsList patient={selectedPatient} pendingReview={true} />
        </section>
      </div>

      
    </div>
  )
}



