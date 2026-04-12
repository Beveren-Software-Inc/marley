// components/billing/InvoiceList.tsx
import { useState, useEffect } from 'react'
import { fetchInvoicesByReference, type ServiceInvoice } from '../../services/serviceOrders'
import { useCareContext } from '../../providers/CareContextProvider'
import { RefreshCw, FileText, Eye, Printer } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'

interface InvoiceListProps {
  referenceType: 'Inpatient Admission' | 'Patient Visit'
  referenceName: string
  patient?: string
  title?: string
  showPrintButton?: boolean
  onViewInvoice?: (invoice: ServiceInvoice) => void
}

export const InvoiceList = ({ 
  referenceType, 
  referenceName, 
  patient,
  title = 'Invoices',
  showPrintButton = true,
  onViewInvoice 
}: InvoiceListProps) => {
  const [invoices, setInvoices] = useState<ServiceInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null)

  const loadInvoices = async () => {
    if (!referenceName && !patient) {
      setInvoices([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const data = await fetchInvoicesByReference(referenceType, referenceName, patient)
      setInvoices(data)
    } catch (error) {
      console.error('Failed to load invoices:', error)
      toast.error('Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInvoices()
  }, [referenceType, referenceName, patient])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount || 0)
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

  if (invoices.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400">
        <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
        <p>No invoices found</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        <button
          onClick={loadInvoices}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        {invoices.map((invoice) => (
          <div key={invoice.name} className="border border-slate-200 rounded-lg overflow-hidden">
            {/* Invoice Header */}
            <div 
              className="px-4 py-3 bg-slate-50 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
              onClick={() => setExpandedInvoice(expandedInvoice === invoice.name ? null : invoice.name)}
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-sm font-medium text-primary">{invoice.name}</p>
                  <p className="text-xs text-slate-500">{invoice.posting_date}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">{formatCurrency(invoice.grand_total)}</p>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(invoice.status)}`}>
                    {invoice.status}
                  </span>
                </div>
                <div className="text-slate-400">
                  <svg className={`w-4 h-4 transition-transform ${expandedInvoice === invoice.name ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Expanded Details */}
            {expandedInvoice === invoice.name && (
              <div className="px-4 py-3 border-t border-slate-200 bg-white">
                <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Due Date</p>
                    <p className="text-slate-700">{invoice.due_date || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Paid Amount</p>
                    <p className="text-green-600 font-medium">{formatCurrency(invoice.paid_amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Outstanding</p>
                    <p className="text-red-600 font-medium">{formatCurrency(invoice.outstanding_amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Orders Count</p>
                    <p className="text-slate-700">{invoice.order_count || 0}</p>
                  </div>
                </div>
                
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  {onViewInvoice && (
                    <button
                      onClick={() => onViewInvoice(invoice)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-md hover:bg-primary/20 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Details
                    </button>
                  )}
                  {showPrintButton && (
                    <PrintFormatDropdown
                      doctype="Sales Invoice"
                      docName={invoice.name}
                      noLetterhead={0}
                      triggerPrint={1}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}