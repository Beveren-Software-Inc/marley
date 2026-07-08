import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, RefreshCw, Package, ChevronDown, ChevronUp } from 'lucide-react'
import { BillingSpecialtyNavCards } from '../../components/billing/BillingSpecialtyNavCards'
import { InternalEmployeeInvoiceModal } from '../../components/billing/InternalEmployeeInvoiceModal'
import { SpecialtySalesInvoiceSlideOver } from '../../components/billing/SpecialtySalesInvoiceSlideOver'
import {
  fetchInternalEmployeeInvoices,
  fetchInternalEmployeeBillingSummary,
  fetchDispatchedEmployeeMedication,
  createInternalEmployeeInvoiceFromSalesOrder,
  cancelOrDeleteSalesInvoice,
  type SpecialtyInvoiceRow,
  type InternalBillingSummary,
  type DispatchedEmployeeMedicationRow,
} from '../../services/billingSpecialty'
import { PaymentModal } from '../../components/billing/PaymentModal'
import {
  canRecordPaymentAgainstSalesInvoice,
  isDraftSalesInvoice,
  isSubmittedSalesInvoice,
} from '../../utils/specialtyInvoiceActions'
import { toast } from '../../hooks/useToast'
import { PortalActionsMenu } from '../../components/ui/PortalActionsMenu'
import { PrintFormatDropdown } from '../../components/ui/PrintFormatDropdown'
import { useFormatMoney } from '../../hooks/useFormatMoney'

function getStatusColor(status: string): string {
  const s = status.toLowerCase()
  if (s === 'draft') return 'bg-gray-100 text-gray-600 border border-gray-200'
  if (s === 'unpaid' || s === 'overdue') return 'bg-red-100 text-red-700 border border-red-200'
  if (s === 'paid') return 'bg-green-100 text-green-700 border border-green-200'
  if (s === 'partially paid') return 'bg-yellow-100 text-yellow-700 border border-yellow-200'
  if (s === 'cancelled') return 'bg-gray-100 text-gray-500 border border-gray-200 line-through'
  if (s === 'return') return 'bg-orange-100 text-orange-700 border border-orange-200'
  if (s === 'credit note issued') return 'bg-purple-100 text-purple-700 border border-purple-200'
  return 'bg-slate-100 text-slate-700 border border-slate-200'
}

interface InternalEmployeeBillingPageProps {
  patient?: string
}

export function InternalEmployeeBillingPage({ patient }: InternalEmployeeBillingPageProps) {
  const formatMoney = useFormatMoney()
  const [rows, setRows] = useState<SpecialtyInvoiceRow[]>([])
  const [dispatched, setDispatched] = useState<DispatchedEmployeeMedicationRow[]>([])
  const [summary, setSummary] = useState<InternalBillingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [invoicingOrder, setInvoicingOrder] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [detailInvoice, setDetailInvoice] = useState<string | null>(null)
  const [paymentFor, setPaymentFor] = useState<SpecialtyInvoiceRow | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [dispatchedExpanded, setDispatchedExpanded] = useState(false)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  // Close action menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-portal-actions-menu]')) return
      if (el.closest('button[aria-label="Actions"]')) return
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [inv, sum, pending] = await Promise.all([
        fetchInternalEmployeeInvoices(),
        fetchInternalEmployeeBillingSummary(),
        fetchDispatchedEmployeeMedication(),
      ])
      setRows(inv)
      setSummary(sum)
      setDispatched(pending)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Handle any status change or action that requires refresh
  const handleAction = async (action: () => Promise<void>) => {
    setOpenActionRow(null)
    await action()
    await load()
  }

  const handleCreateInvoiceFromOrder = async (salesOrderName: string) => {
    setInvoicingOrder(salesOrderName)
    try {
      const created = await createInternalEmployeeInvoiceFromSalesOrder(salesOrderName)
      toast.success(`Invoice ${created.name} created from ${salesOrderName}`)
      setDetailInvoice(created.name)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create invoice')
    } finally {
      setInvoicingOrder(null)
    }
  }

  const cancelOrDiscardInvoice = async (name: string, mode: 'submitted' | 'draft') => {
    const ok =
      mode === 'draft'
        ? window.confirm('Delete this draft invoice? This cannot be undone.')
        : window.confirm(
            'Cancel this submitted invoice? ERPNext may reject this if payments or links exist.'
          )
    if (!ok) return
    setOpenActionRow(null)
    try {
      await cancelOrDeleteSalesInvoice(name)
      toast.success(mode === 'draft' ? 'Draft discarded' : 'Invoice cancelled')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    }
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <BillingSpecialtyNavCards active="internal" patient={patient} />

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Internal employee billing</h1>
          <p className="text-slate-600 text-xs mt-1 max-w-xl">
            Staff invoices flagged internal employee. Dispatched POS orders appear above; create invoices from the + button for ad-hoc billing.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
        <button
  type="button"
  onClick={() => void load()}
  disabled={loading}
  className="inline-flex items-center justify-center w-7 h-7 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
>
  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
</button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
          className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
          >
             +
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Invoices</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{summary.invoice_count}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total billed</p>
            <p className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">{formatMoney(summary.total_billed)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Outstanding</p>
            <p className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">{formatMoney(summary.total_outstanding)}</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50/40 shadow-sm mb-5 overflow-hidden">
        <button
          type="button"
          onClick={() => setDispatchedExpanded((open) => !open)}
          className={`w-full flex items-center justify-between gap-3 px-4 py-3 bg-amber-50 hover:bg-amber-100/60 transition-colors text-left ${
            dispatchedExpanded ? 'border-b border-amber-200/80' : ''
          }`}
          aria-expanded={dispatchedExpanded}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="rounded-lg p-2 bg-amber-100 text-amber-800 shrink-0">
              <Package className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">Dispatched medication</h2>
              <p className="text-xs text-slate-600 mt-0.5">
                POS employee dispenses (stock already delivered). Create an internal employee invoice for each order.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium text-amber-900 bg-amber-100 px-2 py-1 rounded-full">
              {dispatched.length} pending
            </span>
            {dispatchedExpanded ? (
              <ChevronUp className="w-4 h-4 text-amber-800" aria-hidden />
            ) : (
              <ChevronDown className="w-4 h-4 text-amber-800" aria-hidden />
            )}
          </div>
        </button>

        {dispatchedExpanded && (
          <>
            {loading && dispatched.length === 0 ? (
              <div className="flex justify-center py-8 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : dispatched.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs bg-white">
                No dispatched employee medication awaiting invoice.
              </div>
            ) : (
              <div className="overflow-x-auto bg-white">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Sales Order</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Date</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Employee</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Branch</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Delivery Note</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">Total</th>
                      <th className="text-center px-3 py-2 font-medium text-slate-600 w-[120px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dispatched.map((order) => (
                      <tr key={order.name} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-800">{order.name}</td>
                        <td className="px-3 py-2 text-slate-700">{order.transaction_date}</td>
                        <td className="px-3 py-2 text-slate-800">
                          <div>{order.employee_name || order.customer_name || order.customer}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{order.customer}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {order.collection_cost_center_name || order.cost_center || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-700">{order.delivery_note || '—'}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatMoney(order.grand_total)}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => void handleCreateInvoiceFromOrder(order.name)}
                            disabled={invoicingOrder === order.name}
                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50"
                          >
                            {invoicingOrder === order.name ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : null}
                            Create invoice
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-12 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">NO INTERNAL EMPLOYEE INVOICES YET.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Invoice</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Date</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Employee</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Collection Branch</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Total</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Outstanding</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Status</th>
                  <th className="text-center px-3 py-2 font-medium text-slate-600 w-[100px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.name} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setDetailInvoice(r.name)}
                        className="font-mono text-[11px] text-primary font-medium hover:underline text-left"
                      >
                        {r.name}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{r.posting_date}</td>
                    <td className="px-3 py-2 text-slate-800">{r.customer_name || r.customer}</td>
                    <td className="px-3 py-2 text-slate-700">{r.collection_cost_center_name || r.custom_created_at || '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatMoney(r.grand_total)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(r.outstanding_amount)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-[11px] font-medium ${getStatusColor(r.status)}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <div className="flex items-center gap-2 justify-center">
                        {/* Printer Icon - separate */}
                        <PrintFormatDropdown 
                          doctype="Sales Invoice" 
                          docName={r.name} 
                          noLetterhead={0} 
                          triggerPrint={1}
                          className="inline-flex items-center justify-center w-7 h-7 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                        />
                        
                        {/* Actions Menu Button (three dots) */}
                        <div className="relative inline-block" ref={openActionRow === r.name ? actionMenuRef : undefined}>
                          <button
                            type="button"
                            onClick={() => setOpenActionRow((prev) => prev === r.name ? null : r.name)}
                            className="inline-flex items-center justify-center w-7 h-7 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                            aria-label="Actions"
                          >
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>
                          
                          <PortalActionsMenu 
                            open={openActionRow === r.name} 
                            onClose={() => setOpenActionRow(null)} 
                            triggerRef={actionMenuRef} 
                            minWidth={160}
                          >
                            <button
                              type="button"
                              onClick={() => handleAction(async () => {
                                setDetailInvoice(r.name)
                              })}
                              className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              View Details
                            </button>
                            
                            {r.docstatus === 0 && (
                              <button
                                type="button"
                                onClick={() => handleAction(async () => {
                                  // Handle edit action
                                  toast.info('Edit functionality to be implemented')
                                })}
                                className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Edit
                              </button>
                            )}
                            
                            {canRecordPaymentAgainstSalesInvoice(r) && (
                              <>
                                <div className="border-t border-slate-100 my-1" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionRow(null)
                                    setPaymentFor(r)
                                  }}
                                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-green-700 font-medium hover:bg-green-50"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  Record Payment
                                </button>
                              </>
                            )}
                            {isDraftSalesInvoice(r.docstatus) && (
                              <>
                                <div className="border-t border-slate-100 my-1" />
                                <button
                                  type="button"
                                  onClick={() => void cancelOrDiscardInvoice(r.name, 'draft')}
                                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-red-600 font-medium hover:bg-red-50"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                  Discard draft
                                </button>
                              </>
                            )}
                            {isSubmittedSalesInvoice(r.docstatus) && (
                              <>
                                <div className="border-t border-slate-100 my-1" />
                                <button
                                  type="button"
                                  onClick={() => void cancelOrDiscardInvoice(r.name, 'submitted')}
                                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-red-600 font-medium hover:bg-red-50"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                  Cancel invoice
                                </button>
                              </>
                            )}
                            
                            {r.status === 'Paid' && (
                              <>
                                <div className="border-t border-slate-100 my-1" />
                                <button
                                  type="button"
                                  onClick={() => handleAction(async () => {
                                    // Handle credit note
                                    toast.info('Credit Note functionality to be implemented')
                                  })}
                                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-purple-700 font-medium hover:bg-purple-50"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  Create Credit Note
                                </button>
                              </>
                            )}
                          </PortalActionsMenu>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InternalEmployeeInvoiceModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => void load()}
      />

      <SpecialtySalesInvoiceSlideOver
        invoiceName={detailInvoice}
        onClose={() => setDetailInvoice(null)}
        onUpdated={() => void load()}
        partyLabel="Employee"
      />

      <PaymentModal
        isOpen={!!paymentFor}
        onClose={() => setPaymentFor(null)}
        invoiceName={paymentFor?.name || ''}
        customerName={paymentFor?.customer_name || paymentFor?.customer || ''}
        partyLabel="Employee"
        outstandingAmount={paymentFor?.outstanding_amount ?? 0}
        defaultCompany={paymentFor?.company}
        defaultCostCenter={paymentFor?.custom_created_at || undefined}
        onPaymentSuccess={() => {
          setPaymentFor(null)
          void load()
        }}
      />
    </div>
  )
}