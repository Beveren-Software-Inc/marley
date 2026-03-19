import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PatientSearch } from '../components/patients/PatientSearch'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'
import { InsurancePatientRegisterList } from '../components/insurance/InsurancePatientRegisterList'
import { CreateInsurancePatientRegisterModal } from '../components/insurance/CreateInsurancePatientRegisterModal'
import { InsuranceClaimList } from '../components/insurance/InsuranceClaimList'
import { CreateInsuranceClaimModal } from '../components/insurance/CreateInsuranceClaimModal'

export const InsurancePage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(
    searchParams.get('patient') || undefined
  )
  const [registerRefreshKey, setRegisterRefreshKey] = useState(0)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [claimRefreshKey, setClaimRefreshKey] = useState(0)
  const [showCreateClaimModal, setShowCreateClaimModal] = useState(false)

  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient)
    const p = new URLSearchParams(searchParams)
    if (patient) p.set('patient', patient)
    else p.delete('patient')
    setSearchParams(p, { replace: true })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
        <div className="flex-1 min-w-0">
          <PatientSearch
            selectedPatient={selectedPatient || ''}
            onPatientSelect={handlePatientSelect}
            patients={[]}
          />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <UserMenu />
          <NotificationBell />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Insurance Patient Register card */}
        <section className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div>
              <h2 className="font-semibold text-slate-800">Insurance Patient Register</h2>
              <p className="text-xs text-slate-500 mt-0.5">Track insurance approvals and link to patient records</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
              title="New Insurance Patient Register"
            >
              +
            </button>
          </div>
          <div className="p-4 overflow-y-auto max-h-[500px]" style={{ scrollbarWidth: 'thin' }}>
            <InsurancePatientRegisterList
              refreshKey={registerRefreshKey}
            />
          </div>
        </section>

        {/* Insurance Claims */}
        <section className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div>
              <h2 className="font-semibold text-slate-800">Insurance Claims</h2>
              <p className="text-xs text-slate-500 mt-0.5">Claim submissions and payment tracking</p>
            </div>
            <button
              onClick={() => setShowCreateClaimModal(true)}
              className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
              title="New Insurance Claim"
            >
              +
            </button>
          </div>
          <div className="p-4 overflow-y-auto max-h-[500px]" style={{ scrollbarWidth: 'thin' }}>
            <InsuranceClaimList
              refreshKey={claimRefreshKey}
              patient={selectedPatient}
            />
          </div>
        </section>
      </div>

      {showCreateModal && (
        <CreateInsurancePatientRegisterModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false)
            setRegisterRefreshKey(k => k + 1)
          }}
        />
      )}

      {showCreateClaimModal && (
        <CreateInsuranceClaimModal
          onClose={() => setShowCreateClaimModal(false)}
          initialPatient={selectedPatient}
          onSuccess={() => {
            setShowCreateClaimModal(false)
            setClaimRefreshKey(k => k + 1)
          }}
        />
      )}
    </div>
  )
}
