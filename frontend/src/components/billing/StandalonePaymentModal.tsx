import { useState, useEffect } from 'react'
import {
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { toast } from '../../hooks/useToast'
import {
  createPaymentEntry,
  fetchModeOfPayments,
  fetchSalesInvoices,
  fetchSalesOrders,
  fetchSalesInvoiceSummary,
} from '../../services/paymentEntry'
import { useMoneyInputConfig } from '../../hooks/useFormatMoney'
import {
  linkComboboxDropdownClass,
  linkComboboxEmptyPanelClass,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'

interface LinkFieldProps {
  label: string
  placeholder?: string
  value: { name: string; label: string } | null
  options: { name: string; label: string }[]
  open: boolean
  query: string
  loading?: boolean
  required?: boolean
  onQueryChange: (q: string) => void
  onOpen: () => void
  onSelect: (opt: { name: string; label: string }) => void
  onClear: () => void
}

const LinkField = ({
  label,
  placeholder,
  value,
  options,
  open,
  query,
  loading = false,
  required,
  onQueryChange,
  onOpen,
  onSelect,
  onClear,
}: LinkFieldProps) => (
  <div data-standalone-payment-link className="relative">
    <label className="block text-xs font-medium text-slate-600 mb-1.5">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <div className="relative flex items-center">
      <input
        type="text"
        value={value ? value.label : query}
        onChange={(e) => {
          onQueryChange(e.target.value)
          onOpen()
        }}
        onFocus={onOpen}
        placeholder={placeholder ?? `Search ${label}...`}
        className={`${linkComboboxInputWithClearClass} pr-7`}
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-2 text-slate-400 hover:text-slate-600"
          title="Clear"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
    {open && loading && (
      <div className={linkComboboxEmptyPanelClass}>Loading…</div>
    )}
    {open && !loading && options.length > 0 && (
      <div className={linkComboboxDropdownClass}>
        {options.map((opt) => (
          <button
            key={opt.name}
            type="button"
            onClick={() => onSelect(opt)}
            className={linkComboboxOptionClassCompact}
          >
            {opt.label}
          </button>
        ))}
      </div>
    )}
    {open && !loading && options.length === 0 && (
      <div className={linkComboboxEmptyPanelClass}>
        {query.trim() ? 'No results found' : 'No matching records. Try searching by ID, customer, or patient name.'}
      </div>
    )}
  </div>
)

type ReferenceType = 'Sales Invoice' | 'Sales Order'

export interface StandalonePaymentModalProps {
  /** When set, narrows search to this patient only */
  patient?: string
  patientName?: string
  onClose: () => void
  onSuccess: () => void
}

export function StandalonePaymentModal({
  patient,
  patientName,
  onClose,
  onSuccess,
}: StandalonePaymentModalProps) {
  const moneyInput = useMoneyInputConfig()
  const [referenceType, setReferenceType] = useState<ReferenceType>('Sales Invoice')

  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [invoiceOptions, setInvoiceOptions] = useState<{ name: string; label: string }[]>([])
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<{ name: string; label: string } | null>(null)

  const [orderQuery, setOrderQuery] = useState('')
  const [orderOptions, setOrderOptions] = useState<{ name: string; label: string }[]>([])
  const [orderOpen, setOrderOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<{ name: string; label: string } | null>(null)

  const [paymentModes, setPaymentModes] = useState<string[]>([])
  const [paymentMode, setPaymentMode] = useState('')
  const [amount, setAmount] = useState('')
  const [remarks, setRemarks] = useState('')
  const [loading, setLoading] = useState(false)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [orderLoading, setOrderLoading] = useState(false)
  const [limitToPatient, setLimitToPatient] = useState(false)

  useEffect(() => {
    fetchModeOfPayments()
      .then((modes) => {
        setPaymentModes(modes)
        if (modes.length > 0) setPaymentMode(modes[0])
      })
      .catch(() => setPaymentModes(['Cash', 'Bank Transfer', 'Credit Card', 'Cheque']))
  }, [])

  const handleTypeChange = (type: ReferenceType) => {
    setReferenceType(type)
    setAmount('')
    if (type === 'Sales Invoice') {
      setSelectedOrder(null)
      setOrderQuery('')
      setOrderOpen(false)
    } else {
      setSelectedInvoice(null)
      setInvoiceQuery('')
      setInvoiceOpen(false)
    }
  }

  const scopedPatient = limitToPatient && patient ? patient : undefined

  useEffect(() => {
    if (!invoiceOpen || referenceType !== 'Sales Invoice') return
    const t = setTimeout(async () => {
      setInvoiceLoading(true)
      try {
        setInvoiceOptions(await fetchSalesInvoices(invoiceQuery || undefined, scopedPatient))
      } catch {
        setInvoiceOptions([])
      } finally {
        setInvoiceLoading(false)
      }
    }, invoiceQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [invoiceQuery, invoiceOpen, scopedPatient, referenceType])

  useEffect(() => {
    if (!orderOpen || referenceType !== 'Sales Order') return
    const t = setTimeout(async () => {
      setOrderLoading(true)
      try {
        setOrderOptions(await fetchSalesOrders(orderQuery || undefined, scopedPatient))
      } catch {
        setOrderOptions([])
      } finally {
        setOrderLoading(false)
      }
    }, orderQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [orderQuery, orderOpen, scopedPatient, referenceType])

  // Preload recent payable invoices when modal opens
  useEffect(() => {
    setInvoiceLoading(true)
    fetchSalesInvoices(undefined, scopedPatient)
      .then(setInvoiceOptions)
      .catch(() => setInvoiceOptions([]))
      .finally(() => setInvoiceLoading(false))
  }, [scopedPatient])

  useEffect(() => {
    if (!selectedInvoice || referenceType !== 'Sales Invoice') return
    fetchSalesInvoiceSummary(selectedInvoice.name)
      .then((summary) => {
        if (summary.outstanding_amount > 0) {
          setAmount(String(summary.outstanding_amount))
        }
      })
      .catch(() => {})
  }, [selectedInvoice, referenceType])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-standalone-payment-link]')) {
        setInvoiceOpen(false)
        setOrderOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectedReference = referenceType === 'Sales Invoice' ? selectedInvoice : selectedOrder

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedReference) {
      toast.error(`Please select a ${referenceType}`)
      return
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid payment amount')
      return
    }
    if (!paymentMode) {
      toast.error('Please select a mode of payment')
      return
    }

    setLoading(true)
    try {
      const result = await createPaymentEntry({
        reference_doctype: referenceType,
        reference_name: selectedReference.name,
        paid_amount: parseFloat(amount),
        mode_of_payment: paymentMode,
        remarks: remarks.trim() || undefined,
        patient: scopedPatient,
      })
      toast.success(result.server_message || `Payment entry ${result.name} created successfully`)
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create payment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('w-full max-w-md')}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Create Payment</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Standalone payment against a sales invoice or order
              {patientName ? <> &mdash; {patientName}</> : patient ? <> &mdash; {patient}</> : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Reference Type</label>
            <div className="flex rounded-lg border border-slate-300 overflow-hidden">
              {(['Sales Invoice', 'Sales Order'] as ReferenceType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeChange(type)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    referenceType === type
                      ? 'bg-primary text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {patient && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={limitToPatient}
                onChange={(e) => setLimitToPatient(e.target.checked)}
                className="rounded border-slate-300 text-primary focus:ring-primary"
              />
              Limit search to current patient only
            </label>
          )}

          {referenceType === 'Sales Invoice' ? (
            <LinkField
              label="Sales Invoice"
              placeholder="Search by invoice ID, customer, or patient..."
              value={selectedInvoice}
              options={invoiceOptions}
              open={invoiceOpen}
              query={invoiceQuery}
              loading={invoiceLoading}
              required
              onQueryChange={setInvoiceQuery}
              onOpen={() => setInvoiceOpen(true)}
              onSelect={(opt) => {
                setSelectedInvoice(opt)
                setInvoiceQuery('')
                setInvoiceOpen(false)
                const match = invoiceOptions.find((row) => row.name === opt.name) as
                  | { outstanding_amount?: number }
                  | undefined
                if (match?.outstanding_amount && match.outstanding_amount > 0) {
                  setAmount(String(match.outstanding_amount))
                }
              }}
              onClear={() => {
                setSelectedInvoice(null)
                setInvoiceQuery('')
                setAmount('')
              }}
            />
          ) : (
            <LinkField
              label="Sales Order"
              placeholder="Search by order ID, customer, or patient..."
              value={selectedOrder}
              options={orderOptions}
              open={orderOpen}
              query={orderQuery}
              loading={orderLoading}
              required
              onQueryChange={setOrderQuery}
              onOpen={() => setOrderOpen(true)}
              onSelect={(opt) => {
                setSelectedOrder(opt)
                setOrderQuery('')
                setOrderOpen(false)
              }}
              onClear={() => {
                setSelectedOrder(null)
                setOrderQuery('')
              }}
            />
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Amount <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={moneyInput.min}
              step={moneyInput.step}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={moneyInput.placeholder}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Mode of Payment <span className="text-red-500">*</span>
            </label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              required
            >
              <option value="">Select mode of payment...</option>
              {paymentModes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Remarks</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="Optional notes..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating…' : 'Create Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
