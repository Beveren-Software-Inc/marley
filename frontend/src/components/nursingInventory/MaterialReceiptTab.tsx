// tabs/MaterialReceiptTab.tsx
import { useState, useEffect } from 'react'
import { useCareContext } from '../../providers/CareContextProvider'
import { createMaterialReceipt, fetchInventoryItems, type MaterialReceipt } from '../../services/nursingInventory'
import { toast } from '../../hooks/useToast'
import { Plus, Trash2, Save, Eye, Upload, Package, DollarSign, Calendar } from 'lucide-react'

interface MaterialReceiptTabProps {
  onSuccess: () => void
}

interface ReceiptItem {
  item_code: string
  item_name: string
  quantity: number
  unit_price: number
  total_price: number
  batch_number?: string
  expiry_date?: string
}

export const MaterialReceiptTab = ({ onSuccess }: MaterialReceiptTabProps) => {
  const { userCostCenter, user } = useCareContext()
  const [receipts, setReceipts] = useState<MaterialReceipt[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedReceipt, setSelectedReceipt] = useState<MaterialReceipt | null>(null)
  
  // Form state
  const [supplier, setSupplier] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [items, setItems] = useState<ReceiptItem[]>([
    { item_code: '', item_name: '', quantity: 1, unit_price: 0, total_price: 0 }
  ])
  const [itemSearch, setItemSearch] = useState<{ [key: number]: string }>({})
  const [itemOptions, setItemOptions] = useState<{ [key: number]: any[] }>({})

  useEffect(() => {
    if (userCostCenter) {
      loadReceipts()
    }
  }, [userCostCenter])

  const loadReceipts = async () => {
    if (!userCostCenter) return
    setLoading(true)
    try {
      const response = await fetch(`/api/method/healthcare.api.nursing_inventory.get_material_receipts?cost_center=${encodeURIComponent(userCostCenter)}`)
      const data = await response.json()
      setReceipts(data.message || [])
    } catch (error) {
      console.error('Failed to load receipts:', error)
    } finally {
      setLoading(false)
    }
  }

  const searchItems = async (index: number, search: string) => {
    if (!search.trim()) {
      setItemOptions(prev => ({ ...prev, [index]: [] }))
      return
    }
    const results = await fetchInventoryItems(search)
    setItemOptions(prev => ({ ...prev, [index]: results }))
  }

  const selectItem = (index: number, item: any) => {
    const updatedItems = [...items]
    updatedItems[index] = {
      ...updatedItems[index],
      item_code: item.code,
      item_name: item.name,
      quantity: updatedItems[index].quantity || 1,
      unit_price: item.price || 0,
      total_price: (updatedItems[index].quantity || 1) * (item.price || 0)
    }
    setItems(updatedItems)
    setItemSearch(prev => ({ ...prev, [index]: '' }))
    setItemOptions(prev => ({ ...prev, [index]: [] }))
  }

  const addItem = () => {
    setItems([...items, { item_code: '', item_name: '', quantity: 1, unit_price: 0, total_price: 0 }])
  }

  const removeItem = (index: number) => {
    if (items.length === 1) {
      toast.error('At least one item is required')
      return
    }
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: keyof ReceiptItem, value: any) => {
    const updatedItems = [...items]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    
    // Recalculate total price
    if (field === 'quantity' || field === 'unit_price') {
      const qty = field === 'quantity' ? value : updatedItems[index].quantity
      const price = field === 'unit_price' ? value : updatedItems[index].unit_price
      updatedItems[index].total_price = (qty || 0) * (price || 0)
    }
    
    setItems(updatedItems)
  }

  const calculateTotalAmount = () => {
    return items.reduce((sum, item) => sum + (item.total_price || 0), 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!userCostCenter) {
      toast.error('No cost center assigned')
      return
    }

    const validItems = items.filter(item => item.item_code && item.quantity > 0 && item.unit_price > 0)
    if (validItems.length === 0) {
      toast.error('Please add at least one valid item with quantity and price')
      return
    }

    setSubmitting(true)
    try {
      await createMaterialReceipt({
        cost_center: userCostCenter,
        receipt_date: new Date().toISOString().split('T')[0],
        supplier: supplier || undefined,
        invoice_number: invoiceNumber || undefined,
        items: validItems,
        total_amount: calculateTotalAmount(),
        received_by: user?.name || '',
        status: 'Completed'
      })
      toast.success(`Material receipt created. ${validItems.length} items received.`)
      setShowForm(false)
      resetForm()
      loadReceipts()
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create receipt')
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setSupplier('')
    setInvoiceNumber('')
    setItems([{ item_code: '', item_name: '', quantity: 1, unit_price: 0, total_price: 0 }])
    setItemSearch({})
    setItemOptions({})
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-slate-900">Material Receipts</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition text-sm font-medium"
          >
            <Upload className="w-4 h-4" />
            New Receipt
          </button>
        )}
      </div>

      {/* Create Receipt Form */}
      {showForm && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-md font-semibold text-slate-900">Receive Materials</h3>
            <button
              onClick={() => {
                setShowForm(false)
                resetForm()
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Receipt Header */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Supplier</label>
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Supplier name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Number</label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Invoice #"
                />
              </div>
            </div>
            
            {/* Items Table */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-slate-700">Items Received</label>
                <button
                  type="button"
                  onClick={addItem}
                  className="text-sm text-primary hover:text-primary/80 inline-flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>
              
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-3 py-2 text-right w-24">Quantity</th>
                      <th className="px-3 py-2 text-right w-28">Unit Price</th>
                      <th className="px-3 py-2 text-right w-28">Total</th>
                      <th className="px-3 py-2 text-left w-32">Batch/Lot</th>
                      <th className="px-3 py-2 text-left w-32">Expiry Date</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2">
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Search item..."
                              value={itemSearch[idx] || item.item_name}
                              onChange={(e) => {
                                setItemSearch(prev => ({ ...prev, [idx]: e.target.value }))
                                searchItems(idx, e.target.value)
                              }}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            {itemOptions[idx] && itemOptions[idx].length > 0 && (
                              <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-auto">
                                {itemOptions[idx].map(opt => (
                                  <button
                                    key={opt.code}
                                    type="button"
                                    onClick={() => selectItem(idx, opt)}
                                    className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                                  >
                                    <div className="font-medium">{opt.name}</div>
                                    <div className="text-xs text-slate-500">Code: {opt.code} | Price: {opt.price}</div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                            className="w-full text-right px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="w-full text-right px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {item.total_price.toFixed(2)}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.batch_number || ''}
                            onChange={(e) => updateItem(idx, 'batch_number', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Batch #"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={item.expiry_date || ''}
                            onChange={(e) => updateItem(idx, 'expiry_date', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="p-1 text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-right font-medium">Total Amount:</td>
                      <td className="px-3 py-2 text-right font-bold text-primary">
                        {calculateTotalAmount().toFixed(2)}
                      </td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  resetForm()
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {submitting ? 'Processing...' : 'Receive Materials'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Receipts List */}
      {!showForm && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">Receipt History</h3>
          </div>
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : receipts.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-500">No material receipts found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {receipts.map((receipt) => (
                <div key={receipt.name} className="p-4 hover:bg-slate-50 transition">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900">{receipt.name}</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircle className="w-3 h-3" />
                          {receipt.status}
                        </span>
                        {receipt.invoice_number && (
                          <span className="text-xs text-slate-500">Invoice: {receipt.invoice_number}</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Received on: {receipt.receipt_date} | By: {receipt.received_by}
                        {receipt.supplier && ` | Supplier: ${receipt.supplier}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-bold text-primary">{receipt.total_amount.toLocaleString()}</div>
                        <div className="text-xs text-slate-500">{receipt.items.length} items</div>
                      </div>
                      <button
                        onClick={() => setSelectedReceipt(receipt)}
                        className="text-primary hover:text-primary/80 text-sm inline-flex items-center gap-1"
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* View Receipt Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900">Receipt Details</h3>
              <button onClick={() => setSelectedReceipt(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-500">Receipt ID</label>
                    <p className="text-sm font-medium">{selectedReceipt.name}</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Date</label>
                    <p className="text-sm">{selectedReceipt.receipt_date}</p>
                  </div>
                  {selectedReceipt.supplier && (
                    <div>
                      <label className="text-xs text-slate-500">Supplier</label>
                      <p className="text-sm">{selectedReceipt.supplier}</p>
                    </div>
                  )}
                  {selectedReceipt.invoice_number && (
                    <div>
                      <label className="text-xs text-slate-500">Invoice Number</label>
                      <p className="text-sm">{selectedReceipt.invoice_number}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-slate-500">Received By</label>
                    <p className="text-sm">{selectedReceipt.received_by}</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Cost Center</label>
                    <p className="text-sm">{selectedReceipt.cost_center}</p>
                  </div>
                </div>
                
                <div>
                  <label className="text-xs text-slate-500 mb-2 block">Items Received</label>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-right">Quantity</th>
                          <th className="px-3 py-2 text-right">Unit Price</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-left">Batch/Lot</th>
                          <th className="px-3 py-2 text-left">Expiry Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedReceipt.items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2">
                              <div className="font-medium">{item.item_name}</div>
                              <div className="text-xs text-slate-500">{item.item_code}</div>
                            </td>
                            <td className="px-3 py-2 text-right">{item.quantity}</td>
                            <td className="px-3 py-2 text-right">{item.unit_price.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-medium">{item.total_price.toFixed(2)}</td>
                            <td className="px-3 py-2 text-slate-500">{item.batch_number || '-'}</td>
                            <td className="px-3 py-2 text-slate-500">{item.expiry_date || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t border-slate-200">
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-right font-medium">Total Amount:</td>
                          <td className="px-3 py-2 text-right font-bold text-primary">{selectedReceipt.total_amount.toFixed(2)}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}