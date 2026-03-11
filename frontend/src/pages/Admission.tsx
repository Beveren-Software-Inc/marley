import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdmissionList } from '../components/admissions/AdmissionList'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { LabTestList } from '../components/labTests/LabTestList'
import { AdmissionDetails } from '../components/admissions/AdmissionDetails'
import { CreateAdmissionModal } from '../components/admissions/CreateAdmissionModal'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'
import { PatientSearch } from '../components/patients/PatientSearch'

export const AdmissionPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const admissionFromUrl = searchParams.get('admission')
  const searchFromUrl = searchParams.get('search')
  const patientFromUrl = searchParams.get('patient')
  const [admissionPatient, setAdmissionPatient] = useState<string | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState<string>(searchFromUrl || '')
  const [showCreateAdmission, setShowCreateAdmission] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<string>(patientFromUrl || '')
  const [listRefreshKey, setListRefreshKey] = useState(0)

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
    if (patientFromUrl && patientFromUrl !== selectedPatient) {
      setSelectedPatient(patientFromUrl)
    }
  }, [patientFromUrl])

  // When used from Admission Management screens, we rely on the list's slide-over
  // instead of navigating to a separate details page, so this is a no-op.
  const handleAdmissionSelect = (_admissionName: string) => {
    return
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
            <UserMenu />
            <NotificationBell />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <div className="font-semibold mb-4">Warning Messages</div>
              <WarningMessagesList patient={admissionPatient} />
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <div className="font-semibold mb-4">Lab Test Reports</div>
              <LabTestList patient={admissionPatient} />
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
              onPatientSelect={(patient) => {
                const value = patient || ''
                setSelectedPatient(value)
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
            <UserMenu />
            <NotificationBell />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Admission Management</h2>
              <p className="text-sm text-slate-600 mt-1">
                Manage patient admissions. Click "Admit" on scheduled admissions to proceed.
              </p>
            </div>
            <button
              onClick={() => setShowCreateAdmission(true)}
              className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
              title="Add Admission"
            >
              +
            </button>
          </div>
          <AdmissionList 
            onAdmissionSelect={handleAdmissionSelect} 
            searchQuery={searchQuery}
            patient={selectedPatient || undefined}
            refreshKey={listRefreshKey}
          />
        </div>
      </div>

      {showCreateAdmission && (
        <CreateAdmissionModal
          onClose={() => setShowCreateAdmission(false)}
          onSuccess={(admissionName) => {
            setShowCreateAdmission(false)
            // After creating, refresh the list so the new admission appears immediately
            setListRefreshKey(prev => prev + 1)
          }}
        />
      )}
    </>
  )
}

