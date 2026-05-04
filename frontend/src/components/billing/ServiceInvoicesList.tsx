// components/billing/ServiceInvoicesList.tsx
import { useState, useEffect, useRef } from 'react'
import {
  fetchServiceInvoices,
  fetchInvoiceSummary,
  type ServiceInvoice,
  type InvoiceSummary,
} from '../../services/serviceOrders'
import { useCareContext } from '../../providers/CareContextProvider'
import { RefreshCw, FileText } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import { useFormatMoney } from '../../hooks/useFormatMoney'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { PaymentModal } from './PaymentModal'
import { cancelOrDeleteSalesInvoice } from '../../services/billingSpecialty'
import {
  canRecordPaymentAgainstSalesInvoice,
  canCancelSubmittedSalesInvoiceRow,
  isDraftSalesInvoice,
} from '../../utils/specialtyInvoiceActions'

interface ServiceInvoicesListProps {
  patient?: string
  admission?: string
  visit?: string
  statusFilter?: string
  /** Open Sales Invoice detail slide-over (same as specialty billing). */
  onOpenInvoiceDetail: (invoiceName: string) => void
  /** Increment from parent to refetch after mutations elsewhere. */
  invoiceRefreshKey?: number
  /** After payment / cancel from this list. */
  onAfterInvoiceMutation?: () => void
}

export const ServiceInvoicesList = ({
  patient,
  admission,
  visit,
  statusFilter: propStatusFilter,
  onOpenInvoiceDetail,
  invoiceRefreshKey = 0,
  onAfterInvoiceMutation,
}: ServiceInvoicesListProps) => {
  const { mode, activeAdmission, activeVisit, selectedPatient } = useCareContext()
  const formatCurrency = useFormatMoney()
  const [invoices, setInvoices] = useState<ServiceInvoice[]>([])
  const [summary, setSummary] = useState<InvoiceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>(propStatusFilter || '')
  const [paymentFor, setPaymentFor] = useState<ServiceInvoice | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (propStatusFilter !== undefined) {
      setStatusFilter(propStatusFilter)
    }
  }, [propStatusFilter])

  const effectivePatient = patient ?? selectedPatient
  const effectiveReferenceType = mode === 'IP' ? 'Inpatient Admission' : 'Patient Visit'
  const effectiveReferenceName = mode === 'IP' ? (admission ?? activeAdmission) : (visit ?? activeVisit)

  const loadData = async () => {
    if (!effectivePatient && !effectiveReferenceName) {
      setInvoices([])
      setSummary(null)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const [invoicesData, summaryData] = await Promise.all([
        fetchServiceInvoices(effectiveReferenceType, effectiveReferenceName, effectivePatient, statusFilter),
        fetchInvoiceSummary(effectiveReferenceType, effectiveReferenceName, effectivePatient),
      ])
      setInvoices(invoicesData)
      setSummary(summaryData)
    } catch (error) {
      console.error('Failed to load service invoices:', error)
      toast.error('Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [effectivePatient, effectiveReferenceName, statusFilter, invoiceRefreshKey])

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

  const cancelOrDiscardInvoice = async (inv: ServiceInvoice, mode: 'submitted' | 'draft') => {
    const ok =
      mode === 'draft'
        ? window.confirm('Delete this draft invoice? This cannot be undone.')
        : window.confirm(
            'Cancel this submitted invoice? ERPNext may reject this if payments or links exist.'
          )
    if (!ok) return
    setOpenActionRow(null)
    try {
      await cancelOrDeleteSalesInvoice(inv.name)
      toast.success(mode === 'draft' ? 'Draft discarded' : 'Invoice cancelled')
      await loadData()
      onAfterInvoiceMutation?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Paid':
        return 'bg-green-100 text-green-700'
      case 'Unpaid':
        return 'bg-yellow-100 text-yellow-700'
      case 'Overdue':
        return 'bg-red-100 text-red-700'
      case 'Partially Paid':
        return 'bg-blue-100 text-blue-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">Loading invoices...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-sm text-slate-500">Total Invoices</div>
            <div className="text-2xl font-bold text-slate-900">{summary.total_invoices}</div>
            <div className="text-sm text-slate-600">{formatCurrency(summary.total_amount)}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-sm text-slate-500">Paid</div>
            <div className="text-2xl font-bold text-green-600">{summary.paid.count}</div>
            <div className="text-sm text-slate-600">{formatCurrency(summary.paid.amount)}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-sm text-slate-500">Unpaid/Overdue</div>
            <div className="text-2xl font-bold text-red-600">{summary.unpaid.count + summary.overdue.count}</div>
            <div className="text-sm text-slate-600">
              {formatCurrency(summary.unpaid.amount + summary.overdue.amount)}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-sm text-slate-500">Partially Paid</div>
            <div className="text-2xl font-bold text-blue-600">{summary.partially_paid.count}</div>
            <div className="text-sm text-slate-600">{formatCurrency(summary.partially_paid.amount)}</div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Service Invoices</h3>
          {!propStatusFilter && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="">All Status</option>
              <option value="Paid">Paid</option>
              <option value="Unpaid">Unpaid</option>
              <option value="Overdue">Overdue</option>
              <option value="Partially Paid">Partially Paid</option>
            </select>
          )}
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="p-2 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {invoices.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400">
          <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>No invoices found</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Invoice ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Cost center</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Orders</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Paid</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Outstanding</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase w-[120px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {invoices.map((invoice) => (
                  <tr key={invoice.name} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onOpenInvoiceDetail(invoice.name)}
                        className="font-mono text-[11px] text-primary font-medium hover:underline text-left"
                      >
                        {invoice.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{invoice.posting_date}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{invoice.due_date}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 max-w-[200px]">
                      <span
                        className="truncate block"
                        title={
                          invoice.cost_center_name ||
                          invoice.cost_center ||
                          invoice.custom_created_at ||
                          undefined
                        }
                      >
                        {invoice.cost_center_name || invoice.cost_center || invoice.custom_created_at || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{invoice.order_count || 0}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{formatCurrency(invoice.grand_total)}</td>
                    <td className="px-4 py-3 text-sm text-green-600">{formatCurrency(invoice.paid_amount)}</td>
                    <td className="px-4 py-3 text-sm text-red-600">{formatCurrency(invoice.outstanding_amount)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(invoice.status)}`}
                      >
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <div className="flex items-center gap-2 justify-center">
                        <PrintFormatDropdown
                          doctype="Sales Invoice"
                          docName={invoice.name}
                          noLetterhead={0}
                          triggerPrint={1}
                          className="inline-flex items-center justify-center w-7 h-7 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                        />
                        <div
                          className="relative inline-block"
                          ref={openActionRow === invoice.name ? actionMenuRef : undefined}
                        >
                          <button
                            type="button"
                            onClick={() => setOpenActionRow((prev) => (prev === invoice.name ? null : invoice.name))}
                            className="inline-flex items-center justify-center w-7 h-7 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                            aria-label="Actions"
                          >
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>
                          <PortalActionsMenu
                            open={openActionRow === invoice.name}
                            onClose={() => setOpenActionRow(null)}
                            triggerRef={actionMenuRef}
                            minWidth={180}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionRow(null)
                                onOpenInvoiceDetail(invoice.name)
                              }}
                              className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              View details
                            </button>
                            {isDraftSalesInvoice(invoice.docstatus) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionRow(null)
                                  toast.info('Edit the draft in Desk or discard below.')
                                }}
                                className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                              >
                                Edit
                              </button>
                            )}
                            {canRecordPaymentAgainstSalesInvoice(invoice) && (
                              <>
                                <div className="border-t border-slate-100 my-1" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionRow(null)
                                    setPaymentFor(invoice)
                                  }}
                                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-green-700 font-medium hover:bg-green-50"
                                >
                                  Record payment
                                </button>
                              </>
                            )}
                            {isDraftSalesInvoice(invoice.docstatus) && (
                              <>
                                <div className="border-t border-slate-100 my-1" />
                                <button
                                  type="button"
                                  onClick={() => void cancelOrDiscardInvoice(invoice, 'draft')}
                                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-red-600 font-medium hover:bg-red-50"
                                >
                                  Discard draft
                                </button>
                              </>
                            )}
                            {canCancelSubmittedSalesInvoiceRow(invoice.docstatus) && (
                              <>
                                <div className="border-t border-slate-100 my-1" />
                                <button
                                  type="button"
                                  onClick={() => void cancelOrDiscardInvoice(invoice, 'submitted')}
                                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-red-600 font-medium hover:bg-red-50"
                                >
                                  Cancel invoice
                                </button>
                              </>
                            )}
                            {invoice.status === 'Paid' && (
                              <>
                                <div className="border-t border-slate-100 my-1" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionRow(null)
                                    toast.info('Create credit note from Desk if required.')
                                  }}
                                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-purple-700 font-medium hover:bg-purple-50"
                                >
                                  Create credit note
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
        </div>
      )}

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
          void loadData()
          onAfterInvoiceMutation?.()
        }}
      />
    </div>
  )
}
