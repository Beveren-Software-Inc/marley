
import { createCreditNote } from '../../services/serviceOrders'


import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { BillingSpecialtyNavCards } from '../../components/billing/BillingSpecialtyNavCards'
import { AdditionalCollectionInvoiceModal } from '../../components/billing/AdditionalCollectionInvoiceModal'
import { SpecialtySalesInvoiceSlideOver } from '../../components/billing/SpecialtySalesInvoiceSlideOver'
import {
  fetchAdditionalCollectionInvoices,
  cancelOrDeleteSalesInvoice,
  type SpecialtyInvoiceRow,
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
  const statusLower = status.toLowerCase()

  if (statusLower === 'draft') {
    return 'bg-gray-100 text-gray-600 border border-gray-200'
  }
  if (statusLower === 'unpaid' || statusLower === 'overdue') {
    return 'bg-red-100 text-red-700 border border-red-200'
  }
  if (statusLower === 'paid') {
    return 'bg-green-100 text-green-700 border border-green-200'
  }
  if (statusLower === 'partially paid') {
    return 'bg-yellow-100 text-yellow-700 border border-yellow-200'
  }
  if (statusLower === 'cancelled') {
    return 'bg-gray-100 text-gray-500 border border-gray-200 line-through'
  }
  if (statusLower === 'return') {
    return 'bg-orange-100 text-orange-700 border border-orange-200'
  }
  if (statusLower === 'credit note issued') {
    return 'bg-purple-100 text-purple-700 border border-purple-200'
  }
  return 'bg-slate-100 text-slate-700 border border-slate-200'
}

interface AdditionalCollectionBillingPageProps {
  patient?: string
}

export function AdditionalCollectionBillingPage({ patient }: AdditionalCollectionBillingPageProps) {
  const formatMoney = useFormatMoney()
  const [rows, setRows] = useState<SpecialtyInvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [detailInvoice, setDetailInvoice] = useState<string | null>(null)
  const [paymentFor, setPaymentFor] = useState<SpecialtyInvoiceRow | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
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
      const data = await fetchAdditionalCollectionInvoices()
      setRows(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load invoices')
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
      <BillingSpecialtyNavCards active="additional" patient={patient} />

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Cross‑Branch Payment invoices</h1>
          <p className="text-slate-600 text-xs mt-1 max-w-xl">
            Invoices with a collection branch (excludes internal employee). Use the button to create.
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-12 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">NO CROSS‑BRANCH PAYMENT INVOICES YET.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Invoice</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Date</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Customer</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Collection Branch</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Reference</th>
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
                    <td
                      className="px-3 py-2 text-[11px] text-slate-600 max-w-[160px] truncate"
                      title={`${r.custom_reference_type || ''} ${r.custom_reference_name || ''}`}
                    >
                      {r.custom_reference_name ? `${r.custom_reference_type || ''} ${r.custom_reference_name}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{formatMoney(r.grand_total)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(r.outstanding_amount)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                     
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-[11px] font-medium ${getStatusColor(r.status)}`}
                        >
                          {r.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <div className="flex items-center gap-2 justify-center">
                        {/* Printer Icon - separate, just like in lab test */}
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
                            
                            {/* Edit removed: was a non-functional stub. Edit drafts from Desk. */}

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
                                    const reason = window.prompt('Reason for credit note (recorded for audit):')?.trim()
                                    if (!reason) return
                                    const res = await createCreditNote(r.name, reason)
                                    toast.success(`Credit note ${res.credit_note} created`)
                                    await load()
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

      <AdditionalCollectionInvoiceModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => void load()}
        initialPatient={patient}
      />

      <SpecialtySalesInvoiceSlideOver
        invoiceName={detailInvoice}
        onClose={() => setDetailInvoice(null)}
        onUpdated={() => void load()}
      />

      <PaymentModal
        isOpen={!!paymentFor}
        onClose={() => setPaymentFor(null)}
        invoiceName={paymentFor?.name || ''}
        customerName={paymentFor?.customer_name || paymentFor?.customer || ''}
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