// components/billing/InvoiceItemsModal.tsx
import { useState, useEffect } from 'react'
import { X, Package, TrendingUp, Receipt, Loader2 } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import { getInvoiceDetails, type InvoiceDetails } from '../../services/serviceOrders'

interface InvoiceItemsModalProps {
  isOpen: boolean
  onClose: () => void
  invoiceName: string
  onMakePayment?: (invoiceName: string) => void
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount)
}

export const InvoiceItemsModal = ({ isOpen, onClose, invoiceName, onMakePayment }: InvoiceItemsModalProps) => {
  const [invoiceDetails, setInvoiceDetails] = useState<InvoiceDetails | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && invoiceName) {
      loadInvoiceDetails()
    }
  }, [isOpen, invoiceName])

  const loadInvoiceDetails = async () => {
    try {
      setLoading(true)
      const details = await getInvoiceDetails(invoiceName)
      setInvoiceDetails(details)
    } catch (error) {
      console.error('Error loading invoice details:', error)
      toast.error('Failed to load invoice details')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Paid': return 'text-green-600 bg-green-50'
      case 'Unpaid': return 'text-yellow-600 bg-yellow-50'
      case 'Overdue': return 'text-red-600 bg-red-50'
      case 'Partially Paid': return 'text-blue-600 bg-blue-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />
      
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl transform transition-transform duration-300 ease-in-out">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <Receipt className="w-6 h-6 text-primary" />
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Invoice Details</h2>
                <p className="text-sm text-slate-500 mt-1">{invoiceName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
                  <p className="text-slate-500">Loading invoice details...</p>
                </div>
              </div>
            ) : invoiceDetails ? (
              <div className="space-y-6">
                {/* Invoice Summary */}
                <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500">Customer</p>
                      <p className="text-sm font-medium text-slate-900">{invoiceDetails.customer_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Posting Date</p>
                      <p className="text-sm text-slate-700">{invoiceDetails.posting_date}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Due Date</p>
                      <p className="text-sm text-slate-700">{invoiceDetails.due_date}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Cost Center</p>
                      <p className="text-sm text-slate-700">{invoiceDetails.cost_center || '-'}</p>
                    </div>
                  </div>
                  
                  <div className="pt-3 border-t border-slate-200">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-600">Status</span>
                      <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(invoiceDetails.status)}`}>
                        {invoiceDetails.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Total Amount</span>
                      <span className="text-lg font-bold text-slate-900">{formatCurrency(invoiceDetails.grand_total)}</span>
                    </div>
                    {invoiceDetails.outstanding_amount > 0 && (
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-sm text-red-600">Outstanding</span>
                        <span className="text-md font-semibold text-red-600">{formatCurrency(invoiceDetails.outstanding_amount)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Items List */}
                <div>
                  <h3 className="text-md font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" />
                    Services Rendered
                  </h3>
                  
                  <div className="space-y-2">
                    {invoiceDetails.items.map((item, idx) => (
                      <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3 hover:shadow-sm transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900">{item.item_name}</p>
                            {item.description && (
                              <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                            )}
                            <p className="text-xs text-slate-400 mt-1">Code: {item.item_code}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-slate-900">{formatCurrency(item.net_amount || item.amount)}</p>
                            <p className="text-xs text-slate-500">Qty: {item.qty} × {formatCurrency(item.rate)}</p>
                          </div>
                        </div>
                        {item.discount_amount && item.discount_amount > 0 && (
                          <div className="text-xs text-green-600 mt-1">
                            Discount: {formatCurrency(item.discount_amount)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Receipt className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-30" />
                <p className="text-slate-500">Failed to load invoice details</p>
                <button
                  onClick={loadInvoiceDetails}
                  className="mt-4 text-primary hover:underline text-sm"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          {invoiceDetails && invoiceDetails.outstanding_amount > 0 && onMakePayment && (
            <div className="p-6 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => onMakePayment(invoiceName)}
                className="w-full bg-primary text-white py-2.5 rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <TrendingUp className="w-4 h-4" />
                Make Payment (Outstanding: {formatCurrency(invoiceDetails.outstanding_amount)})
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}