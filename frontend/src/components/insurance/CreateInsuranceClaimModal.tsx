import { useState, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { apiRequest } from '../../services/apiClient'
import { fetchHealthcareInsurance, type LinkFieldOption } from '../../services/common'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClaimItemRow {
  id: number
  service_type: string
  item_name: string
  description: string
  gross_amount: string
  covered_amount: string
  co_pay_amount: string
  non_covered_amount: string
  patient_liability: string
  paid_amount: string
}

const SERVICE_TYPES = ['OP', 'IP', 'Lab', 'Pharmacy', 'Other']
const STATUS_OPTIONS = ['Draft', 'Submitted', 'Partially Paid', 'Paid', 'Rejected']

// ─── Generic searchable link field ────────────────────────────────────────────

interface LinkFieldProps {
  label: string
  required?: boolean
  placeholder?: string
  query: string
  options: LinkFieldOption[]
  selected: LinkFieldOption | null
  open: boolean
  onFocus: () => void
  onQueryChange: (q: string) => void
  onSelect: (opt: LinkFieldOption) => void
  onClear: () => void
  onOpenChange: (v: boolean) => void
}

function LinkField({
  label, required, placeholder, query, options, selected,
  open, onFocus, onQueryChange, onSelect, onClear, onOpenChange,
}: LinkFieldProps) {
  return (
    <div onClick={e => e.stopPropagation()}>
      <label className="block text-xs font-medium text-slate-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          type="text"
          value={selected ? (selected.label || selected.name) : query}
          onChange={e => { onQueryChange(e.target.value); onOpenChange(true) }}
          onFocus={() => { onFocus(); onOpenChange(true) }}
          placeholder={placeholder || `Search ${label}…`}
          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary pr-7"
        />
        {(selected || query) && (
          <button type="button" onClick={() => { onClear(); onQueryChange('') }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✕</button>
        )}
        {open && options.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded shadow-lg max-h-44 overflow-y-auto">
            {options.map(o => (
              <button key={o.name} type="button"
                onClick={() => { onSelect(o); onOpenChange(false) }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100">
                {o.label || o.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface CreateInsuranceClaimModalProps {
  onClose: () => void
  onSuccess?: (claimName: string) => void
  initialPatient?: string
}

let _itemId = 0
const newRow = (): ClaimItemRow => ({
  id: ++_itemId,
  service_type: 'OP',
  item_name: '',
  description: '',
  gross_amount: '',
  covered_amount: '',
  co_pay_amount: '',
  non_covered_amount: '',
  patient_liability: '',
  paid_amount: '',
})

export const CreateInsuranceClaimModal = ({
  onClose, onSuccess, initialPatient,
}: CreateInsuranceClaimModalProps) => {
  // Basic fields
  const [patient, setPatient] = useState(initialPatient || '')
  const [claimDate, setClaimDate] = useState(new Date().toISOString().split('T')[0])
  const [status, setStatus] = useState('Draft')
  const [salesInvoice, setSalesInvoice] = useState('')

  // Health Insurance link
  const [insOpts, setInsOpts] = useState<LinkFieldOption[]>([])
  const [insOpen, setInsOpen] = useState(false)
  const [insQuery, setInsQuery] = useState('')
  const [selectedIns, setSelectedIns] = useState<LinkFieldOption | null>(null)

  // Patient link combobox
  const [patientOpts, setPatientOpts] = useState<LinkFieldOption[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientQuery, setPatientQuery] = useState(initialPatient || '')
  const [selectedPatient, setSelectedPatient] = useState<LinkFieldOption | null>(
    initialPatient ? { name: initialPatient, label: initialPatient } : null
  )

  // Claim items
  const [items, setItems] = useState<ClaimItemRow[]>([newRow()])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'items'>('info')

  // ─── Loaders ──────────────────────────────────────────────────────────────

  const loadInsurance = useCallback(async (q?: string) => {
    const opts = await fetchHealthcareInsurance(q)
    setInsOpts(opts)
  }, [])

  const loadPatients = useCallback(async (q?: string) => {
    const params = new URLSearchParams()
    if (q) params.append('search', q)
    const url = `/api/method/healthcare.api.common.get_patients${params.toString() ? `?${params.toString()}` : ''}`
    try {
      const res = await fetch(url)
      const data = await res.json()
      if (data?.message) {
        setPatientOpts(
          (data.message as { name: string; patient_name: string }[]).map(p => ({
            name: p.name,
            label: p.patient_name || p.name,
          }))
        )
      }
    } catch { /* ignore */ }
  }, [])

  // ─── Row helpers ──────────────────────────────────────────────────────────

  const updateItem = (id: number, field: keyof ClaimItemRow, val: string) =>
    setItems(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r))

  const removeItem = (id: number) =>
    setItems(prev => prev.filter(r => r.id !== id))

  const calcTotal = (field: keyof ClaimItemRow) =>
    items.reduce((s, r) => s + (parseFloat(r[field] as string) || 0), 0)

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPatient && !patient) { setError('Patient is required'); return }

    try {
      setSaving(true)
      setError(null)

      const payload: Record<string, unknown> = {
        patient: selectedPatient?.name || patient,
        claim_date: claimDate || null,
        status,
        health_insurance: selectedIns?.name || null,
        sales_invoice: salesInvoice.trim() || null,
        claim_items: items
          .filter(r => r.item_name.trim() || r.gross_amount)
          .map(r => ({
            service_type: r.service_type,
            item_name: r.item_name.trim(),
            description: r.description.trim(),
            gross_amount: parseFloat(r.gross_amount) || 0,
            covered_amount: parseFloat(r.covered_amount) || 0,
            co_pay_amount: parseFloat(r.co_pay_amount) || 0,
            non_covered_amount: parseFloat(r.non_covered_amount) || 0,
            patient_liability: parseFloat(r.patient_liability) || 0,
            paid_amount: parseFloat(r.paid_amount) || 0,
          })),
      }

      const created = await apiRequest<{ name: string }>(
        '/api/resource/Insurance%20Claim',
        { method: 'POST', body: JSON.stringify(payload) }
      )
      onSuccess?.(created.name)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create claim')
    } finally {
      setSaving(false)
    }
  }

  const tabs = [
    { id: 'info' as const, label: 'Claim Info' },
    { id: 'items' as const, label: `Items (${items.length})` },
  ]

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col h-[85vh]"
        onClick={e => { e.stopPropagation(); setInsOpen(false); setPatientOpen(false) }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">New Insurance Claim</h2>
            <p className="text-xs text-slate-500 mt-0.5">Submit a claim to the insurance provider</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 flex-shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="h-0 flex-1 overflow-y-auto px-6 py-5 space-y-4" style={{ scrollbarWidth: 'thin' }}>

            {/* ── Claim Info ── */}
            {activeTab === 'info' && (
              <div className="space-y-4">
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Patient & Insurance</h3>

                  {/* Patient */}
                  <LinkField
                    label="Patient" required
                    placeholder="Search patient…"
                    query={patientQuery}
                    options={patientOpts}
                    selected={selectedPatient}
                    open={patientOpen}
                    onFocus={() => loadPatients()}
                    onQueryChange={q => { setPatientQuery(q); loadPatients(q) }}
                    onSelect={o => { setSelectedPatient(o); setPatient(o.name); setPatientQuery(o.label || o.name) }}
                    onClear={() => { setSelectedPatient(null); setPatient(''); setPatientQuery('') }}
                    onOpenChange={setPatientOpen}
                  />

                  {/* Health Insurance */}
                  <LinkField
                    label="Health Insurance"
                    placeholder="Search insurance record…"
                    query={insQuery}
                    options={insOpts}
                    selected={selectedIns}
                    open={insOpen}
                    onFocus={() => loadInsurance()}
                    onQueryChange={q => { setInsQuery(q); loadInsurance(q) }}
                    onSelect={o => { setSelectedIns(o); setInsQuery(o.label || o.name) }}
                    onClear={() => { setSelectedIns(null); setInsQuery('') }}
                    onOpenChange={setInsOpen}
                  />
                </div>

                <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Claim Details</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Claim Date</label>
                      <input type="date" value={claimDate} onChange={e => setClaimDate(e.target.value)}
                        className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                      <select value={status} onChange={e => setStatus(e.target.value)}
                        className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white">
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">Sales Invoice</label>
                      <input type="text" value={salesInvoice} onChange={e => setSalesInvoice(e.target.value)}
                        placeholder="Link to sales invoice…"
                        className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                  </div>
                </div>

                {/* Totals preview */}
                {items.some(r => r.gross_amount) && (
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                      <div className="text-xs text-blue-500 mb-0.5">Total Gross</div>
                      <div className="font-semibold text-blue-800 text-sm">{calcTotal('gross_amount').toFixed(2)}</div>
                    </div>
                    <div className="rounded-lg bg-green-50 border border-green-100 p-3">
                      <div className="text-xs text-green-500 mb-0.5">Total Covered</div>
                      <div className="font-semibold text-green-800 text-sm">{calcTotal('covered_amount').toFixed(2)}</div>
                    </div>
                    <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                      <div className="text-xs text-amber-500 mb-0.5">Patient Liability</div>
                      <div className="font-semibold text-amber-800 text-sm">{calcTotal('patient_liability').toFixed(2)}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Claim Items ── */}
            {activeTab === 'items' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">Add services and amounts for this claim</p>
                  <button
                    type="button"
                    onClick={() => setItems(prev => [...prev, newRow()])}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary rounded-md hover:bg-primary/5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Item
                  </button>
                </div>

                {items.map((row, idx) => (
                  <div key={row.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">Item #{idx + 1}</span>
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(row.id)}
                          className="text-red-400 hover:text-red-600 p-1 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Service Type</label>
                        <select value={row.service_type}
                          onChange={e => updateItem(row.id, 'service_type', e.target.value)}
                          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white">
                          {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Item / Service Name</label>
                        <input type="text" value={row.item_name}
                          onChange={e => updateItem(row.id, 'item_name', e.target.value)}
                          placeholder="e.g. Consultation fee"
                          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                        <input type="text" value={row.description}
                          onChange={e => updateItem(row.id, 'description', e.target.value)}
                          placeholder="Optional description"
                          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {(
                        [
                          { field: 'gross_amount', label: 'Gross Amount' },
                          { field: 'covered_amount', label: 'Covered Amount' },
                          { field: 'co_pay_amount', label: 'Co-pay Amount' },
                          { field: 'non_covered_amount', label: 'Non-covered' },
                          { field: 'patient_liability', label: 'Patient Liability' },
                          { field: 'paid_amount', label: 'Paid Amount' },
                        ] as { field: keyof ClaimItemRow; label: string }[]
                      ).map(({ field, label }) => (
                        <div key={field}>
                          <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
                          <input type="number" value={row[field] as string}
                            onChange={e => updateItem(row.id, field, e.target.value)}
                            placeholder="0.00" step="0.01" min="0"
                            className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Totals summary at bottom of items */}
                {items.some(r => r.gross_amount) && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Totals</h4>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      {(
                        [
                          { field: 'gross_amount', label: 'Gross', color: 'text-slate-800' },
                          { field: 'covered_amount', label: 'Covered', color: 'text-green-700' },
                          { field: 'co_pay_amount', label: 'Co-pay', color: 'text-amber-700' },
                          { field: 'non_covered_amount', label: 'Non-covered', color: 'text-red-600' },
                          { field: 'patient_liability', label: 'Pt. Liability', color: 'text-orange-700' },
                          { field: 'paid_amount', label: 'Paid', color: 'text-blue-700' },
                        ] as { field: keyof ClaimItemRow; label: string; color: string }[]
                      ).map(({ field, label, color }) => (
                        <div key={field} className="text-xs">
                          <div className="text-slate-500 mb-0.5">{label}</div>
                          <div className={`font-semibold ${color}`}>{calcTotal(field).toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 flex-shrink-0">
            {error && (
              <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
            )}
            <div className="flex justify-between items-center">
              <button type="button" onClick={() => setActiveTab(activeTab === 'info' ? 'items' : 'info')}
                className="text-sm text-slate-500 hover:text-slate-700 underline">
                {activeTab === 'info' ? 'Go to Items →' : '← Back to Info'}
              </button>
              <div className="flex gap-3">
                <button type="button" onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50">
                  {saving ? 'Creating…' : 'Create Claim'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
