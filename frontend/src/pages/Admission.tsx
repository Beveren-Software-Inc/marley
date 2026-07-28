import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCareContext } from '../providers/CareContextProvider'
import { AdmissionList } from '../components/admissions/AdmissionList'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { LabTestList } from '../components/labTests/LabTestList'
import { AdmissionDetails } from '../components/admissions/AdmissionDetails'
import { CreateAdmissionModal } from '../components/admissions/CreateAdmissionModal'
import { NavbarActions } from '../components/layout/NavbarActions'
import { PatientSearch } from '../components/patients/PatientSearch'

export const AdmissionPage = () => {
  const { selectedPatient: globalPatient, setSelectedPatient: setGlobalPatient } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const admissionFromUrl = searchParams.get('admission')
  const searchFromUrl = searchParams.get('search')
  const patientFromUrl = searchParams.get('patient')
  const [admissionPatient, setAdmissionPatient] = useState<string | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState<string>(searchFromUrl || '')
  const [showCreateAdmission, setShowCreateAdmission] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<string>(() => patientFromUrl || globalPatient || '')
  const [listRefreshKey, setListRefreshKey] = useState(0)
  const syncingPatientSelectionRef = useRef(false)

  // Sync searchQuery with URL
  useEffect(() => {
    const searchParam = searchParams.get('search')
    if (searchParam !== searchQuery) {
      setSearchQuery(searchParam || '')
    }
  }, [searchParams, searchQuery])

  // Load patient when admission is selected from URL
  useEffect(() => {
    if (admissionFromUrl) {
      const loadPatient = async () => {
        try {
          const response = await fetch(
            `/api/method/healthcare.api.inpatient_admission.get_inpatient_record?name=${encodeURIComponent(admissionFromUrl)}`
          )
          const resData = await response.json()
          if (resData?.message?.patient) {
            setAdmissionPatient(resData.message.patient)
          }
        } catch (error) {
          console.error('Failed to fetch admission patient:', error)
        }
      }
      loadPatient()
    } else {
      setAdmissionPatient(undefined)
    }
  }, [admissionFromUrl])

  useEffect(() => {
    if (syncingPatientSelectionRef.current) {
      if ((patientFromUrl || '') === selectedPatient) {
        syncingPatientSelectionRef.current = false
      }
      return
    }
    if (patientFromUrl && patientFromUrl !== selectedPatient) {
      setSelectedPatient(patientFromUrl)
    }
  }, [patientFromUrl, selectedPatient])

  // Keep local state in sync when the global patient is cleared (e.g. via the navbar X button)
  useEffect(() => {
    if (!globalPatient && selectedPatient) {
      setSelectedPatient('')
      const newSearchParams = new URLSearchParams(searchParams)
      newSearchParams.delete('patient')
      setSearchParams(newSearchParams, { replace: true })
    }
  }, [globalPatient, selectedPatient, searchParams, setSearchParams])

  // When used from Admission Management screens, we rely on the list's slide-over
  // instead of navigating to a separate details page, so this is a no-op.
  const handleAdmissionSelect = (_admissionName: string) => {
    return
  }

  const handlePatientFromAdmission = (patientId: string) => {
    if (!patientId) return
    setSelectedPatient(patientId)
    setGlobalPatient(patientId)
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.set('patient', patientId)
    setSearchParams(newSearchParams, { replace: true })
  }

  const handleBackToList = () => {
    // Update URL - this will trigger re-render
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.delete('admission')
    // Keep search query in URL
    setSearchParams(newSearchParams, { replace: true })
  }

  if (admissionFromUrl) {
    // Show admission details with warnings and lab tests
    return (
      <div className="flex flex-col h-full">
        <header className="sticky top-0 z-10 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 flex items-center justify-between border-b border-white/20">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBackToList}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-md text-sm transition-colors"
            >
              ← Back to Admissions
            </button>
            <h1 className="text-lg font-semibold">Admission: {admissionFromUrl}</h1>
          </div>
          <div className="flex items-center gap-3">
            <NavbarActions placement="header" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <div className="font-semibold mb-4">Warning Messages</div>
              <WarningMessagesList patient={admissionPatient} onPatientClick={handlePatientFromAdmission} />
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <div className="font-semibold mb-4">Sticky Notes</div>
              <WarningMessagesList
                patient={admissionPatient}
                specialPhoneScope="special_only"
                title="Sticky Notes"
                onPatientClick={handlePatientFromAdmission}
              />
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <div className="font-semibold mb-4">Lab Test Reports</div>
              <LabTestList patient={admissionPatient} onPatientClick={handlePatientFromAdmission} />
            </section>
          </div>

          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4">Admission Details</div>
            <AdmissionDetails 
              admissionNo={admissionFromUrl} 
              onUpdate={() => {
                // Refresh the page data if needed
                window.location.reload()
              }}
            />
          </section>
        </div>
      </div>
    )
  }

  // Show admission list
  return (
    <>
      <div className="flex flex-col h-full">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient}
              skipStoredPatientRestore
              onPatientSelect={(patient) => {
                syncingPatientSelectionRef.current = true
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
              }}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <NavbarActions placement="header" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <AdmissionList 
            onAdmissionSelect={handleAdmissionSelect}
            onPatientFromAdmission={handlePatientFromAdmission}
            searchQuery={searchQuery}
            patient={selectedPatient}
            refreshKey={listRefreshKey}
            onCreateNew={() => setShowCreateAdmission(true)}
          />
        </div>
      </div>

      {showCreateAdmission && (
        <CreateAdmissionModal
          onClose={() => setShowCreateAdmission(false)}
          onSuccess={() => {
            setShowCreateAdmission(false)
            setListRefreshKey(prev => prev + 1)
          }}
          patientName={selectedPatient || undefined}
        />
      )}
    </>
  )
}

