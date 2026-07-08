// components/billing/ServiceOrdersList.tsx
import { useState, useEffect } from 'react'
import {
  fetchServiceOrders,
  fetchServiceOrderSummary,
  type ServiceOrder,
  type OrderSummary,
} from '../../services/serviceOrders'
import { BulkInvoiceModal, isBillableServiceOrder } from './BulkInvoiceModal'
import { getServiceOrderBillableTotal } from '../../services/serviceOrders'
import { ServiceOrderServiceCell } from './ServiceOrderServiceCell'
import { useCareContext } from '../../providers/CareContextProvider'
import { RefreshCw, FileText, AlertCircle, CheckCircle, Clock, Package } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import { useFormatMoney } from '../../hooks/useFormatMoney'

interface ServiceOrdersListProps {
  patient?: string
  admission?: string
  visit?: string
  fromDate?: string
  toDate?: string
  onViewOrder?: (order: ServiceOrder) => void
  limit?: number  // Keep for future use
}

export const ServiceOrdersList = ({ patient, admission, visit, fromDate, toDate, onViewOrder }: ServiceOrdersListProps) => {
  const { mode, activeAdmission, activeVisit } = useCareContext()
  const formatCurrency = useFormatMoney()
  const [orders, setOrders] = useState<ServiceOrder[]>([])
  const [summary, setSummary] = useState<OrderSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showBulkInvoiceModal, setShowBulkInvoiceModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [caseSearch, setCaseSearch] = useState('')
  const [debouncedCaseSearch, setDebouncedCaseSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCaseSearch(caseSearch.trim()), 300)
    return () => clearTimeout(t)
  }, [caseSearch])

  const effectivePatient = (() => {
    const trimmed = patient?.trim()
    return trimmed || undefined
  })()
  const rawReferenceName =
    mode === 'IP'
      ? (admission?.trim() || activeAdmission)
      : (visit?.trim() || activeVisit)
  const scopedReferenceName = effectivePatient ? rawReferenceName || undefined : undefined
  const scopedReferenceType = scopedReferenceName
    ? mode === 'IP'
      ? 'Inpatient Admission'
      : 'Patient Visit'
    : undefined
  const hasCaseSearch = Boolean(debouncedCaseSearch)

  const loadData = async (isStale?: () => boolean) => {
    if (!effectivePatient && !scopedReferenceName && !hasCaseSearch) {
      if (isStale?.()) return
      setOrders([])
      setSummary(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const [ordersData, summaryData] = await Promise.all([
        fetchServiceOrders(
          hasCaseSearch ? undefined : scopedReferenceType,
          hasCaseSearch ? undefined : scopedReferenceName,
          effectivePatient,
          statusFilter,
          fromDate,
          toDate,
          debouncedCaseSearch || undefined
        ),
        fetchServiceOrderSummary(
          hasCaseSearch ? undefined : scopedReferenceType,
          hasCaseSearch ? undefined : scopedReferenceName,
          effectivePatient,
          fromDate,
          toDate,
          debouncedCaseSearch || undefined
        ),
      ])
      if (isStale?.()) return
      setOrders(ordersData)
      setSummary(summaryData)
    } catch (error) {
      if (isStale?.()) return
      console.error('Failed to load service orders:', error)
      toast.error('Failed to load service orders')
    } finally {
      if (isStale?.()) return
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void loadData(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [effectivePatient, scopedReferenceName, statusFilter, fromDate, toDate, debouncedCaseSearch, hasCaseSearch, scopedReferenceType])

  const billableOrders = orders.filter(isBillableServiceOrder)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Draft': return 'bg-gray-100 text-gray-700'
      case 'To Bill': return 'bg-blue-100 text-blue-700'
      case 'Completed': return 'bg-green-100 text-green-700'
      case 'Cancelled': return 'bg-red-100 text-red-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const getInvoiceStatusBadge = (order: ServiceOrder) => {
    if (order.invoice_status === 'Paid') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700"><CheckCircle className="w-3 h-3" /> Paid</span>
    } else if (order.invoice_status === 'Unpaid' || order.invoice_status === 'Overdue') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700"><AlertCircle className="w-3 h-3" /> Invoice Created</span>
    } else if (order.invoice_name) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700"><FileText className="w-3 h-3" /> Invoiced</span>
    } else {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700"><Clock className="w-3 h-3" /> Pending</span>
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">Loading service orders...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-sm text-slate-500">Total Orders</div>
            <div className="text-2xl font-bold text-slate-900">{summary.total_orders}</div>
            <div className="text-sm text-slate-600">{formatCurrency(summary.total_amount)}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-sm text-slate-500">Not Invoiced</div>
            <div className="text-2xl font-bold text-yellow-600">{summary.not_invoiced.count}</div>
            <div className="text-sm text-slate-600">{formatCurrency(summary.not_invoiced.amount)}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-sm text-slate-500">Invoiced (Paid)</div>
            <div className="text-2xl font-bold text-green-600">{summary.invoiced.count}</div>
            <div className="text-sm text-slate-600">{formatCurrency(summary.invoiced.amount)}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-sm text-slate-500">Partially Invoiced</div>
            <div className="text-2xl font-bold text-orange-600">{summary.partially_invoiced.count}</div>
            <div className="text-sm text-slate-600">{formatCurrency(summary.partially_invoiced.amount)}</div>
          </div>
        </div>
      )}

      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Service Orders</h3>
          <input
            type="search"
            value={caseSearch}
            onChange={(e) => setCaseSearch(e.target.value)}
            placeholder="Case no, sales order, admission or visit…"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm w-64 min-w-[12rem]"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select All</option>
            <option value="Draft">Draft</option>
            <option value="To Bill">To Bill</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void loadData()}
            className="p-2 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {billableOrders.length > 0 && (
            <button
              type="button"
              onClick={() => setShowBulkInvoiceModal(true)}
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 text-sm font-medium"
            >
              Create Bulk Invoice
            </button>
          )}
        </div>
      </div>

      {/* Orders Table */}
      {orders.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400">
          <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>No service orders found</p>
          {!effectivePatient && !scopedReferenceName && !hasCaseSearch && (
            <p className="text-xs mt-2">Select a patient or search by IP/OP case no or sales order ID.</p>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Order ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase min-w-[200px]">
                    Service / type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Branch</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Invoice Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {orders.map((order) => (
                  <tr key={order.name} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-primary">{order.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{order.transaction_date}</td>
                    <td className="px-4 py-3 align-top">
                      <ServiceOrderServiceCell order={order} />
                      <p className="text-[10px] text-slate-400 mt-1">
                        {order.custom_reference_type}: {order.custom_reference_name}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                      <div>{formatCurrency(getServiceOrderBillableTotal(order))}</div>
                      {order.has_dispense_returns && (order.returned_amount ?? 0) > 0 ? (
                        <div className="text-[10px] font-normal text-purple-700">
                          Returned {formatCurrency(order.returned_amount ?? 0)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 max-w-[200px]">
                      <span className="truncate block" title={order.cost_center_name || order.cost_center || undefined}>
                        {order.cost_center_name || order.cost_center || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {getInvoiceStatusBadge(order)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onViewOrder?.(order)}
                        className="text-primary hover:underline text-sm"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showBulkInvoiceModal && (
        <BulkInvoiceModal
          orders={orders}
          patient={effectivePatient}
          referenceType={scopedReferenceType}
          referenceName={scopedReferenceName}
          onClose={() => setShowBulkInvoiceModal(false)}
          onSuccess={() => {
            setShowBulkInvoiceModal(false)
            loadData()
          }}
        />
      )}
    </div>
  )
}