import { useState, useEffect } from 'react'
import { fetchPrescription, type Prescription } from '../../services/prescriptions'

// ─── Medication type definitions ──────────────────────────────────────────────
const MED_TYPES = [
  { key: 'All',                        label: 'All',             icon: '💊', color: 'slate'   },
  { key: 'STAT',                       label: 'STAT',            icon: '⚡', color: '#fe80c0' },
  { key: 'PRN',                        label: 'PRN',             icon: '🔔', color: '#fefebf' },
  { key: 'Regular - Psy (Active)',     label: 'Reg Psy Active',  icon: '🧠', color: '#00ff02' },
  { key: 'Regular -Med (Active)',      label: 'Reg Med Active',  icon: '💉', color: '#4080e1' },
  { key: 'Regular - Psy (Inactive)',   label: 'Reg Psy Inactive',icon: '🧠', color: 'slate'   },
  { key: 'Regular - Med (Inactive)',   label: 'Reg Med Inactive',icon: '💉', color: 'slate'   },
  { key: 'Contraindicated',            label: 'Contraindicated', icon: '🚫', color: 'rose'    },
  { key: 'Long Acting Medicine',       label: 'Long Acting',     icon: '⏳', color: 'teal'    },
  { key: 'Future Plan',                label: 'Future Plan',     icon: '📅', color: 'indigo'  },
]

// ─── Tailwind-named color map ─────────────────────────────────────────────────
const TYPE_COLORS: Record<string, { active: string; inactive: string; badge: string; activeBadge: string }> = {
  slate:  { active: 'bg-slate-700 text-white border-slate-700',          inactive: 'bg-white text-slate-600 border-slate-200 hover:border-slate-400',   badge: 'bg-slate-100 text-slate-700',   activeBadge: 'bg-white/20 text-white' },
  red:    { active: 'bg-red-600 text-white border-red-600',              inactive: 'bg-white text-red-600 border-red-200 hover:border-red-400',          badge: 'bg-red-100 text-red-700',       activeBadge: 'bg-white/20 text-white' },
  amber:  { active: 'bg-amber-500 text-white border-amber-500',          inactive: 'bg-white text-amber-600 border-amber-200 hover:border-amber-400',    badge: 'bg-amber-100 text-amber-700',   activeBadge: 'bg-white/20 text-white' },
  violet: { active: 'bg-violet-600 text-white border-violet-600',        inactive: 'bg-white text-violet-600 border-violet-200 hover:border-violet-400', badge: 'bg-violet-100 text-violet-700', activeBadge: 'bg-white/20 text-white' },
  blue:   { active: 'bg-blue-600 text-white border-blue-600',            inactive: 'bg-white text-blue-600 border-blue-200 hover:border-blue-400',       badge: 'bg-blue-100 text-blue-700',     activeBadge: 'bg-white/20 text-white' },
  rose:   { active: 'bg-rose-600 text-white border-rose-600',            inactive: 'bg-white text-rose-600 border-rose-200 hover:border-rose-400',       badge: 'bg-rose-100 text-rose-700',     activeBadge: 'bg-white/20 text-white' },
  teal:   { active: 'bg-teal-600 text-white border-teal-600',            inactive: 'bg-white text-teal-600 border-teal-200 hover:border-teal-400',       badge: 'bg-teal-100 text-teal-700',     activeBadge: 'bg-white/20 text-white' },
  indigo: { active: 'bg-indigo-600 text-white border-indigo-600',        inactive: 'bg-white text-indigo-600 border-indigo-200 hover:border-indigo-400', badge: 'bg-indigo-100 text-indigo-700', activeBadge: 'bg-white/20 text-white' },
}

const STATUS_COLORS: Record<string, string> = {
  Pending:   'bg-amber-100 text-amber-700 border-amber-200',
  Active:    'bg-blue-100 text-blue-700 border-blue-200',
  Completed: 'bg-green-100 text-green-700 border-green-200',
  Cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
  Stopped:   'bg-red-100 text-red-700 border-red-200',
  Draft:     'bg-amber-100 text-amber-700 border-amber-200',
}

// ─── Hex color helpers ────────────────────────────────────────────────────────
const isHex = (color: string) => color.startsWith('#')

// Returns inline style for the filter button (active or inactive state)
const hexButtonStyle = (hex: string, active: boolean): React.CSSProperties =>
  active
    ? { backgroundColor: hex, borderColor: hex, color: '#fff' }
    : { backgroundColor: `${hex}18`, borderColor: `${hex}55`, color: '#334155' }

// Returns inline style for the count badge inside the button
const hexBadgeStyle = (hex: string, active: boolean): React.CSSProperties =>
  active
    ? { backgroundColor: 'rgba(255,255,255,0.25)', color: '#fff' }
    : { backgroundColor: `${hex}33`, color: '#334155' }

// Returns a very subtle row/card tint for medication items
const hexRowStyle = (hex: string): React.CSSProperties => ({
  backgroundColor: `${hex}18`,
  borderColor: `${hex}44`,
})

// Gets the color for a given medication_type key
const getTypeColor = (medicationType: string): string => {
  const typeDef = MED_TYPES.find(t => t.key === medicationType)
  return typeDef?.color ?? 'slate'
}

// ─── Primitives ───────────────────────────────────────────────────────────────
const StatusPill = ({ status }: { status: string }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
    {status}
  </span>
)

const Field = ({ label, value }: { label: string; value?: string | number | null }) => {
  if (value === null || value === undefined || value === '') return null
  return (
    <div>
      <span className="font-medium text-slate-700">{label}:</span>{' '}
      <span className="text-slate-600">{value}</span>
    </div>
  )
}

const SectionTitle = ({ title }: { title: string }) => (
  <h3 className="text-sm font-semibold text-slate-700 mb-2 pb-1 border-b border-slate-100">{title}</h3>
)

const SmallBadge = ({ children, cls }: { children: React.ReactNode; cls: string }) => (
  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{children}</span>
)

// ─── Filter tab card ──────────────────────────────────────────────────────────
const TypeFilterCard = ({
  typeDef,
  count,
  isActive,
  onClick,
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
const MedicationRow = ({ order }: { order: any }) => {
  const color = getTypeColor(order.medication_type)
  const rowStyle: React.CSSProperties = isHex(color)
    ? hexRowStyle(color)
    : order.is_pink ? {} : {}

  return (
    <tr
      className={order.is_pink ? 'bg-pink-50/60' : ''}
      style={!order.is_pink && isHex(color) ? rowStyle : undefined}
    >
      <td className="px-3 py-2.5">
        <div className="flex items-center flex-wrap gap-1.5">
          <span className="font-medium text-slate-800">{order.drug_name?.trim()}</span>
          {order.is_pink && <SmallBadge cls="bg-pink-100 text-pink-700">🩷 Pink</SmallBadge>}
          {order.is_prn  && <SmallBadge cls="bg-amber-100 text-amber-700">PRN</SmallBadge>}
          {order.is_long_acting_medicine && <SmallBadge cls="bg-teal-100 text-teal-700">⏳ Long Acting</SmallBadge>}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">{order.drug}</div>
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
        {order.is_completed
          ? <SmallBadge cls="bg-green-100 text-green-700">Completed</SmallBadge>
          : <SmallBadge cls="bg-amber-100 text-amber-700">Pending</SmallBadge>}
        {order.returned_to_store && (
          <div className="mt-1"><SmallBadge cls="bg-slate-100 text-slate-500">Returned</SmallBadge></div>
        )}
      </td>
    </tr>
  )
}

// ─── Detail card ──────────────────────────────────────────────────────────────
const MedicationDetailCard = ({ order }: { order: any }) => {
  const color = getTypeColor(order.medication_type)
  const cardStyle: React.CSSProperties = isHex(color) ? hexRowStyle(color) : {}

  return (
    <div
      className={`rounded-md border px-4 py-3 text-sm space-y-2 ${
        order.is_pink
          ? 'border-pink-200 bg-pink-50/40'
          : isHex(color)
          ? ''
          : 'border-slate-200 bg-slate-50/40'
      }`}
      style={!order.is_pink && isHex(color) ? cardStyle : undefined}
    >
      <div className="flex items-center justify-between flex-wrap gap-1">
        <span className="font-semibold text-slate-800">{order.drug_name?.trim()}</span>
        <span className="text-xs text-slate-400">{order.medication_type}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-xs">
        {order.instructions && <div><span className="font-medium text-slate-700">Instructions:</span> <span className="text-slate-600">{order.instructions}</span></div>}
        {order.reference_no  && <div><span className="font-medium text-slate-700">Ref No:</span> <span className="text-slate-600">{order.reference_no}</span></div>}
        <div><span className="font-medium text-slate-700">Qty:</span> <span className="text-slate-600">{order.quantity} {order.uom}</span></div>
        <div><span className="font-medium text-slate-700">Days:</span> <span className="text-slate-600">{order.no_of_days}</span></div>
        <div><span className="font-medium text-slate-700">Time:</span> <span className="text-slate-600">{order.time}</span></div>
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface PrescriptionDetailsProps {
  prescriptionName: string
  onUpdate?: () => void
}

// ─── Main component ───────────────────────────────────────────────────────────
export const PrescriptionDetails = ({ prescriptionName, onUpdate }: PrescriptionDetailsProps) => {
  const [prescription, setPrescription] = useState<Prescription | null>(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<Error | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [activeType, setActiveType]     = useState('All')

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchPrescription(prescriptionName)
      setPrescription(data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch prescription'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [prescriptionName])

  const handleStatusChange = async (newStatus: string) => {
    setActionLoading(newStatus)
    try {
      await load()
      onUpdate?.()
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(null)
    }
  }

  const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString() : undefined

  if (loading) return (
    <div className="flex items-center justify-center p-8 text-slate-600">
      Loading prescription details...
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <h3 className="text-red-800 font-semibold mb-2">Error Loading Prescription</h3>
      <p className="text-red-700 text-sm mb-3">{error.message}</p>
      <button onClick={load} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700">Retry</button>
    </div>
  )

  if (!prescription) return (
    <div className="text-slate-500 text-center p-8">Prescription not found</div>
  )

  const orders = prescription.medication_orders || []
  const countFor = (key: string) => key === 'All' ? orders.length : orders.filter((o: any) => o.medication_type === key).length
  const filteredOrders = activeType === 'All' ? orders : orders.filter((o: any) => o.medication_type === activeType)
  const activeTypeDef = MED_TYPES.find(t => t.key === activeType)
  const completionPct = (prescription.total_orders ?? 0) > 0
    ? Math.round(((prescription.completed_orders ?? 0) / (prescription.total_orders ?? 0)) * 100)
    : 0

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Prescription</p>
          <h2 className="text-lg font-bold text-slate-900">{prescription.name}</h2>
          {prescription.is_pink && (
            <span className="inline-flex items-center gap-1 mt-1 text-xs font-medium text-pink-600">
              🩷 Pink Prescription
            </span>
          )}
        </div>
        {prescription.status && <StatusPill status={prescription.status} />}
      </div>

      {/* ── Progress bar ── */}
      <div className="bg-slate-50 rounded-lg px-4 py-3 border border-slate-100">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-slate-600">Order Completion</span>
          <span className="text-xs text-slate-500">
            {prescription.completed_orders} / {prescription.total_orders} orders
          </span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-1.5">
          <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${completionPct}%` }} />
        </div>
        <div className="text-right mt-1">
          <span className="text-xs text-slate-400">{completionPct}% complete</span>
        </div>
      </div>

      {/* ── Info grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
        <div>
          <SectionTitle title="Patient Information" />
          <div className="space-y-1">
            <Field label="Patient"             value={prescription.patient_name || prescription.patient} />
            <Field label="Patient ID"          value={prescription.patient} />
            <Field label="Inpatient Admission" value={prescription.inpatient_record} />
            <Field label="Care Context"        value={prescription.care_context} />
          </div>
        </div>
        <div>
          <SectionTitle title="Prescribing Details" />
          <div className="space-y-1">
            <Field label="Practitioner"    value={prescription.healthcare_practitioner_name || prescription.practitioner} />
            <Field label="Practitioner ID" value={prescription.practitioner} />
            <Field label="Company"         value={prescription.company} />
          </div>
        </div>
        <div>
          <SectionTitle title="Dates & Period" />
          <div className="space-y-1">
            <Field label="Posting Date" value={formatDate(prescription.posting_date)} />
            <Field label="Start Date"   value={formatDate(prescription.start_date)} />
            <Field label="End Date"     value={formatDate(prescription.end_date)} />
          </div>
        </div>
        <div>
          <SectionTitle title="Order Summary" />
          <div className="space-y-1">
            <Field label="Total Orders" value={String(prescription.total_orders)} />
            <Field label="Completed"    value={String(prescription.completed_orders)} />
            <Field label="Pending"      value={String((prescription.total_orders ?? 0) - (prescription.completed_orders ?? 0))} />
          </div>
        </div>
      </div>

      {/* ── Medication Orders ── */}
      {orders.length > 0 && (
        <div className="space-y-3">
          <SectionTitle title="Medication Orders" />

          {/* Filter cards */}
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
              <span className="text-slate-400">({filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'})</span>
              <button onClick={() => setActiveType('All')} className="text-blue-500 hover:underline ml-1">Clear filter</button>
            </div>
          )}

          {/* Table */}
          {filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm border border-dashed border-slate-200 rounded-md">
              No orders for <strong>{activeTypeDef?.label}</strong>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="min-w-full text-sm divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Drug', 'Dosage', 'Form', 'Frequency', 'Route', 'Period', 'Status'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.map((order: any) => (
                      <MedicationRow key={order.name} order={order} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2">
                {filteredOrders.map((order: any) => (
                  <MedicationDetailCard key={order.name} order={order} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Actions ── */}
      <div className="border-t border-slate-200 pt-4">
        <SectionTitle title="Actions" />
        <div className="flex flex-wrap gap-2">
          {prescription.status !== 'Completed' && (
            <button
              onClick={() => handleStatusChange('Completed')}
              disabled={!!actionLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {actionLoading === 'Completed' ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : '✓'} Mark Completed
            </button>
          )}
          {prescription.status !== 'Stopped' && prescription.status !== 'Completed' && (
            <button
              onClick={() => handleStatusChange('Stopped')}
              disabled={!!actionLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {actionLoading === 'Stopped' ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : '✗'} Stop Prescription
            </button>
          )}
        </div>
      </div>

    </div>
  )
}