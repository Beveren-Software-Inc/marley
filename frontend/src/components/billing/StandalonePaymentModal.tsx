import { useState, useEffect, useMemo } from 'react'
import { AlertCircle, Info } from 'lucide-react'
import {
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { toast } from '../../hooks/useToast'
import {
  createPaymentEntry,
  createPatientAdvancePayment,
  createMultiInvoicePayment,
  createPatientRefund,
  fetchModeOfPayments,
  fetchSalesInvoices,
  fetchSalesOrders,
  fetchSalesInvoiceSummary,
  fetchPatientBillingBalance,
  fetchPatientOutstandingInvoices,
  type PatientBillingBalance,
  type PaymentReferenceOption,
} from '../../services/paymentEntry'
import { searchPatients, type PatientListItem } from '../../services/patients'
import { useFormatMoney, useMoneyInputConfig } from '../../hooks/useFormatMoney'
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
type PaymentMode = 'single' | 'advance' | 'multi' | 'refund'

const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  single: 'Invoice / Order',
  advance: 'Patient advance',
  multi: 'Multiple invoices',
  refund: 'Refund credit',
}

export interface StandalonePaymentModalProps {
  /** When set, narrows search to this patient only */
  patient?: string
  patientName?: string
  onClose: () => void
  onSuccess: () => void
}

export function StandalonePaymentModal({
  patient: initialPatient,
  patientName: initialPatientName,
  onClose,
  onSuccess,
}: StandalonePaymentModalProps) {
  const moneyInput = useMoneyInputConfig()
  const formatMoney = useFormatMoney()

  const [paymentMode, setPaymentMode] = useState<PaymentMode>('single')
  const [referenceType, setReferenceType] = useState<ReferenceType>('Sales Invoice')

  const [selectedPatient, setSelectedPatient] = useState<{ name: string; label: string } | null>(
    initialPatient
      ? { name: initialPatient, label: initialPatientName || initialPatient }
      : null
  )
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientLoading, setPatientLoading] = useState(false)

  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [invoiceOptions, setInvoiceOptions] = useState<PaymentReferenceOption[]>([])
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<{ name: string; label: string } | null>(null)
  const [invoiceOutstanding, setInvoiceOutstanding] = useState(0)

  const [orderQuery, setOrderQuery] = useState('')
  const [orderOptions, setOrderOptions] = useState<PaymentReferenceOption[]>([])
  const [orderOpen, setOrderOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<{ name: string; label: string } | null>(null)

  const [multiInvoices, setMultiInvoices] = useState<PaymentReferenceOption[]>([])
  const [multiLoading, setMultiLoading] = useState(false)
  const [multiSelected, setMultiSelected] = useState<Record<string, number>>({})

  const [billingBalance, setBillingBalance] = useState<PatientBillingBalance | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

  const [paymentModes, setPaymentModes] = useState<string[]>([])
  const [modeOfPayment, setModeOfPayment] = useState('')
  const [amount, setAmount] = useState('')
  const [remarks, setRemarks] = useState('')
  const [loading, setLoading] = useState(false)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [orderLoading, setOrderLoading] = useState(false)
  const [limitToPatient, setLimitToPatient] = useState(!!initialPatient)

  const effectivePatient = selectedPatient?.name

  useEffect(() => {
    fetchModeOfPayments()
      .then((modes) => {
        setPaymentModes(modes)
        if (modes.length > 0) setModeOfPayment(modes[0])
      })
      .catch(() => setPaymentModes(['Cash', 'Bank Transfer', 'Credit Card', 'Cheque']))
  }, [])

  useEffect(() => {
    if (!patientOpen || effectivePatient) return
    const t = setTimeout(async () => {
      setPatientLoading(true)
      try {
        const q = patientQuery.trim()
        setPatientOptions(q ? await searchPatients(q, 20) : [])
      } catch {
        setPatientOptions([])
      } finally {
        setPatientLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [patientQuery, patientOpen, effectivePatient])

  useEffect(() => {
    if (!effectivePatient || paymentMode === 'single') return
    setBalanceLoading(true)
    fetchPatientBillingBalance(effectivePatient)
      .then(setBillingBalance)
      .catch(() => setBillingBalance(null))
      .finally(() => setBalanceLoading(false))
  }, [effectivePatient, paymentMode])

  useEffect(() => {
    if (paymentMode !== 'multi' || !effectivePatient) {
      setMultiInvoices([])
      setMultiSelected({})
      return
    }
    setMultiLoading(true)
    fetchPatientOutstandingInvoices(effectivePatient)
      .then((rows) => {
        setMultiInvoices(rows)
        const initial: Record<string, number> = {}
        rows.forEach((row) => {
          if (row.outstanding_amount && row.outstanding_amount > 0) {
            initial[row.name] = row.outstanding_amount
          }
        })
        setMultiSelected(initial)
      })
      .catch(() => {
        setMultiInvoices([])
        setMultiSelected({})
      })
      .finally(() => setMultiLoading(false))
  }, [paymentMode, effectivePatient])

  const scopedPatient = limitToPatient && effectivePatient ? effectivePatient : undefined

  useEffect(() => {
    if (!invoiceOpen || referenceType !== 'Sales Invoice' || paymentMode !== 'single') return
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
  }, [invoiceQuery, invoiceOpen, scopedPatient, referenceType, paymentMode])

  useEffect(() => {
    if (!orderOpen || referenceType !== 'Sales Order' || paymentMode !== 'single') return
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
  }, [orderQuery, orderOpen, scopedPatient, referenceType, paymentMode])

  useEffect(() => {
    if (paymentMode !== 'single') return
    setInvoiceLoading(true)
    fetchSalesInvoices(undefined, scopedPatient)
      .then(setInvoiceOptions)
      .catch(() => setInvoiceOptions([]))
      .finally(() => setInvoiceLoading(false))
  }, [scopedPatient, paymentMode])

  useEffect(() => {
    if (!selectedInvoice || referenceType !== 'Sales Invoice') return
    fetchSalesInvoiceSummary(selectedInvoice.name)
      .then((summary) => {
        setInvoiceOutstanding(summary.outstanding_amount)
        if (summary.outstanding_amount > 0) {
          setAmount(String(summary.outstanding_amount))
        }
      })
      .catch(() => setInvoiceOutstanding(0))
  }, [selectedInvoice, referenceType])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-standalone-payment-link]')) {
        setInvoiceOpen(false)
        setOrderOpen(false)
        setPatientOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const multiTotalAllocated = useMemo(
    () => Object.values(multiSelected).reduce((sum, v) => sum + (v || 0), 0),
    [multiSelected]
  )

  const parsedAmount = parseFloat(amount) || 0
  const creditBalance = billingBalance?.credit_balance ?? 0
  const overpayAmount =
    paymentMode === 'single' &&
    referenceType === 'Sales Invoice' &&
    invoiceOutstanding > 0 &&
    parsedAmount > invoiceOutstanding
      ? parsedAmount - invoiceOutstanding
      : 0

  const multiExcess =
    paymentMode === 'multi' && parsedAmount > multiTotalAllocated
      ? parsedAmount - multiTotalAllocated
      : 0

  const handleModeChange = (mode: PaymentMode) => {
    setPaymentMode(mode)
    setAmount('')
    setRemarks('')
    if (mode !== 'single') {
      setSelectedInvoice(null)
      setSelectedOrder(null)
      setInvoiceQuery('')
      setOrderQuery('')
    }
  }

  const handleTypeChange = (type: ReferenceType) => {
    setReferenceType(type)
    setAmount('')
    setInvoiceOutstanding(0)
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

  const toggleMultiInvoice = (name: string, outstanding: number) => {
    setMultiSelected((prev) => {
      const next = { ...prev }
      if (name in next) {
        delete next[name]
      } else {
        next[name] = outstanding
      }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!effectivePatient && paymentMode !== 'single') {
      toast.error('Please select a patient')
      return
    }

    if (!modeOfPayment) {
      toast.error('Please select a mode of payment')
      return
    }

    setLoading(true)
    try {
      if (paymentMode === 'advance') {
        if (!effectivePatient) {
          toast.error('Please select a patient')
          return
        }
        if (parsedAmount <= 0) {
          toast.error('Please enter a valid payment amount')
          return
        }
        const result = await createPatientAdvancePayment({
          patient: effectivePatient,
          paid_amount: parsedAmount,
          mode_of_payment: modeOfPayment,
          remarks: remarks.trim() || undefined,
        })
        toast.success(result.server_message || `Advance payment ${result.name} recorded`)
      } else if (paymentMode === 'multi') {
        if (!effectivePatient) {
          toast.error('Please select a patient')
          return
        }
        const allocations = Object.entries(multiSelected)
          .filter(([, amt]) => amt > 0)
          .map(([reference_name, allocated_amount]) => ({ reference_name, allocated_amount }))
        if (allocations.length === 0) {
          toast.error('Select at least one invoice')
          return
        }
        if (parsedAmount <= 0) {
          toast.error('Please enter the total payment amount received')
          return
        }
        if (multiTotalAllocated > parsedAmount) {
          toast.error('Total allocated amount cannot exceed payment amount')
          return
        }
        const result = await createMultiInvoicePayment({
          patient: effectivePatient,
          paid_amount: parsedAmount,
          mode_of_payment: modeOfPayment,
          allocations,
          remarks: remarks.trim() || undefined,
        })
        toast.success(result.server_message || `Payment ${result.name} recorded`)
      } else if (paymentMode === 'refund') {
        if (!effectivePatient) {
          toast.error('Please select a patient')
          return
        }
        if (parsedAmount <= 0) {
          toast.error('Please enter a valid refund amount')
          return
        }
        if (parsedAmount > creditBalance) {
          toast.error(`Refund exceeds available credit (${formatMoney(creditBalance)})`)
          return
        }
        const result = await createPatientRefund({
          patient: effectivePatient,
          refund_amount: parsedAmount,
          mode_of_payment: modeOfPayment,
          remarks: remarks.trim() || undefined,
        })
        toast.success(result.server_message || `Refund ${result.name} recorded`)
      } else {
        const selectedReference = referenceType === 'Sales Invoice' ? selectedInvoice : selectedOrder
        if (!selectedReference) {
          toast.error(`Please select a ${referenceType}`)
          return
        }
        if (parsedAmount <= 0) {
          toast.error('Please enter a valid payment amount')
          return
        }
        const result = await createPaymentEntry({
          reference_doctype: referenceType,
          reference_name: selectedReference.name,
          paid_amount: parsedAmount,
          mode_of_payment: modeOfPayment,
          remarks: remarks.trim() || undefined,
          patient: scopedPatient,
        })
        toast.success(result.server_message || `Payment entry ${result.name} created successfully`)
      }
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create payment')
    } finally {
      setLoading(false)
    }
  }

  const submitDisabled =
    loading ||
    (paymentMode === 'single' &&
      !(referenceType === 'Sales Invoice' ? selectedInvoice : selectedOrder)) ||
    (paymentMode !== 'single' && !effectivePatient) ||
    parsedAmount <= 0 ||
    (paymentMode === 'multi' && Object.keys(multiSelected).length === 0) ||
    (paymentMode === 'multi' && multiTotalAllocated > parsedAmount) ||
    (paymentMode === 'refund' && parsedAmount > creditBalance)

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('w-full max-w-lg max-h-[90vh] flex flex-col')}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Create Payment</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Record payments, advances, or refunds for patients
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Payment type</label>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-300 overflow-hidden">
              {(Object.keys(PAYMENT_MODE_LABELS) as PaymentMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleModeChange(mode)}
                  className={`py-2 px-2 text-xs font-medium transition-colors ${
                    paymentMode === mode
                      ? 'bg-primary text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {PAYMENT_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>

          {!initialPatient && (
            <LinkField
              label="Patient"
              placeholder="Search patient by name or ID…"
              value={selectedPatient}
              options={patientOptions.map((p) => ({
                name: p.name,
                label: p.patient_name ? `${p.patient_name} (${p.name})` : p.name,
              }))}
              open={patientOpen}
              query={patientQuery}
              loading={patientLoading}
              required={paymentMode !== 'single'}
              onQueryChange={setPatientQuery}
              onOpen={() => setPatientOpen(true)}
              onSelect={(opt) => {
                setSelectedPatient(opt)
                setPatientQuery('')
                setPatientOpen(false)
                setLimitToPatient(true)
              }}
              onClear={() => {
                setSelectedPatient(null)
                setPatientQuery('')
                setBillingBalance(null)
              }}
            />
          )}

          {initialPatient && selectedPatient && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Patient: <span className="font-medium">{selectedPatient.label}</span>
            </div>
          )}

          {(paymentMode === 'advance' || paymentMode === 'multi' || paymentMode === 'refund') &&
            effectivePatient && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900">
                {balanceLoading ? (
                  'Loading patient balance…'
                ) : billingBalance ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      Outstanding invoices:{' '}
                      <strong>{formatMoney(billingBalance.outstanding_invoices)}</strong>
                    </span>
                    <span>
                      Credit balance: <strong>{formatMoney(billingBalance.credit_balance)}</strong>
                    </span>
                  </div>
                ) : (
                  'Could not load patient balance'
                )}
              </div>
            )}

          {paymentMode === 'single' && (
            <>
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

              {effectivePatient && (
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={limitToPatient}
                    onChange={(e) => setLimitToPatient(e.target.checked)}
                    className="rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  Limit search to selected patient only
                </label>
              )}

              {referenceType === 'Sales Invoice' ? (
                <LinkField
                  label="Sales Invoice"
                  placeholder="Search by invoice ID, case no, admission or visit…"
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
                    const match = invoiceOptions.find((row) => row.name === opt.name)
                    if (match?.outstanding_amount && match.outstanding_amount > 0) {
                      setInvoiceOutstanding(match.outstanding_amount)
                      setAmount(String(match.outstanding_amount))
                    }
                  }}
                  onClear={() => {
                    setSelectedInvoice(null)
                    setInvoiceQuery('')
                    setAmount('')
                    setInvoiceOutstanding(0)
                  }}
                />
              ) : (
                <LinkField
                  label="Sales Order"
                  placeholder="Search by order ID, case no, admission or visit…"
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
            </>
          )}

          {paymentMode === 'advance' && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/80 p-3 text-xs text-blue-900">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Record a payment without an invoice. The full amount is saved as patient credit and
                can be applied to future bills.
              </span>
            </div>
          )}

          {paymentMode === 'multi' && effectivePatient && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600">
                Select invoices to pay
              </label>
              {multiLoading ? (
                <div className="text-xs text-slate-500 py-4 text-center">Loading invoices…</div>
              ) : multiInvoices.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center rounded-lg border border-dashed border-slate-300">
                  No outstanding invoices for this patient.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                  {multiInvoices.map((inv) => {
                    const selected = inv.name in multiSelected
                    const alloc = multiSelected[inv.name] ?? 0
                    return (
                      <label
                        key={inv.name}
                        className={`flex items-center gap-3 px-3 py-2 text-xs cursor-pointer hover:bg-slate-50 ${
                          selected ? 'bg-primary/5' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            toggleMultiInvoice(inv.name, inv.outstanding_amount || 0)
                          }
                          className="rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-800 truncate">{inv.name}</div>
                          <div className="text-slate-500">
                            Outstanding: {formatMoney(inv.outstanding_amount || 0)}
                          </div>
                        </div>
                        {selected && (
                          <input
                            type="number"
                            min={moneyInput.min}
                            step={moneyInput.step}
                            value={alloc}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0
                              setMultiSelected((prev) => ({ ...prev, [inv.name]: v }))
                            }}
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-right"
                          />
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
              {Object.keys(multiSelected).length > 0 && (
                <div className="text-xs text-slate-600">
                  Total allocated: <strong>{formatMoney(multiTotalAllocated)}</strong>
                </div>
              )}
            </div>
          )}

          {paymentMode === 'refund' && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Return excess patient credit. Available credit:{' '}
                <strong>{formatMoney(creditBalance)}</strong>
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              {paymentMode === 'refund' ? 'Refund amount' : 'Amount received'}{' '}
              <span className="text-red-500">*</span>
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
            {paymentMode === 'multi' && multiExcess > 0 && (
              <p className="mt-1.5 text-xs text-emerald-700">
                {formatMoney(multiExcess)} will be kept as patient credit for future invoices.
              </p>
            )}
            {overpayAmount > 0 && (
              <p className="mt-1.5 text-xs text-emerald-700">
                {formatMoney(overpayAmount)} exceeds the invoice outstanding and will be saved as
                patient credit.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Mode of Payment <span className="text-red-500">*</span>
            </label>
            <select
              value={modeOfPayment}
              onChange={(e) => setModeOfPayment(e.target.value)}
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
              disabled={submitDisabled}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading
                ? 'Processing…'
                : paymentMode === 'refund'
                  ? 'Process refund'
                  : 'Create payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
