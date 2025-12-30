import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdmissionList } from '../components/admissions/AdmissionList'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { LabTestReportsList } from '../components/labTests/LabTestReportsList'
import { AdmissionDetails } from '../components/admissions/AdmissionDetails'

export const AdmissionPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const admissionFromUrl = searchParams.get('admission')
  const [admissionPatient, setAdmissionPatient] = useState<string | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState<string>('')

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

  const handleAdmissionSelect = (admissionName: string) => {
    // Update URL - this will trigger re-render
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.set('admission', admissionName)
    setSearchParams(newSearchParams, { replace: true })
  }

  const handleBackToList = () => {
    // Clear search query
    setSearchQuery('')
    
    // Update URL - this will trigger re-render
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.delete('admission')
    setSearchParams(newSearchParams, { replace: true })
  }

  if (admissionFromUrl) {
    // Show admission details with warnings and lab tests
    return (
      <div className="flex flex-col h-full">
        <header className="bg-primary text-white px-4 py-3 flex items-center gap-4">
          <button
            onClick={handleBackToList}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-md text-sm transition-colors"
          >
            ← Back to Admissions
          </button>
          <h1 className="text-lg font-semibold">Admission: {admissionFromUrl}</h1>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <div className="font-semibold mb-4">Warning Messages</div>
              <WarningMessagesList patient={admissionPatient} />
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <div className="font-semibold mb-4">Lab Test Reports</div>
              <LabTestReportsList patient={admissionPatient} pendingReview={false} />
            </section>
          </div>

          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4">Admission Details</div>
            <AdmissionDetails admissionNo={admissionFromUrl} />
          </section>
        </div>
      </div>
    )
  }

  // Show admission list
  return (
    <div className="flex flex-col h-full">
      <header className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center gap-3 bg-primary text-white px-4 py-3">
        <div className="w-full max-w-xl">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by admission number or patient name/file number..."
            className="w-full rounded-md border border-primary/40 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-white focus:border-white"
          />
        </div>
        <div className="text-center">
          <h1 className="text-lg font-semibold">Inpatient Admissions</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <AdmissionList onAdmissionSelect={handleAdmissionSelect} searchQuery={searchQuery} />
      </div>
    </div>
  )
}

