import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  fetchPrescriptionByInpatientOrEncounter,
  saveMedicationOrderEntryStopReason,
  type Prescription,
} from '../../services/prescriptions'
import { RefreshCw, MoreVertical } from 'lucide-react'
import { useCareContext } from '../../providers/CareContextProvider'
import { CreatePrescriptionModal } from './CreatePrescriptionModal'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { toast } from '../../hooks/useToast'


// ─── Medication type definitions ──────────────────────────────────────────────
const MED_TYPES = [
  { key: 'All',                        label: 'All',              icon: '💊', color: 'slate'   },
  { key: 'STAT',                       label: 'STAT',             icon: '⚡', color: '#fe80c0' },
  { key: 'PRN',                        label: 'PRN',              icon: '🔔', color: '#fefebf' },
  { key: 'Regular - Psy (Active)',     label: 'Reg Psy Active',   icon: '🧠', color: '#00ff02' },
  { key: 'Regular -Med (Active)',      label: 'Reg Med Active',   icon: '💉', color: '#4080e1' },
  { key: 'Regular - Psy (Inactive)',   label: 'Reg Psy Inactive', icon: '🧠', color: 'slate'   },
  { key: 'Regular - Med (Inactive)',   label: 'Reg Med Inactive', icon: '💉', color: 'slate'   },
  { key: 'Contraindicated',            label: 'Contraindicated',  icon: '🚫', color: 'rose'    },
  { key: 'Long Acting Medicine',       label: 'Long Acting',      icon: '⏳', color: 'teal'    },
  { key: 'Future Plan',                label: 'Future Plan',      icon: '📅', color: 'indigo'  },
]

const TYPE_COLORS: Record<string, { active: string; inactive: string; badge: string; activeBadge: string }> = {
  slate:  { active: 'bg-slate-700 text-white border-slate-700',          inactive: 'bg-white text-slate-600 border-slate-200 hover:border-slate-400',   badge: 'bg-slate-100 text-slate-700',   activeBadge: 'bg-white/20 text-white' },
  rose:   { active: 'bg-rose-600 text-white border-rose-600',            inactive: 'bg-white text-rose-600 border-rose-200 hover:border-rose-400',       badge: 'bg-rose-100 text-rose-700',     activeBadge: 'bg-white/20 text-white' },
  teal:   { active: 'bg-teal-600 text-white border-teal-600',            inactive: 'bg-white text-teal-600 border-teal-200 hover:border-teal-400',       badge: 'bg-teal-100 text-teal-700',     activeBadge: 'bg-white/20 text-white' },
  indigo: { active: 'bg-indigo-600 text-white border-indigo-600',        inactive: 'bg-white text-indigo-600 border-indigo-200 hover:border-indigo-400', badge: 'bg-indigo-100 text-indigo-700', activeBadge: 'bg-white/20 text-white' },
}

const isHex = (color: string) => color.startsWith('#')

const hexButtonStyle = (hex: string, active: boolean): React.CSSProperties =>
  active
    ? { backgroundColor: hex, borderColor: hex, color: '#1e293b' }
    : { backgroundColor: `${hex}18`, borderColor: `${hex}55`, color: '#334155' }

const hexBadgeStyle = (hex: string, active: boolean): React.CSSProperties =>
  active
    ? { backgroundColor: 'rgba(0,0,0,0.15)', color: '#1e293b' }
    : { backgroundColor: `${hex}33`, color: '#334155' }

const hexRowStyle = (hex: string): React.CSSProperties => ({
  backgroundColor: `${hex}18`,
  borderColor: `${hex}44`,
})

const getTypeColor = (medicationType: string): string =>
  MED_TYPES.find(t => t.key === medicationType)?.color ?? 'slate'

// ─── Primitives ───────────────────────────────────────────────────────────────
const SmallBadge = ({ children, cls }: { children: React.ReactNode; cls: string }) => (
  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{children}</span>
)

// ─── Type filter card ─────────────────────────────────────────────────────────
const TypeFilterCard = ({
  typeDef, count, isActive, onClick,
}: {
  typeDef: (typeof MED_TYPES)[number]
  count: number
  isActive: boolean
  onClick: () => void
}) => {
  if (count === 0 && typeDef.key !== 'All') return null

  const hex = isHex(typeDef.color)
  const tailwind = !hex ? (TYPE_COLORS[typeDef.color] ?? TYPE_COLORS.slate) : null

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all min-w-[72px] cursor-pointer ${
        hex ? '' : isActive ? tailwind!.active : tailwind!.inactive
      }`}
      style={hex ? hexButtonStyle(typeDef.color, isActive) : undefined}
    >
      <span className="text-base leading-none">{typeDef.icon}</span>
      <span className="leading-tight text-center">{typeDef.label}</span>
      <span
        className={`mt-0.5 rounded-full px-1.5 py-0 text-[10px] font-semibold ${
          hex ? '' : isActive ? tailwind!.activeBadge : tailwind!.badge
        }`}
        style={hex ? hexBadgeStyle(typeDef.color, isActive) : undefined}
      >
        {count}
      </span>
    </button>
  )
}

// ─── Table row ────────────────────────────────────────────────────────────────
const MedicationRow = ({
  order,
  prescriptionName,
  onUpdated,
}: {
  order: any
  prescriptionName: string
  onUpdated: () => void | Promise<void>
}) => {
  const color = getTypeColor(order.medication_type)
  const rowStyle = isHex(color) ? hexRowStyle(color) : {}
  const reasonStopped = String(order.reason_stopped || '').trim()
  const isStopped = Boolean(reasonStopped)

  const [menuOpen, setMenuOpen] = useState(false)
  const [stopModalOpen, setStopModalOpen] = useState(false)
  const [stopModalMode, setStopModalMode] = useState<'stop' | 'edit'>('stop')
  const [reasonDraft, setReasonDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const openStopModal = (mode: 'stop' | 'edit') => {
    setStopModalMode(mode)
    setReasonDraft(mode === 'edit' ? reasonStopped : '')
    setStopModalOpen(true)
    setMenuOpen(false)
  }

  const handleSaveStopReason = async () => {
    const text = reasonDraft.trim()
    if (!text) {
      toast.error('Please enter a stop reason.')
      return
    }
    try {
      setSaving(true)
      await saveMedicationOrderEntryStopReason(prescriptionName, order.name, { reasonStopped: text })
      toast.success(stopModalMode === 'edit' ? 'Stop reason updated' : 'Medication marked as stopped')
      setStopModalOpen(false)
      await onUpdated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save stop reason')
    } finally {
      setSaving(false)
    }
  }

  const handleResume = async () => {
    if (!window.confirm('Clear the stop and resume this medication line?')) return
    try {
      setSaving(true)
      await saveMedicationOrderEntryStopReason(prescriptionName, order.name, { clear: true })
      toast.success('Stop cleared — line active again')
      setMenuOpen(false)
      await onUpdated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to clear stop')
    } finally {
      setSaving(false)
    }
  }

  const stopModal =
    stopModalOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setStopModalOpen(false)
            }}
          >
            <div className="w-full max-w-md rounded-lg bg-white shadow-xl border border-slate-200 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                {stopModalMode === 'edit' ? 'Change stop reason' : 'Stop medication'}
              </h3>
              <p className="text-xs text-slate-500">
                {stopModalMode === 'edit'
                  ? 'Update the reason documented for stopping this line.'
                  : 'This line will show as stopped. Enter a clinical reason (required).'}
              </p>
              <label className="block text-xs font-medium text-slate-600">Reason stopped</label>
              <textarea
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="e.g. Side effects, replaced by X, patient refused…"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStopModalOpen(false)}
                  className="px-3 py-1.5 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveStopReason()}
                  className="px-3 py-1.5 text-sm rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <>
      {stopModal}
      <tr
        className={`${order.is_pink ? 'bg-pink-50/60' : ''} ${isStopped ? 'opacity-90' : ''}`}
        style={!order.is_pink && isHex(color) ? rowStyle : undefined}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center flex-wrap gap-1.5">
            <span className={`font-medium ${isStopped ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
              {order.drug_name?.trim()}
            </span>
            {isStopped && <SmallBadge cls="bg-rose-100 text-rose-800 border border-rose-200">Stopped</SmallBadge>}
            {order.is_pink && <SmallBadge cls="bg-pink-100 text-pink-700">🩷 Pink</SmallBadge>}
            {order.is_prn && <SmallBadge cls="bg-amber-100 text-amber-700">PRN</SmallBadge>}
            {order.is_long_acting_medicine && <SmallBadge cls="bg-teal-100 text-teal-700">⏳ Long Acting</SmallBadge>}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{order.drug}</div>
          {isStopped && (
            <div className="mt-1.5 text-xs text-rose-800 bg-rose-50/80 border border-rose-100 rounded px-2 py-1 max-w-md" title={reasonStopped}>
              <span className="font-semibold text-rose-900">Reason: </span>
              {reasonStopped}
            </div>
          )}
        </td>
        <td className="px-3 py-2.5">
          <span className="font-medium text-slate-800">{order.dosage}</span>
          <span className="text-slate-500 text-xs ml-1">{order.uom}</span>
        </td>
        <td className="px-3 py-2.5 text-slate-600 text-sm">{order.dosage_form}</td>
        <td className="px-3 py-2.5">
          <SmallBadge cls="bg-blue-100 text-blue-700">{order.patient_frequency}</SmallBadge>
          {order.frequency_in_a_day > 0 && (
            <div className="text-xs text-slate-400 mt-0.5">{order.frequency_in_a_day}×/day</div>
          )}
        </td>
        <td className="px-3 py-2.5 text-slate-600 text-xs">{order.route_of_administration}</td>
        <td className="px-3 py-2.5 text-xs text-slate-500">
          <div>{order.date}</div>
          <div className="text-slate-400">→ {order.end_date}</div>
        </td>
        <td className="px-3 py-2.5">
          {order.is_completed ? (
            <SmallBadge cls="bg-green-100 text-green-700">Completed</SmallBadge>
          ) : isStopped ? (
            <SmallBadge cls="bg-rose-100 text-rose-800">Stopped</SmallBadge>
          ) : (
            <SmallBadge cls="bg-amber-100 text-amber-700">Pending</SmallBadge>
          )}
          {order.returned_to_store && (
            <div className="mt-1">
              <SmallBadge cls="bg-slate-100 text-slate-500">Returned</SmallBadge>
            </div>
          )}
        </td>
        <td className="px-3 py-2.5 text-right align-middle">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            title="Actions"
            aria-label="Row actions"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          <PortalActionsMenu open={menuOpen} onClose={() => setMenuOpen(false)} triggerRef={triggerRef} placement="below-right">
            <button
              type="button"
              disabled={isStopped}
              onClick={() => openStopModal('stop')}
              className="block w-full text-left px-3 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Stop medication…
            </button>
            <button
              type="button"
              disabled={!isStopped}
              onClick={() => openStopModal('edit')}
              className="block w-full text-left px-3 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Change stop reason…
            </button>
            <button
              type="button"
              disabled={!isStopped}
              onClick={() => {
                setMenuOpen(false)
                void handleResume()
              }}
              className="block w-full text-left px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Resume medication
            </button>
          </PortalActionsMenu>
        </td>
      </tr>
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
// interface RxPageProps {
//   inpatientRecordId?: string | null
//   patientEncounterId?: string | null
// }

export const RxPage = () => {
    const { 
    selectedPatient, 
    mode, 
    activeVisit,      // This is the patient_encounter ID for OP
    activeAdmission   // This is the inpatient_record ID for IP
  } = useCareContext()
  const [prescription, setPrescription] = useState<Prescription | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeType, setActiveType] = useState('All')

  const [showEditModal, setShowEditModal] = useState(false)
const handleEdit = () => {
  setShowEditModal(true)
}


  const load = async () => {
    const inpatientRecordId = mode === 'IP' ? activeAdmission : null
    const patientEncounterId = mode === 'OP' ? activeVisit : null

    if (!inpatientRecordId && !patientEncounterId) {
      setPrescription(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
        // console.log('Fetched prescription:', id)
const data = await fetchPrescriptionByInpatientOrEncounter(inpatientRecordId, patientEncounterId)      
      setPrescription(data)
    } catch (e) {
      setError('Could not load prescription.')
      setPrescription(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Reset active type when switching patients/visits
    setActiveType('All')
    
    // Load prescription when mode, activeVisit, or activeAdmission changes
    if ((mode === 'OP' && activeVisit) || (mode === 'IP' && activeAdmission)) {
      load()
    } else {
      setPrescription(null)
    }
  }, [mode, activeVisit, activeAdmission, selectedPatient])

  if ((mode === 'OP' && !activeVisit) || (mode === 'IP' && !activeAdmission)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
        <span className="text-4xl">📋</span>
        <p className="text-sm">
          {mode === 'OP' ? 'Select an OP visit to view prescription.' : 'Select an IP admission to view prescription.'}
        </p>
      </div>
    )
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading prescription…</span>
      </div>
    )
  }

   if (!selectedPatient) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
        <span className="text-4xl">💊</span>
        <p className="text-sm">Select a patient to view their prescription.</p>
      </div>
    )
  }


  // ── Error ──
 if (error) {
    return (
      <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
        <button onClick={() => load()} className="ml-3 underline hover:no-underline">
          Retry
        </button>
      </div>
    )
  }

  // ── No prescription found ──
   if (!prescription) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
        <span className="text-4xl">📋</span>
        <p className="text-sm">No prescription found for this {mode === 'OP' ? 'visit' : 'admission'}.</p>
      </div>
    )
    }

  const orders = prescription.medication_orders || []
  const countFor = (key: string) =>
    key === 'All' ? orders.length : orders.filter((o: any) => o.medication_type === key).length
  const filteredOrders =
    activeType === 'All' ? orders : orders.filter((o: any) => o.medication_type === activeType)
  const activeTypeDef = MED_TYPES.find(t => t.key === activeType)
  const completionPct = (prescription.total_orders ?? 0) > 0
    ? Math.round(((prescription.completed_orders ?? 0) / (prescription.total_orders ?? 0)) * 100)
    : 0

  return (
    <div className="flex flex-col h-full">
      {/* ── Sticky top bar ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 pt-4 pb-3 space-y-3">
        {/* Title row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wide leading-none mb-0.5">
                        Prescription - {mode === 'OP' ? 'Outpatient' : 'Inpatient'}
                    </p>
                    <h1 className="text-base font-bold text-slate-900 leading-none">
                        {prescription.name}
                        {prescription.is_pink && (
                        <span className="ml-2 text-xs font-medium text-pink-500">🩷 Pink</span>
                        )}
                    </h1>
                    </div>
                    {/* Add Edit Button */}
                    <button
                    onClick={handleEdit}
                    className="ml-2 px-3 py-1 text-xs font-medium rounded-md border border-primary text-primary hover:bg-primary hover:text-white transition-colors"
                    >
                    Edit Prescription
                    </button>
                </div>

          {/* Progress + refresh */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-slate-500 mb-1">
                {prescription.completed_orders} / {prescription.total_orders} completed
              </div>
              <div className="w-36 bg-slate-100 rounded-full h-1.5">
                <div
                  className="bg-green-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
            </div>
            <button
              onClick={() => load()}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showEditModal && (
  <CreatePrescriptionModal
    onClose={() => setShowEditModal(false)}
    onSuccess={() => {
      setShowEditModal(false)
      load() // Reload the prescription after edit
    }}
    editMode={true}
    prescriptionData={prescription}
  />
)}

        {/* Type filter cards */}
        <div className="flex flex-wrap gap-2">
          {MED_TYPES.map(typeDef => (
            <TypeFilterCard
              key={typeDef.key}
              typeDef={typeDef}
              count={countFor(typeDef.key)}
              isActive={activeType === typeDef.key}
              onClick={() => setActiveType(typeDef.key)}
            />
          ))}
        </div>

        {/* Active filter label */}
        {activeType !== 'All' && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Showing:</span>
            <span className="font-medium text-slate-700">{activeTypeDef?.icon} {activeTypeDef?.label}</span>
            <span className="text-slate-400">
              ({filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'})
            </span>
            <button onClick={() => setActiveType('All')} className="text-blue-500 hover:underline ml-1">
              Clear
            </button>
          </div>
        )}
      </div>

      {/* ── Drug table ── */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2 border border-dashed border-slate-200 rounded-lg">
            <span className="text-2xl">{activeTypeDef?.icon}</span>
            <p className="text-sm">No orders for <strong>{activeTypeDef?.label}</strong></p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  {['Drug', 'Dosage', 'Form', 'Frequency', 'Route', 'Period', 'Status', 'Actions'].map(h => (
                    <th
                      key={h}
                      className={`px-3 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide ${
                        h === 'Actions' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredOrders.map((order: any) => (
                  <MedicationRow
                    key={order.name}
                    order={order}
                    prescriptionName={prescription.name}
                    onUpdated={load}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
