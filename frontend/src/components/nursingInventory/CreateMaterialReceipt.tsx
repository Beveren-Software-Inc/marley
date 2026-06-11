// CreateMaterialReceiptModal.tsx
import { useState, useEffect } from 'react'
import {
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { useCareContext } from '../../providers/CareContextProvider'
import { createMaterialReceipt, fetchInventoryItems, getWarehousesForCostCenter } from '../../services/nursingInventory'
import { useMiniWarehouseContext } from './MiniWarehouseInventoryContext'
import { toast } from '../../hooks/useToast'
import { X, Plus, Trash2, Save, Package } from 'lucide-react'

interface CreateMaterialReceiptModalProps {
  onClose: () => void
  onSuccess: () => void
  costCenter?: string
  isFullAccess?: boolean
}

interface ReceiptItem {
  item_code: string
  item_name: string
  quantity: number
  unit_price: number
  total_price: number
  batch_number: string
  expiry_date: string
}

type TabId = 'details' | 'items'

export const CreateMaterialReceiptModal = ({ onClose, onSuccess, costCenter }: CreateMaterialReceiptModalProps) => {
  const warehouseContext = useMiniWarehouseContext()
  const { userCostCenter, user } = useCareContext()
  const effectiveCostCenter = costCenter || userCostCenter
  
  const [activeTab, setActiveTab] = useState<TabId>('details')
  const [warehouse, setWarehouse] = useState('')
  const [warehouses, setWarehouses] = useState<{ name: string; label: string }[]>([])
  const [loadingWarehouses, setLoadingWarehouses] = useState(false)
  const [supplier, setSupplier] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  
  const [items, setItems] = useState<ReceiptItem[]>([
    { item_code: '', item_name: '', quantity: 1, unit_price: 0, total_price: 0, batch_number: '', expiry_date: '' }
  ])
  const [submitting, setSubmitting] = useState(false)
  const [itemSearch, setItemSearch] = useState<{ [key: number]: string }>({})
  const [itemOptions, setItemOptions] = useState<{ [key: number]: any[] }>({})
  const [openDropdown, setOpenDropdown] = useState<number | null>(null)

  // Load warehouses
  useEffect(() => {
    if (effectiveCostCenter) {
      loadWarehouses()
    }
  }, [effectiveCostCenter, warehouseContext])

  const loadWarehouses = async () => {
    if (!effectiveCostCenter) return
    setLoadingWarehouses(true)
    try {
      const data = await getWarehousesForCostCenter(effectiveCostCenter, warehouseContext)
      setWarehouses(data)
      if (data.length > 0) {
        setWarehouse(data[0].name)
      }
    } catch (error) {
      console.error('Failed to load warehouses:', error)
    } finally {
      setLoadingWarehouses(false)
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
    setOpenDropdown(null)
  }

  const addItem = () => {
    setItems([...items, { item_code: '', item_name: '', quantity: 1, unit_price: 0, total_price: 0, batch_number: '', expiry_date: '' }])
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

  const validItems = items.filter(item => item.item_code && item.quantity > 0 && item.unit_price > 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!effectiveCostCenter) {
      toast.error('No cost center assigned')
      return
    }

    if (!warehouse) {
      toast.error('Please select a warehouse')
      setActiveTab('details')
      return
    }

    if (validItems.length === 0) {
      toast.error('Please add at least one valid item with quantity and price')
      setActiveTab('items')
      return
    }

    setSubmitting(true)
    try {
      await createMaterialReceipt({
        cost_center: effectiveCostCenter,
        warehouse: warehouse,
        receipt_date: new Date().toISOString().split('T')[0],
        supplier: supplier || undefined,
        invoice_number: invoiceNumber || undefined,
        items: validItems,
        total_amount: calculateTotalAmount(),
        received_by: user?.name || '',
        status: 'Completed',
        warehouse_context: warehouseContext,
      })
      toast.success(`Material receipt created. ${validItems.length} items received.`)
      onSuccess()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create receipt')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-5xl w-full max-h-[90vh]')}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 rounded-t-xl">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-emerald-950">Receive Materials</h2>
            <p className="text-xs text-slate-500 mt-0.5">Record material receipt for {effectiveCostCenter}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 shrink-0 bg-slate-50">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'details'
                ? 'border-primary text-primary bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('items')}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'items'
                ? 'border-primary text-primary bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            Items ({validItems.length})
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-6">
            {/* Details Tab */}
            {activeTab === 'details' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Cost Center <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={effectiveCostCenter}
                    readOnly
                    disabled
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Warehouse <span className="text-red-500">*</span>
                  </label>
                  {loadingWarehouses ? (
                    <div className="flex items-center gap-2 py-2">
                      <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      <span className="text-sm text-slate-500">Loading warehouses...</span>
                    </div>
                  ) : (
                    <select
                      value={warehouse}
                      onChange={(e) => setWarehouse(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    >
                      <option value="">Select Warehouse</option>
                      {warehouses.map(w => (
                        <option key={w.name} value={w.name}>{w.label || w.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Supplier
                    </label>
                    <input
                      type="text"
                      value={supplier}
                      onChange={(e) => setSupplier(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Supplier name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Invoice Number
                    </label>
                    <input
                      type="text"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Invoice number"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Receipt Date
                  </label>
                  <input
                    type="date"
                    value={new Date().toISOString().split('T')[0]}
                    readOnly
                    disabled
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                  />
                </div>
              </div>
            )}

            {/* Items Tab */}
            {activeTab === 'items' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-slate-500">
                    Add the items you are receiving. Quantity and Unit Price are required.
                  </p>
                  <button
                    type="button"
                    onClick={addItem}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-md hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add Item
                  </button>
                </div>

                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div key={idx} className="border border-slate-200 rounded-lg p-4 bg-white shadow-sm">
                      <div className="grid grid-cols-12 gap-3 items-start">
                        <div className="col-span-5">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Item <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Search item..."
                              value={itemSearch[idx] !== undefined ? itemSearch[idx] : item.item_name}
                              onChange={(e) => {
                                setItemSearch(prev => ({ ...prev, [idx]: e.target.value }))
                                setOpenDropdown(idx)
                                searchItems(idx, e.target.value)
                              }}
                              onFocus={() => setOpenDropdown(idx)}
                              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            {openDropdown === idx && itemOptions[idx] && itemOptions[idx].length > 0 && (
                              <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-auto">
                                {itemOptions[idx].map(opt => (
                                  <button
                                    key={opt.code}
                                    type="button"
                                    onClick={() => selectItem(idx, opt)}
                                    className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                                  >
                                    <div className="font-medium text-slate-900">{opt.name}</div>
                                    <div className="text-xs text-slate-500">Code: {opt.code} | Price: {opt.price}</div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Quantity <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary text-right"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Unit Price <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary text-right"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Total
                          </label>
                          <input
                            type="text"
                            value={item.total_price.toFixed(2)}
                            readOnly
                            className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-md text-sm text-slate-700 font-medium text-right"
                          />
                        </div>

                        <div className="col-span-1">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="mt-6 p-2 text-red-500 hover:text-red-700 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Batch/Lot Number
                          </label>
                          <input
                            type="text"
                            value={item.batch_number}
                            onChange={(e) => updateItem(idx, 'batch_number', e.target.value)}
                            placeholder="Batch #"
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Expiry Date
                          </label>
                          <input
                            type="date"
                            value={item.expiry_date}
                            onChange={(e) => updateItem(idx, 'expiry_date', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  {items.length === 0 && (
                    <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                      <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No items added yet</p>
                      <button
                        type="button"
                        onClick={addItem}
                        className="mt-3 text-sm text-primary hover:underline"
                      >
                        Add first item
                      </button>
                    </div>
                  )}
                </div>

                {/* Total Summary */}
                {validItems.length > 0 && (
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-slate-700">Total Amount:</span>
                      <span className="text-xl font-bold text-primary">{calculateTotalAmount().toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex gap-3 px-6 py-4 border-t border-slate-200 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !warehouse || validItems.length === 0}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 text-sm font-medium transition-colors inline-flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {submitting ? 'Processing...' : 'Receive Materials'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}