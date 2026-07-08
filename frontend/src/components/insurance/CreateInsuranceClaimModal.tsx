import { useState, useCallback, useEffect } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_FOOTER_STICKY,
  CREATE_MODAL_OVERLAY,
  CREATE_MODAL_TAB_BAR,
  CreateModalHeader,
  createModalShellClass,
  createModalTabButtonClass,
  MODAL_FIELD_CLASS_COMPACT,
  MODAL_LABEL_CLASS,
  MODAL_SECTION_CLASS,
  MODAL_SECTION_TITLE_CLASS,
} from '../ui/CreateModalChrome'
import { Plus, Trash2, FileText, AlertCircle } from 'lucide-react'
import { fetchHealthcareInsurance, fetchInsuranceClaimDetail, saveInsuranceClaim, type LinkFieldOption, type InvoiceNeedingClaimRow } from '../../services/common'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import {
  linkComboboxDropdownClassShort,
  linkComboboxInputClassCompact,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClaimItemRow {
  id: number
  service_type: string
  item_name: string
  description: string
  qty?: string
  rate?: string
  discount_percentage?: string
  discount_amount?: string
  net_amount?: string
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
      <label className={`${MODAL_LABEL_CLASS} text-xs`}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          type="text"
          value={selected ? (selected.label || selected.name) : query}
          onChange={e => { onQueryChange(e.target.value); onOpenChange(true) }}
          onFocus={() => { onFocus(); onOpenChange(true) }}
          placeholder={placeholder || `Search ${label}…`}
          className={`${linkComboboxInputClassCompact} pr-7`}
        />
        {(selected || query) && (
          <button type="button" onClick={() => { onClear(); onQueryChange('') }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs transition-colors">✕</button>
        )}
        {open && options.length > 0 && (
          <div className={linkComboboxDropdownClassShort}>
            {options.map(o => (
              <button key={o.name} type="button"
                onClick={() => { onSelect(o); onOpenChange(false) }}
                className={linkComboboxOptionClassCompact}>
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
      <label className="block text-xs font-medium text-slate-700 mb-1">
        Sales Invoice <span className="text-slate-400 font-normal">(unpaid / partly paid)</span>
      </label>

      {!patientSelected ? (
        <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-400 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" />
          Select a patient first to load their invoices
        </div>
      ) : loading ? (
        <div className="rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-400 animate-pulse">
          Loading invoices…
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-400 flex items-center gap-2">
          <FileText className="w-3.5 h-3.5" />
          No unpaid invoices found for this patient
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="w-full text-left rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 flex items-center justify-between transition-colors"
          >
            {selected ? (
              <span>
                <span className="font-medium">{selected.name}</span>
                <span className="text-slate-500 ml-2 text-xs">{selected.posting_date}</span>
                <span className={`ml-2 text-xs font-medium ${selected.status === 'Unpaid' ? 'text-red-600' : 'text-amber-600'}`}>
                  {selected.status}
                </span>
              </span>
            ) : (
              <span className="text-slate-400">Select invoice…</span>
            )}
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {selected && (
            <button type="button" onClick={() => { onSelect(null); setOpen(false) }}
              className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs z-10 transition-colors">✕</button>
          )}

          {open && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded shadow-lg max-h-56 overflow-y-auto">
              {invoices.map(inv => (
                <button key={inv.name} type="button"
                  onClick={() => { onSelect(inv); setOpen(false) }}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors ${selected?.name === inv.name ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{inv.name}</span>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${inv.status === 'Unpaid' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                      {inv.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                    <span>{inv.posting_date}</span>
                    <span>Total: <strong className="text-slate-700">{fmtCurrency(inv.grand_total)}</strong></span>
                    <span>Outstanding: <strong className="text-orange-600">{fmtCurrency(inv.outstanding_amount)}</strong></span>
                    {inv.custom_base_reference && (
                      <span className="text-blue-500">{inv.custom_base_reference}: {inv.custom_base_reference_name}</span>
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
        <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xs text-slate-500">Grand Total</div>
              <div className="font-semibold text-slate-800 text-sm">{fmtCurrency(selected.grand_total)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Discount</div>
              <div className="font-semibold text-green-700 text-sm">{fmtCurrency(selected.discount_amount)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Outstanding</div>
              <div className="font-semibold text-orange-600 text-sm">{fmtCurrency(selected.outstanding_amount)}</div>
            </div>
          </div>
          {selected.custom_base_reference && (
            <div className="text-xs text-slate-600 border-t border-blue-100 pt-2 flex items-center gap-1.5">
              <span className="font-medium text-blue-700">{selected.custom_base_reference}</span>
              <span className="text-slate-400">→</span>
              <span className="font-mono text-slate-700">{selected.custom_base_reference_name}</span>
              <span className="text-slate-400 ml-1">(will be saved as Reference)</span>
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
  initialInvoice?: InvoiceNeedingClaimRow
  editClaimName?: string
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
  onClose, onSuccess, initialPatient, initialInvoice, editClaimName,
}: CreateInsuranceClaimModalProps) => {
  const isEdit = Boolean(editClaimName)
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
  const [loadingClaim, setLoadingClaim] = useState(Boolean(editClaimName))
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'items'>('info')
  const [editClaimId, setEditClaimId] = useState<string | undefined>(editClaimName)

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
          (item: {
            item_code: string
            item_name: string
            description: string
            qty: number
            rate: number
            amount: number
            net_amount: number
            discount_percentage: number
            discount_amount: number
          }) => ({
            id: ++_itemId,
            service_type: 'OP',
            item_name: item.item_name || '',
            description: item.description || '',
            qty: String(item.qty ?? ''),
            rate: String(item.rate ?? ''),
            discount_percentage: String(item.discount_percentage ?? ''),
            discount_amount: String(item.discount_amount ?? ''),
            net_amount: String(item.net_amount ?? item.amount ?? ''),
            gross_amount: String(item.net_amount ?? item.amount ?? ''),
            covered_amount: String(item.net_amount ?? item.amount ?? ''),
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

  // Pre-select invoice from "needs claim" card
  useEffect(() => {
    if (!initialInvoice || isEdit) return
    const inv: InvoiceOption = {
      name: initialInvoice.name,
      posting_date: initialInvoice.posting_date,
      grand_total: initialInvoice.grand_total,
      discount_amount: initialInvoice.discount_amount,
      outstanding_amount: initialInvoice.outstanding_amount,
      status: initialInvoice.status,
      custom_base_reference: initialInvoice.custom_base_reference,
      custom_base_reference_name: initialInvoice.custom_base_reference_name,
    }
    if (initialInvoice.patient) {
      setSelectedPatient({ name: initialInvoice.patient, patient_name: initialInvoice.patient_name || initialInvoice.patient } as PatientListItem)
      setPatientQuery(initialInvoice.patient_name || initialInvoice.patient)
    }
    setSelectedInvoice(inv)
    if (initialInvoice.custom_health_insurance) {
      setSelectedIns({ name: initialInvoice.custom_health_insurance, label: initialInvoice.custom_health_insurance })
      setInsQuery(initialInvoice.custom_health_insurance)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInvoice])

  // Load existing draft for edit
  useEffect(() => {
    if (!editClaimName) return
    let cancelled = false
    setLoadingClaim(true)
    fetchInsuranceClaimDetail(editClaimName)
      .then(detail => {
        if (cancelled || !detail) return
        setEditClaimId(detail.name)
        setClaimDate(detail.claim_date || new Date().toISOString().split('T')[0])
        setStatus(detail.status || 'Draft')
        setSelectedPatient({ name: detail.patient, patient_name: detail.patient_name || detail.patient } as PatientListItem)
        setPatientQuery(detail.patient_name || detail.patient)
        if (detail.health_insurance) {
          setSelectedIns({ name: detail.health_insurance, label: detail.health_insurance })
          setInsQuery(detail.health_insurance)
        }
        if (detail.sales_invoice) {
          setSelectedInvoice({
            name: detail.sales_invoice,
            posting_date: '',
            grand_total: detail.total_claimed,
            discount_amount: 0,
            outstanding_amount: 0,
            status: '',
            custom_base_reference: detail.reference_doctype,
            custom_base_reference_name: detail.reference_name,
          })
        }
        if (detail.claim_items?.length) {
          setItems(detail.claim_items.map(ci => ({
            id: ++_itemId,
            service_type: ci.service_type || 'OP',
            item_name: ci.item_name || '',
            description: ci.description || '',
            gross_amount: String(ci.gross_amount ?? ''),
            covered_amount: String(ci.covered_amount ?? ''),
            co_pay_amount: String(ci.co_pay_amount ?? ''),
            non_covered_amount: String(ci.non_covered_amount ?? ''),
            patient_liability: String(ci.patient_liability ?? ''),
            paid_amount: String(ci.paid_amount ?? ''),
            sales_invoice_item: ci.sales_invoice_item,
          })))
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load claim'))
      .finally(() => { if (!cancelled) setLoadingClaim(false) })
    return () => { cancelled = true }
  }, [editClaimName])

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

  const buildPayload = (submit: boolean) => ({
    ...(editClaimId ? { name: editClaimId } : {}),
    patient: selectedPatient!.name,
    claim_date: claimDate || null,
    status: submit ? 'Submitted' : 'Draft',
    health_insurance: selectedIns?.name || null,
    sales_invoice: selectedInvoice?.name || null,
    reference_doctype: selectedInvoice?.custom_base_reference || null,
    reference_name: selectedInvoice?.custom_base_reference_name || null,
    submit,
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
  })

  const handleSave = async (submit: boolean) => {
    if (!selectedPatient) { setError('Patient is required'); return }

    try {
      setSaving(true)
      setError(null)
      const result = await saveInsuranceClaim(buildPayload(submit))
      onSuccess?.(result.name)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save claim')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSave(true)
  }

  const itemsFromInvoice = items.some(r => r.sales_invoice_item)

  const tabs = [
    { id: 'info' as const, label: 'Claim Info' },
    { id: 'items' as const, label: `Items (${items.length})${itemsFromInvoice ? ' ✓' : ''}` },
  ]

  return (
    <div
      className={CREATE_MODAL_OVERLAY}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={createModalShellClass('max-w-3xl h-[85vh]')}
        onClick={() => { setInsOpen(false); setPatientOpen(false) }}
      >
        <CreateModalHeader
          title={isEdit ? `Edit Insurance Claim — ${editClaimName}` : 'New Insurance Claim'}
          subtitle="Submit a claim to the insurance provider"
          icon={<FileText className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
          alert={error || undefined}
        >
          <div className={`${CREATE_MODAL_TAB_BAR} -mx-5 px-5 sm:-mx-6 sm:px-6`}>
            {tabs.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={createModalTabButtonClass(activeTab === t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </CreateModalHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className={`${CREATE_MODAL_BODY_GRADIENT} px-6 py-5 space-y-4`} style={{ scrollbarWidth: 'thin' }}>

            {/* ── Claim Info ── */}
            {activeTab === 'info' && (
              <div className="space-y-4">
                {/* Patient & Insurance card */}
                <div className={`${MODAL_SECTION_CLASS} space-y-3`}>
                  <h3 className={MODAL_SECTION_TITLE_CLASS}>Patient & Insurance</h3>

                  {/* Patient */}
                  <div onClick={e => e.stopPropagation()}>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
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
                        className="w-full rounded border border-slate-300 bg-white text-slate-900 px-2.5 py-1.5 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                      />
                      {patientOpen && (
                        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                          {patientLoading ? (
                            <div className="px-3 py-2 text-xs text-slate-500">Loading patients…</div>
                          ) : patients.length > 0 ? (
                            patients.map(p => (
                              <button key={p.name} type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-slate-900 transition-colors"
                                onClick={() => {
                                  setSelectedPatient(p)
                                  setPatientQuery(p.patient_name || p.name)
                                  setPatientOpen(false)
                                }}
                              >
                                <div className="font-medium">{p.patient_name || p.name}</div>
                                <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 mt-0.5">
                                  {p.file_number && <span>File: {p.file_number}</span>}
                                  {p.id_number && <span>ID: {p.id_number}</span>}
                                  {p.mobile && <span>{p.mobile}</span>}
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-xs text-slate-500">
                              {patientQuery ? 'No Patient Found.' : 'NO PATIENTS FOUND.'}
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
                <div className={`${MODAL_SECTION_CLASS} space-y-3`}>
                  <h3 className={MODAL_SECTION_TITLE_CLASS}>Invoice</h3>
                  <InvoiceDropdown
                    invoices={invoices}
                    selected={selectedInvoice}
                    loading={invoicesLoading}
                    patientSelected={!!selectedPatient}
                    onSelect={setSelectedInvoice}
                  />
                </div>

                {/* Claim details card */}
                <div className={`${MODAL_SECTION_CLASS} space-y-3`}>
                  <h3 className={MODAL_SECTION_TITLE_CLASS}>Claim Details</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Claim Date</label>
                      <input type="date" value={claimDate} onChange={e => setClaimDate(e.target.value)}
                        className={MODAL_FIELD_CLASS_COMPACT} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                      <select value={status} onChange={e => setStatus(e.target.value)}
                        className={MODAL_FIELD_CLASS_COMPACT}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Totals preview */}
                {items.some(r => r.gross_amount) && (
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                      <div className="text-xs text-blue-500 mb-0.5">Total Gross</div>
                      <div className="font-semibold text-blue-800 text-sm">{fmtCurrency(calcTotal('gross_amount'))}</div>
                    </div>
                    <div className="rounded-lg bg-green-50 border border-green-100 p-3">
                      <div className="text-xs text-green-500 mb-0.5">Total Covered</div>
                      <div className="font-semibold text-green-800 text-sm">{fmtCurrency(calcTotal('covered_amount'))}</div>
                    </div>
                    <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                      <div className="text-xs text-amber-500 mb-0.5">Patient Liability</div>
                      <div className="font-semibold text-amber-800 text-sm">{fmtCurrency(calcTotal('patient_liability'))}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Claim Items ── */}
            {activeTab === 'items' && (
              <div className="space-y-3">
                {itemsFromInvoice && (
                  <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    Items loaded from invoice <strong>{selectedInvoice?.name}</strong>. Review qty, rate, discounts, and claim amounts below.
                  </div>
                )}
                {itemsFromInvoice && items.some(r => r.qty) && (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-left">
                          <th className="px-2 py-1.5 font-semibold text-slate-600">Item</th>
                          <th className="px-2 py-1.5 font-semibold text-slate-600 text-right">Qty</th>
                          <th className="px-2 py-1.5 font-semibold text-slate-600 text-right">Rate</th>
                          <th className="px-2 py-1.5 font-semibold text-slate-600 text-right">Disc %</th>
                          <th className="px-2 py-1.5 font-semibold text-slate-600 text-right">Net</th>
                          <th className="px-2 py-1.5 font-semibold text-slate-600 text-right">Claim</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.filter(r => r.item_name.trim()).map(row => (
                          <tr key={row.id} className="border-t border-slate-100">
                            <td className="px-2 py-1.5">{row.item_name}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{row.qty || '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{row.rate || '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-green-700">{row.discount_percentage ? `${row.discount_percentage}%` : '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{row.net_amount || row.gross_amount || '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-primary">{row.covered_amount || row.gross_amount || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">{itemsFromInvoice ? 'Review and adjust amounts (3 decimal places for BDH)' : 'Add services and amounts for this claim (3 decimal places for BDH)'}</p>
                  <button
                    type="button"
                    onClick={() => setItems(prev => [...prev, newRow()])}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50 transition-colors"
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
                          className="text-red-400 hover:text-red-600 p-1 rounded transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Service Type</label>
                        <select value={row.service_type}
                          onChange={e => updateItem(row.id, 'service_type', e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white text-slate-900 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
                          {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Item / Service Name</label>
                        <input type="text" value={row.item_name}
                          onChange={e => updateItem(row.id, 'item_name', e.target.value)}
                          placeholder="e.g. Consultation fee"
                          className="w-full rounded border border-slate-300 bg-white text-slate-900 px-2.5 py-1.5 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                        <input type="text" value={row.description}
                          onChange={e => updateItem(row.id, 'description', e.target.value)}
                          placeholder="Optional description"
                          className="w-full rounded border border-slate-300 bg-white text-slate-900 px-2.5 py-1.5 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
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
                          <input type="text" value={row[field] as string}
                            onChange={e => {
                              const val = e.target.value
                              // Allow 3 decimal places for BDH
                              if (val === '' || /^\d*\.?\d{0,3}$/.test(val)) {
                                updateItem(row.id, field, val)
                              }
                            }}
                            placeholder="0.000" 
                            className="w-full rounded border border-slate-300 bg-white text-slate-900 px-2.5 py-1.5 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
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
          <div className={`${CREATE_MODAL_FOOTER_STICKY} justify-between items-center`}>
            <button type="button" onClick={() => setActiveTab(activeTab === 'info' ? 'items' : 'info')}
              className="text-sm text-emerald-800/70 hover:text-emerald-950 underline transition-colors">
              {activeTab === 'info' ? 'Go to Items →' : '← Back to Info'}
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className={CM_BTN_CANCEL} disabled={saving || loadingClaim}>
                Cancel
              </button>
              {!isEdit && (
                <button
                  type="button"
                  disabled={saving || loadingClaim}
                  onClick={() => handleSave(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Draft'}
                </button>
              )}
              {isEdit && (
                <button
                  type="button"
                  disabled={saving || loadingClaim}
                  onClick={() => handleSave(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              )}
              <button type="submit" disabled={saving || loadingClaim} className={CM_BTN_PRIMARY}>
                {saving ? 'Submitting…' : isEdit ? 'Submit Claim' : 'Create & Submit'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}