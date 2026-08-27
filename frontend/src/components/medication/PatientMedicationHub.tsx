import { useMemo, useState } from 'react'
import { CalendarDays, ClipboardList, Loader2, PackageSearch, Pill, Plus } from 'lucide-react'
import { useCareContext } from '../../providers/CareContextProvider'
import { toast } from '../../hooks/useToast'
import { getPatientActiveAdmission } from '../../services/inpatientRecords'
import { reconcileDischargeMedicines } from '../../services/medicineGiven'
import { DashboardCard } from '../ui/DashboardCard'
import { MedicineGivenList } from './MedicineGivenList'
import { DailyMedicationChart } from './DailyMedicationChart'
import { MedicationSheet } from './MedicationSheet'
import { CreateMedicineGivenModal } from './CreateMedicineGivenModal'

type MedHubTab = 'given' | 'daily-chart' | 'med-sheet'

const gmIconBtn =
  'inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50'
const gmIconBtnPrimary =
  'inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary/30 bg-primary text-white hover:bg-primary/90'

const NAV_CARDS = [
  {
    id: 'given' as MedHubTab,
    title: 'Given Medicines',
    icon: Pill,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    iconColor: 'text-emerald-600',
    ipOnly: true,
  },
  {
    id: 'daily-chart' as MedHubTab,
    title: 'Daily Medication Chart',
    icon: CalendarDays,
    color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    iconColor: 'text-cyan-600',
    ipOnly: false,
  },
  {
    id: 'med-sheet' as MedHubTab,
    title: 'Medication Sheet',
    icon: ClipboardList,
    color: 'bg-violet-50 text-violet-700 border-violet-200',
    iconColor: 'text-violet-600',
    ipOnly: false,
  },
]

interface PatientMedicationHubProps {
  patient?: string | null
  admission?: string | null
}

export function PatientMedicationHub({ patient, admission }: PatientMedicationHubProps) {
  const { mode } = useCareContext()
  const showGiven = mode !== 'OP'
  const patientId = patient || undefined
  const admissionId = admission || undefined

  const navCards = useMemo(
    () => NAV_CARDS.filter((card) => !card.ipOnly || showGiven),
    [showGiven],
  )

  const [activeTab, setActiveTab] = useState<MedHubTab>(showGiven ? 'given' : 'daily-chart')
  const resolvedTab = navCards.some((c) => c.id === activeTab)
    ? activeTab
    : navCards[0]?.id ?? 'daily-chart'

  const [givenRefreshKey, setGivenRefreshKey] = useState(0)
  const [showGivenModal, setShowGivenModal] = useState(false)
  const [reconcileLoading, setReconcileLoading] = useState(false)

  const handleReconcileGiven = async () => {
    if (!patientId) {
      toast.error('Please select a patient first')
      return
    }
    try {
      setReconcileLoading(true)
      const adm = admissionId
        ? { name: admissionId }
        : await getPatientActiveAdmission(patientId)
      if (!adm?.name) {
        toast.error('No active admission found for this patient')
        return
      }
      const res = await reconcileDischargeMedicines(adm.name)
      if (res.stock_entry) {
        toast.success(`Stock Entry ${res.stock_entry} created`)
        window.open(`/app/stock-entry/${encodeURIComponent(res.stock_entry)}`, '_blank')
      } else {
        toast.info('No remaining medicines to return')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reconcile medicines')
    } finally {
      setReconcileLoading(false)
    }
  }

  return (
    <>
      <div className="flex flex-1 min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-1.5 shrink-0 max-w-3xl">
          {navCards.map((card) => {
            const Icon = card.icon
            const isActive = resolvedTab === card.id
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setActiveTab(card.id)}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-center transition-all hover:shadow-sm ${
                  isActive
                    ? `${card.color} shadow-sm`
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className={`rounded-md p-1 ${isActive ? 'bg-white/60' : 'bg-slate-100'}`}>
                  <Icon className={`h-3.5 w-3.5 ${isActive ? card.iconColor : 'text-slate-500'}`} />
                </div>
                <p
                  className={`text-[10px] leading-tight sm:text-[11px] ${
                    isActive ? 'font-bold' : 'font-medium text-slate-800'
                  }`}
                >
                  {card.title}
                </p>
              </button>
            )
          })}
        </div>

        <DashboardCard
          noHeightLimit
          className="flex-1 min-h-0"
          filterable={false}
          {...(resolvedTab === 'given'
            ? {
                headerExtra: (
                  <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/90 p-1">
                    <button
                      type="button"
                      onClick={handleReconcileGiven}
                      disabled={reconcileLoading}
                      className={`${gmIconBtn} text-emerald-800 border-emerald-200/80 hover:bg-emerald-50`}
                      title="Reconcile for discharge — create stock entry for remaining medicines to return"
                    >
                      {reconcileLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <PackageSearch className="h-4 w-4" aria-hidden />
                      )}
                      <span className="sr-only">Reconcile for discharge</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGivenModal(true)}
                      className={gmIconBtnPrimary}
                      title="Record given medicine"
                    >
                      <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                      <span className="sr-only">Add given medicine</span>
                    </button>
                  </div>
                ),
              }
            : {})}
        >
          {resolvedTab === 'given' && showGiven ? (
            <MedicineGivenList patient={patientId} refreshKey={givenRefreshKey} />
          ) : null}

          {resolvedTab === 'daily-chart' ? (
            <DailyMedicationChart patient={patientId} admission={admissionId} />
          ) : null}

          {resolvedTab === 'med-sheet' ? (
            <MedicationSheet patient={patientId} admission={admissionId} />
          ) : null}
        </DashboardCard>
      </div>

      {showGivenModal && (
        <CreateMedicineGivenModal
          initialPatient={patientId}
          inpatientRecord={admissionId}
          onClose={() => setShowGivenModal(false)}
          onSuccess={() => {
            setGivenRefreshKey((k) => k + 1)
            setShowGivenModal(false)
          }}
        />
      )}
    </>
  )
}
