import { useState, useCallback, useEffect } from 'react'
import { Plus, Trash2, FileText, AlertCircle } from 'lucide-react'
import { fetchHealthcareInsurance, type LinkFieldOption } from '../../services/common'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'

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
  sales_invoice_item?: string
}

interface InvoiceOption {
  name: string
  posting_date: string
  grand_total: number
  discount_amount: number
  outstanding_amount: number
  status: string
  custom_base_reference: string | null
  custom_base_reference_name: string | null
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
      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          type="text"
          value={selected ? (selected.label || selected.name) : query}
          onChange={e => { onQueryChange(e.target.value); onOpenChange(true) }}
          onFocus={() => { onFocus(); onOpenChange(true) }}
          placeholder={placeholder || `Search ${label}…`}
          className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-2.5 py-1.5 text-sm placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 pr-7 transition-colors"
        />
        {(selected || query) && (
          <button type="button" onClick={() => { onClear(); onQueryChange('') }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs transition-colors">✕</button>
        )}
        {open && options.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded shadow-lg max-h-44 overflow-y-auto">
            {options.map(o => (
              <button key={o.name} type="button"
                onClick={() => { onSelect(o); onOpenChange(false) }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-900 dark:text-white transition-colors">
                {o.label || o.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Invoice dropdown ──────────────────────────────────────────────────────────

interface InvoiceDropdownProps {
  invoices: InvoiceOption[]
  selected: InvoiceOption | null
  loading: boolean
  patientSelected: boolean
  onSelect: (inv: InvoiceOption | null) => void
}

function InvoiceDropdown({ invoices, selected, loading, patientSelected, onSelect }: InvoiceDropdownProps) {
  const [open, setOpen] = useState(false)

  const fmtCurrency = (v: number) =>
    v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

  return (
    <div onClick={e => e.stopPropagation()}>
      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
        Sales Invoice <span className="text-slate-400 dark:text-slate-500 font-normal">(unpaid / partly paid)</span>
      </label>

      {!patientSelected ? (
        <div className="rounded border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-xs text-slate-400 dark:text-slate-400 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" />
          Select a patient first to load their invoices
        </div>
      ) : loading ? (
        <div className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-xs text-slate-400 dark:text-slate-400 animate-pulse">
          Loading invoices…
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-xs text-slate-400 dark:text-slate-400 flex items-center gap-2">
          <FileText className="w-3.5 h-3.5" />
          No unpaid invoices found for this patient
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="w-full text-left rounded border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-slate-700 text-slate-900 dark:text-white flex items-center justify-between transition-colors"
          >
            {selected ? (
              <span>
                <span className="font-medium">{selected.name}</span>
                <span className="text-slate-500 dark:text-slate-400 ml-2 text-xs">{selected.posting_date}</span>
                <span className={`ml-2 text-xs font-medium ${selected.status === 'Unpaid' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {selected.status}
                </span>
              </span>
            ) : (
              <span className="text-slate-400 dark:text-slate-400">Select invoice…</span>
            )}
            <svg className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {selected && (
            <button type="button" onClick={() => { onSelect(null); setOpen(false) }}
              className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs z-10 transition-colors">✕</button>
          )}

          {open && (
            <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded shadow-lg max-h-56 overflow-y-auto">
              {invoices.map(inv => (
                <button key={inv.name} type="button"
                  onClick={() => { onSelect(inv); setOpen(false) }}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-600 border-b border-slate-100 dark:border-slate-600 last:border-0 transition-colors ${selected?.name === inv.name ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800 dark:text-white">{inv.name}</span>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${inv.status === 'Unpaid' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'}`}>
                      {inv.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span>{inv.posting_date}</span>
                    <span>Total: <strong className="text-slate-700 dark:text-white">{fmtCurrency(inv.grand_total)}</strong></span>
                    <span>Outstanding: <strong className="text-orange-600 dark:text-orange-400">{fmtCurrency(inv.outstanding_amount)}</strong></span>
                    {inv.custom_base_reference && (
                      <span className="text-blue-500 dark:text-blue-400">{inv.custom_base_reference}: {inv.custom_base_reference_name}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selected invoice detail card */}
      {selected && (
        <div className="mt-2 rounded-lg border border-blue-100 dark:border-blue-900/30 bg-blue-50 dark:bg-blue-900/20 p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Grand Total</div>
              <div className="font-semibold text-slate-800 dark:text-white text-sm">{fmtCurrency(selected.grand_total)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Discount</div>
              <div className="font-semibold text-green-700 dark:text-green-400 text-sm">{fmtCurrency(selected.discount_amount)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Outstanding</div>
              <div className="font-semibold text-orange-600 dark:text-orange-400 text-sm">{fmtCurrency(selected.outstanding_amount)}</div>
            </div>
          </div>
          {selected.custom_base_reference && (
            <div className="text-xs text-slate-600 dark:text-slate-300 border-t border-blue-100 dark:border-blue-900/30 pt-2 flex items-center gap-1.5">
              <span className="font-medium text-blue-700 dark:text-blue-400">{selected.custom_base_reference}</span>
              <span className="text-slate-400 dark:text-slate-500">→</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">{selected.custom_base_reference_name}</span>
              <span className="text-slate-400 dark:text-slate-500 ml-1">(will be saved as Reference)</span>
            </div>
          )}
        </div>
      )}
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
  const [claimDate, setClaimDate] = useState(new Date().toISOString().split('T')[0])
  const [status, setStatus] = useState('Submitted')

  // Health Insurance link
  const [insOpts, setInsOpts] = useState<LinkFieldOption[]>([])
  const [insOpen, setInsOpen] = useState(false)
  const [insQuery, setInsQuery] = useState('')
  const [selectedIns, setSelectedIns] = useState<LinkFieldOption | null>(null)

  // Patient (same pattern as CreateAdmissionModal)
  const [patientQuery, setPatientQuery] = useState(initialPatient || '')
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(
    initialPatient ? { name: initialPatient, patient_name: initialPatient } as PatientListItem : null
  )
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientLoading, setPatientLoading] = useState(false)

  // Invoice
  const [invoices, setInvoices] = useState<InvoiceOption[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceOption | null>(null)

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

  // Patient search — same useEffect pattern as CreateAdmissionModal
  useEffect(() => {
    if (!patientOpen) return
    const search = async () => {
      setPatientLoading(true)
      try {
        const results = patientQuery.trim() === ''
          ? await fetchPatients(20, 0)
          : await searchPatients(patientQuery, 20)
        setPatients(results)
      } catch { setPatients([]) } finally { setPatientLoading(false) }
    }
    const t = setTimeout(search, patientQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [patientQuery, patientOpen])

  const loadInvoices = useCallback(async (patientName: string) => {
    setInvoicesLoading(true)
    setInvoices([])
    setSelectedInvoice(null)
    try {
      const res = await fetch(
        `/api/method/healthcare.api.common.get_patient_unpaid_invoices?patient=${encodeURIComponent(patientName)}`
      )
      const data = await res.json()
      if (data?.message) {
        setInvoices(data.message as InvoiceOption[])
      }
    } catch { /* ignore */ } finally {
      setInvoicesLoading(false)
    }
  }, [])

  const loadInvoiceItems = useCallback(async (invoiceName: string) => {
    try {
      const res = await fetch(
        `/api/method/healthcare.api.common.get_sales_invoice_with_items?invoice_name=${encodeURIComponent(invoiceName)}`
      )
      const data = await res.json()
      const msg = data?.message
      if (!msg) return

      // Auto-fill items
      if (msg.items?.length) {
        const mapped: ClaimItemRow[] = msg.items.map(
          (item: { item_code: string; item_name: string; description: string; amount: number }) => ({
            id: ++_itemId,
            service_type: 'OP',
            item_name: item.item_name || '',
            description: item.description || '',
            gross_amount: String(item.amount || ''),
            covered_amount: '',
            co_pay_amount: '',
            non_covered_amount: '',
            patient_liability: '',
            paid_amount: '',
            sales_invoice_item: item.item_code || '',
          })
        )
        setItems(mapped)
      }

      // Auto-fill health insurance from invoice if not already chosen
      if (msg.custom_health_insurance && !selectedIns) {
        setSelectedIns({ name: msg.custom_health_insurance, label: msg.custom_health_insurance })
        setInsQuery(msg.custom_health_insurance)
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIns])

  // Load invoices when patient changes
  useEffect(() => {
    if (selectedPatient?.name) {
      loadInvoices(selectedPatient.name)
    } else {
      setInvoices([])
      setSelectedInvoice(null)
    }
  }, [selectedPatient?.name, loadInvoices])

  // Pre-load initial patient invoices
  useEffect(() => {
    if (initialPatient) loadInvoices(initialPatient)
  }, [initialPatient, loadInvoices])

  // Auto-populate items when invoice is selected
  useEffect(() => {
    if (selectedInvoice?.name) {
      loadInvoiceItems(selectedInvoice.name)
    } else {
      setItems([newRow()])
    }
  }, [selectedInvoice?.name, loadInvoiceItems])

  // ─── Row helpers ──────────────────────────────────────────────────────────

  const updateItem = (id: number, field: keyof ClaimItemRow, val: string) =>
    setItems(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r))

  const removeItem = (id: number) =>
    setItems(prev => prev.filter(r => r.id !== id))

  const calcTotal = (field: keyof ClaimItemRow) =>
    items.reduce((s, r) => s + (parseFloat(r[field] as string) || 0), 0)

  const fmtCurrency = (v: number) =>
    v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPatient) { setError('Patient is required'); return }

    try {
      setSaving(true)
      setError(null)

      const csrfToken = (window as Record<string, unknown>)?.frappe?.csrf_token as string | undefined

      const payload = {
        patient: selectedPatient.name,
        claim_date: claimDate || null,
        status,
        health_insurance: selectedIns?.name || null,
        sales_invoice: selectedInvoice?.name || null,
        reference_doctype: selectedInvoice?.custom_base_reference || null,
        reference_name: selectedInvoice?.custom_base_reference_name || null,
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
            ...(r.sales_invoice_item ? { sales_invoice_item: r.sales_invoice_item } : {}),
          })),
      }

      const res = await fetch('/api/method/healthcare.api.common.create_and_submit_insurance_claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-Frappe-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify({ data: JSON.stringify(payload) }),
      })
      const data = await res.json()
      if (!res.ok || data.exc) {
        const msg = data?.exc_type === 'ValidationError'
          ? (data?.exception || 'Validation error')
          : (data?.message || 'Failed to create claim')
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      }
      const claimName: string = data?.message?.name || data?.message
      onSuccess?.(claimName)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create claim')
    } finally {
      setSaving(false)
    }
  }

  const itemsFromInvoice = items.some(r => r.sales_invoice_item)

  const tabs = [
    { id: 'info' as const, label: 'Claim Info' },
    { id: 'items' as const, label: `Items (${items.length})${itemsFromInvoice ? ' ✓' : ''}` },
  ]

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl flex flex-col h-[85vh]"
        onClick={() => { setInsOpen(false); setPatientOpen(false) }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">New Insurance Claim</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Submit a claim to the insurance provider</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 px-6 flex-shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
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
                {/* Patient & Insurance card */}
                <div className="rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide">Patient & Insurance</h3>

                  {/* Patient */}
                  <div onClick={e => e.stopPropagation()}>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Patient <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={selectedPatient ? (selectedPatient.patient_name || selectedPatient.name) : patientQuery}
                        onChange={e => {
                          setSelectedPatient(null)
                          setPatientQuery(e.target.value)
                          setPatientOpen(true)
                        }}
                        onFocus={() => setPatientOpen(true)}
                        placeholder="Search patient…"
                        className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-2.5 py-1.5 text-sm placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
                      />
                      {patientOpen && (
                        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-lg max-h-48 overflow-auto">
                          {patientLoading ? (
                            <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Loading patients…</div>
                          ) : patients.length > 0 ? (
                            patients.map(p => (
                              <button key={p.name} type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-slate-600 text-slate-900 dark:text-white transition-colors"
                                onClick={() => {
                                  setSelectedPatient(p)
                                  setPatientQuery(p.patient_name || p.name)
                                  setPatientOpen(false)
                                }}
                              >
                                <div className="font-medium">{p.patient_name || p.name}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 mt-0.5">
                                  {p.file_number && <span>File: {p.file_number}</span>}
                                  {p.id_number && <span>ID: {p.id_number}</span>}
                                  {p.mobile && <span>{p.mobile}</span>}
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                              {patientQuery ? 'No patients match your search.' : 'No patients found.'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

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

                {/* Invoice selection card */}
                <div className="rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide">Invoice</h3>
                  <InvoiceDropdown
                    invoices={invoices}
                    selected={selectedInvoice}
                    loading={invoicesLoading}
                    patientSelected={!!selectedPatient}
                    onSelect={setSelectedInvoice}
                  />
                </div>

                {/* Claim details card */}
                <div className="rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide">Claim Details</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Claim Date</label>
                      <input type="date" value={claimDate} onChange={e => setClaimDate(e.target.value)}
                        className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                      <select value={status} onChange={e => setStatus(e.target.value)}
                        className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors">
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Totals preview */}
                {items.some(r => r.gross_amount) && (
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 p-3">
                      <div className="text-xs text-blue-500 dark:text-blue-400 mb-0.5">Total Gross</div>
                      <div className="font-semibold text-blue-800 dark:text-blue-300 text-sm">{fmtCurrency(calcTotal('gross_amount'))}</div>
                    </div>
                    <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 p-3">
                      <div className="text-xs text-green-500 dark:text-green-400 mb-0.5">Total Covered</div>
                      <div className="font-semibold text-green-800 dark:text-green-300 text-sm">{fmtCurrency(calcTotal('covered_amount'))}</div>
                    </div>
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 p-3">
                      <div className="text-xs text-amber-500 dark:text-amber-400 mb-0.5">Patient Liability</div>
                      <div className="font-semibold text-amber-800 dark:text-amber-300 text-sm">{fmtCurrency(calcTotal('patient_liability'))}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Claim Items ── */}
            {activeTab === 'items' && (
              <div className="space-y-3">
                {itemsFromInvoice && (
                  <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-400 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    Items loaded from invoice <strong>{selectedInvoice?.name}</strong>. You can edit amounts before submitting.
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{itemsFromInvoice ? 'Review and adjust amounts (3 decimal places for BDH)' : 'Add services and amounts for this claim (3 decimal places for BDH)'}</p>
                  <button
                    type="button"
                    onClick={() => setItems(prev => [...prev, newRow()])}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-400 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Item
                  </button>
                </div>

                {items.map((row, idx) => (
                  <div key={row.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-300">Item #{idx + 1}</span>
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(row.id)}
                          className="text-red-400 hover:text-red-600 dark:hover:text-red-300 p-1 rounded transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Service Type</label>
                        <select value={row.service_type}
                          onChange={e => updateItem(row.id, 'service_type', e.target.value)}
                          className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors">
                          {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Item / Service Name</label>
                        <input type="text" value={row.item_name}
                          onChange={e => updateItem(row.id, 'item_name', e.target.value)}
                          placeholder="e.g. Consultation fee"
                          className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-2.5 py-1.5 text-sm placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                        <input type="text" value={row.description}
                          onChange={e => updateItem(row.id, 'description', e.target.value)}
                          placeholder="Optional description"
                          className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-2.5 py-1.5 text-sm placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors" />
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
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>
                          <input type="text" value={row[field] as string}
                            onChange={e => {
                              const val = e.target.value
                              // Allow 3 decimal places for BDH
                              if (val === '' || /^\d*\.?\d{0,3}$/.test(val)) {
                                updateItem(row.id, field, val)
                              }
                            }}
                            placeholder="0.000" 
                            className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-2.5 py-1.5 text-sm placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Totals summary at bottom of items */}
                {items.some(r => r.gross_amount) && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                    <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide mb-3">Totals</h4>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      {(
                        [
                          { field: 'gross_amount', label: 'Gross', color: 'text-slate-800 dark:text-white' },
                          { field: 'covered_amount', label: 'Covered', color: 'text-green-700 dark:text-green-400' },
                          { field: 'co_pay_amount', label: 'Co-pay', color: 'text-amber-700 dark:text-amber-400' },
                          { field: 'non_covered_amount', label: 'Non-covered', color: 'text-red-600 dark:text-red-400' },
                          { field: 'patient_liability', label: 'Pt. Liability', color: 'text-orange-700 dark:text-orange-400' },
                          { field: 'paid_amount', label: 'Paid', color: 'text-blue-700 dark:text-blue-400' },
                        ] as { field: keyof ClaimItemRow; label: string; color: string }[]
                      ).map(({ field, label, color }) => (
                        <div key={field} className="text-xs">
                          <div className="text-slate-500 dark:text-slate-400 mb-0.5">{label}</div>
                          <div className={`font-semibold ${color}`}>{fmtCurrency(calcTotal(field))}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0 bg-slate-50 dark:bg-slate-900">
            {error && (
              <div className="mb-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>
            )}
            <div className="flex justify-between items-center">
              <button type="button" onClick={() => setActiveTab(activeTab === 'info' ? 'items' : 'info')}
                className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 underline transition-colors">
                {activeTab === 'info' ? 'Go to Items →' : '← Back to Info'}
              </button>
              <div className="flex gap-3">
                <button type="button" onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
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