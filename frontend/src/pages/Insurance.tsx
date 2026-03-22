import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ShieldCheck, ClipboardList, FileText } from 'lucide-react'
import { PatientSearch } from '../components/patients/PatientSearch'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'
import { InsurancePatientRegisterList } from '../components/insurance/InsurancePatientRegisterList'
import { CreateInsurancePatientRegisterModal } from '../components/insurance/CreateInsurancePatientRegisterModal'
import { InsuranceClaimList } from '../components/insurance/InsuranceClaimList'
import { CreateInsuranceClaimModal } from '../components/insurance/CreateInsuranceClaimModal'
import { HealthInsuranceList } from '../components/insurance/HealthInsuranceList'
import { CreateHealthInsuranceModal } from '../components/insurance/CreateHealthInsuranceModal'

type Tab = 'health-insurance' | 'registers' | 'claims'

const NAV_CARDS = [
  {
    id: 'health-insurance' as Tab,
    title: 'Health Insurance',
    desc: 'Manage insurance plans, discounts & coverage',
    icon: ShieldCheck,
    color: 'bg-primary/10 text-primary border-primary/20',
    iconColor: 'text-primary',
  },
  {
    id: 'registers' as Tab,
    title: 'Insurance Patient Register',
    desc: 'Track approvals and link to patient records',
    icon: ClipboardList,
    color: 'bg-green-50 text-green-700 border-green-200',
    iconColor: 'text-green-600',
  },
  {
    id: 'claims' as Tab,
    title: 'Insurance Claims',
    desc: 'Claim submissions and payment tracking',
    icon: FileText,
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    iconColor: 'text-purple-600',
  },
]

export const InsurancePage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<Tab>('health-insurance')
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(
    searchParams.get('patient') || undefined
  )

  const [registerRefreshKey, setRegisterRefreshKey] = useState(0)
  const [showCreateRegister, setShowCreateRegister] = useState(false)

  const [claimRefreshKey, setClaimRefreshKey] = useState(0)
  const [showCreateClaim, setShowCreateClaim] = useState(false)

  const [hiRefreshKey, setHiRefreshKey] = useState(0)
  const [showCreateHI, setShowCreateHI] = useState(false)

  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient)
    const p = new URLSearchParams(searchParams)
    if (patient) p.set('patient', patient)
    else p.delete('patient')
    setSearchParams(p, { replace: true })
  }

  const activeCard = NAV_CARDS.find(c => c.id === activeTab)!

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

        {/* Navigation cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {NAV_CARDS.map(card => {
            const Icon = card.icon
            const isActive = activeTab === card.id
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setActiveTab(card.id)}
                className={`flex items-start gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition-all hover:shadow-md ${
                  isActive
                    ? `${card.color} shadow-sm`
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className={`p-2 rounded-lg ${isActive ? 'bg-white/60' : 'bg-slate-100'}`}>
                  <Icon className={`w-5 h-5 ${isActive ? card.iconColor : 'text-slate-500'}`} />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${isActive ? '' : 'text-slate-800'}`}>{card.title}</p>
                  <p className={`text-xs mt-0.5 ${isActive ? 'opacity-80' : 'text-slate-500'}`}>{card.desc}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Active section */}
        <section className="bg-white border border-slate-200 rounded-lg shadow-sm">
          {/* Section header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div>
              <h2 className="font-semibold text-slate-800">{activeCard.title}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{activeCard.desc}</p>
            </div>
            {activeTab === 'health-insurance' && (
              <button
                onClick={() => setShowCreateHI(true)}
                className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                title="New Health Insurance"
              >
                +
              </button>
            )}
            {activeTab === 'registers' && (
              <button
                onClick={() => setShowCreateRegister(true)}
                className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                title="New Insurance Patient Register"
              >
                +
              </button>
            )}
            {activeTab === 'claims' && (
              <button
                onClick={() => setShowCreateClaim(true)}
                className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                title="New Insurance Claim"
              >
                +
              </button>
            )}
          </div>

          {/* Content */}
          <div className="p-4 overflow-y-auto" style={{ maxHeight: '65vh', scrollbarWidth: 'thin' }}>
            {activeTab === 'health-insurance' && (
              <HealthInsuranceList
                refreshKey={hiRefreshKey}
                onCreateNew={() => setShowCreateHI(true)}
              />
            )}
            {activeTab === 'registers' && (
              <InsurancePatientRegisterList
                refreshKey={registerRefreshKey}
              />
            )}
            {activeTab === 'claims' && (
              <InsuranceClaimList
                refreshKey={claimRefreshKey}
                patient={selectedPatient}
              />
            )}
          </div>
        </section>
      </div>

      {/* Modals */}
      {showCreateHI && (
        <CreateHealthInsuranceModal
          onClose={() => setShowCreateHI(false)}
          onSuccess={() => {
            setShowCreateHI(false)
            setHiRefreshKey(k => k + 1)
          }}
        />
      )}

      {showCreateRegister && (
        <CreateInsurancePatientRegisterModal
          onClose={() => setShowCreateRegister(false)}
          onSuccess={() => {
            setShowCreateRegister(false)
            setRegisterRefreshKey(k => k + 1)
          }}
        />
      )}

      {showCreateClaim && (
        <CreateInsuranceClaimModal
          onClose={() => setShowCreateClaim(false)}
          initialPatient={selectedPatient}
          onSuccess={() => {
            setShowCreateClaim(false)
            setClaimRefreshKey(k => k + 1)
          }}
        />
      )}
    </div>
  )
}
