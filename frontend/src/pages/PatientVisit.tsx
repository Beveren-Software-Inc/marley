import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCareContext } from '../providers/CareContextProvider'
import { PatientVisitList } from '../components/patientVisits/PatientVisitList'
import { CreatePatientVisitModal } from '../components/patientVisits/CreatePatientVisitModal'
import { NavbarActions } from '../components/layout/NavbarActions'
import { PatientSearch } from '../components/patients/PatientSearch'

interface PatientVisitPageProps {
  /** Optional patient passed from a parent page (e.g. Doctor). */
  initialPatient?: string
}

export const PatientVisitPage = ({ initialPatient }: PatientVisitPageProps = {}) => {
  const { selectedPatient: globalPatient, setSelectedPatient: setGlobalPatient, guardClinicalCreate } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchFromUrl = searchParams.get('search')
  const patientFromUrl = searchParams.get('patient') || initialPatient || ''
  const [searchQuery] = useState<string>(searchFromUrl || '')
  const [showCreateVisit, setShowCreateVisit] = useState(false)
  const [visitRefreshKey, setVisitRefreshKey] = useState(0)
  const [selectedPatient, setSelectedPatient] = useState<string>(() => patientFromUrl || globalPatient || '')

  // Keep local state in sync when the global patient is cleared (e.g. via the navbar X button)
  useEffect(() => {
    if (!globalPatient && selectedPatient) {
      setSelectedPatient('')
      const newSearchParams = new URLSearchParams(searchParams)
      newSearchParams.delete('patient')
      setSearchParams(newSearchParams, { replace: true })
    }
  }, [globalPatient])

  const handlePatientSelect = (patient: string | undefined) => {
    const value = patient || ''
    setSelectedPatient(value)
    setGlobalPatient(patient)
    const newSearchParams = new URLSearchParams(searchParams)
    if (value) {
      newSearchParams.set('patient', value)
    } else {
      newSearchParams.delete('patient')
    }
    setSearchParams(newSearchParams, { replace: true })
  }

  // Show visit list - all visits if no patient selected, or filtered by patient if selected
  return (
    <>
      <div className="flex flex-col h-full">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient}
              onPatientSelect={handlePatientSelect}
            />
          </div>
          <NavbarActions placement="header" />
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <PatientVisitList 
              searchQuery={searchQuery}
              patient={selectedPatient || undefined}
              refreshKey={visitRefreshKey}
              onPatientFromVisit={handlePatientSelect}
              onCreateNew={() =>
                guardClinicalCreate(() => setShowCreateVisit(true), { allowOnClosed: true })
              }
            />
          </section>
        </div>
      </div>

      {showCreateVisit && (
        <CreatePatientVisitModal
          onClose={() => setShowCreateVisit(false)}
          onSuccess={() => {
            setShowCreateVisit(false)
            setVisitRefreshKey(prev => prev + 1)
          }}
          initialPatient={selectedPatient || initialPatient || undefined}
        />
      )}
    </>
  )
}

