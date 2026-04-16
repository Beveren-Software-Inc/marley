// components/billing/ServiceInvoicesList.tsx
import { useState, useEffect } from 'react'
import { fetchServiceInvoices, fetchInvoiceSummary, type ServiceInvoice, type InvoiceSummary } from '../../services/serviceOrders'
import { useCareContext } from '../../providers/CareContextProvider'
import { RefreshCw, FileText, Eye } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'

interface ServiceInvoicesListProps {
  patient?: string
  admission?: string
  visit?: string
  onViewInvoice?: (invoice: ServiceInvoice) => void
  statusFilter?: string  // Add this prop
}

export const ServiceInvoicesList = ({ 
  patient, 
  admission, 
  visit, 
  onViewInvoice,
  statusFilter: propStatusFilter  // Rename to avoid conflict
}: ServiceInvoicesListProps) => {
  const { mode, activeAdmission, activeVisit, selectedPatient } = useCareContext()
  const [invoices, setInvoices] = useState<ServiceInvoice[]>([])
  const [summary, setSummary] = useState<InvoiceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>(propStatusFilter || '')

  // Update local filter when prop changes
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
console.log("Hapa nafika")
    try {
      setLoading(true)
      const [invoicesData, summaryData] = await Promise.all([
        fetchServiceInvoices(effectiveReferenceType, effectiveReferenceName, effectivePatient, statusFilter),
        fetchInvoiceSummary(effectiveReferenceType, effectiveReferenceName, effectivePatient)
      ])
      setInvoices(invoicesData)
      setSummary(summaryData)
    } catch (error) {
      console.error('Failed to load invoices:', error)
      toast.error('Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [effectivePatient, effectiveReferenceName, statusFilter])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Paid': return 'bg-green-100 text-green-700'
      case 'Unpaid': return 'bg-yellow-100 text-yellow-700'
      case 'Overdue': return 'bg-red-100 text-red-700'
      case 'Partially Paid': return 'bg-blue-100 text-blue-700'
      default: return 'bg-gray-100 text-gray-700'
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
      {/* Summary Cards */}
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
            <div className="text-sm text-slate-600">{formatCurrency(summary.unpaid.amount + summary.overdue.amount)}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-sm text-slate-500">Partially Paid</div>
            <div className="text-2xl font-bold text-blue-600">{summary.partially_paid.count}</div>
            <div className="text-sm text-slate-600">{formatCurrency(summary.partially_paid.amount)}</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Service Invoices</h3>
          {!propStatusFilter && ( // Only show filter dropdown if not in filtered mode
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
          onClick={loadData}
          className="p-2 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Invoices Table */}
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Orders</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Paid</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Outstanding</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[100px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {invoices.map((invoice) => (
                  <tr key={invoice.name} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-primary">{invoice.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{invoice.posting_date}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{invoice.due_date}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{invoice.order_count || 0}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{formatCurrency(invoice.grand_total)}</td>
                    <td className="px-4 py-3 text-sm text-green-600">{formatCurrency(invoice.paid_amount)}</td>
                    <td className="px-4 py-3 text-sm text-red-600">{formatCurrency(invoice.outstanding_amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(invoice.status)}`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onViewInvoice?.(invoice)}
                          className="p-1 text-slate-500 hover:text-primary transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <PrintFormatDropdown
                          doctype="Sales Invoice"
                          docName={invoice.name}
                          noLetterhead={0}
                          triggerPrint={1}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}