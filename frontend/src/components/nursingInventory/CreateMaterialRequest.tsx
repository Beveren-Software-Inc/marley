// CreateMaterialRequestModal.tsx
import { useState, useEffect } from 'react'
import { useCareContext } from '../../providers/CareContextProvider'
import { createMaterialRequest, fetchInventoryItems, getWarehousesForCostCenter } from '../../services/nursingInventory'
import { toast } from '../../hooks/useToast'
import { X, Plus, Trash2, Send, Package } from 'lucide-react'

interface CreateMaterialRequestModalProps {
  onClose: () => void
  onSuccess: () => void
  costCenter?: string
  isFullAccess?: boolean
}

interface RequestItem {
  item_code: string
  item_name: string
  quantity: number
  uom: string
  notes: string
}

type TabId = 'details' | 'items'

export const CreateMaterialRequestModal = ({ onClose, onSuccess, costCenter }: CreateMaterialRequestModalProps) => {
  const { userCostCenter, user } = useCareContext()
  const effectiveCostCenter = costCenter || userCostCenter
  
  const [activeTab, setActiveTab] = useState<TabId>('details')
  const [warehouse, setWarehouse] = useState('')
  const [warehouses, setWarehouses] = useState<{ name: string; label: string }[]>([])
  const [loadingWarehouses, setLoadingWarehouses] = useState(false)
  const [notes, setNotes] = useState('')
  
  const [items, setItems] = useState<RequestItem[]>([{ item_code: '', item_name: '', quantity: 1, uom: '', notes: '' }])
  const [submitting, setSubmitting] = useState(false)
  const [itemSearch, setItemSearch] = useState<{ [key: number]: string }>({})
  const [itemOptions, setItemOptions] = useState<{ [key: number]: any[] }>({})
  const [openDropdown, setOpenDropdown] = useState<number | null>(null)

  // Load warehouses
  useEffect(() => {
    if (effectiveCostCenter) {
      loadWarehouses()
    }
  }, [effectiveCostCenter])

  const loadWarehouses = async () => {
    if (!effectiveCostCenter) return
    setLoadingWarehouses(true)
    try {
      const data = await getWarehousesForCostCenter(effectiveCostCenter)
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
      uom: item.uom,
      quantity: updatedItems[index].quantity || 1
    }
    setItems(updatedItems)
    setItemSearch(prev => ({ ...prev, [index]: '' }))
    setItemOptions(prev => ({ ...prev, [index]: [] }))
    setOpenDropdown(null)
  }

  const addItem = () => {
    setItems([...items, { item_code: '', item_name: '', quantity: 1, uom: '', notes: '' }])
  }

  const removeItem = (index: number) => {
    if (items.length === 1) {
      toast.error('At least one item is required')
      return
    }
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: keyof RequestItem, value: any) => {
    const updatedItems = [...items]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    setItems(updatedItems)
  }

  const validItems = items.filter(item => item.item_code && item.quantity > 0)

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
      toast.error('Please add at least one valid item')
      setActiveTab('items')
      return
    }

    setSubmitting(true)
    try {
      await createMaterialRequest({
        cost_center: effectiveCostCenter,
        warehouse: warehouse,
        request_date: new Date().toISOString().split('T')[0],
        status: 'Submitted',
        items: validItems,
        requested_by: user?.name || '',
        notes: notes || undefined
      })
      toast.success('Material request created successfully')
      onSuccess()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 rounded-t-xl">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Create Material Request</h2>
            <p className="text-xs text-slate-500 mt-0.5">Request materials from stores for {effectiveCostCenter}</p>
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
                  <p className="text-xs text-slate-400 mt-1">Cost center is auto-detected from your profile</p>
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
                  <p className="text-xs text-slate-400 mt-1">Materials will be requested from this warehouse</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Request Date
                  </label>
                  <input
                    type="date"
                    value={new Date().toISOString().split('T')[0]}
                    readOnly
                    disabled
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Additional Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    placeholder="Any special instructions or notes..."
                  />
                </div>
              </div>
            )}

            {/* Items Tab */}
            {activeTab === 'items' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-slate-500">
                    Add the items you want to request from stores.
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
                      <div className="flex gap-3 items-start">
                        <div className="flex-1 relative">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Item <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="Search for an item..."
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
                                  className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
                                >
                                  <div className="font-medium text-slate-900">{opt.name}</div>
                                  <div className="text-xs text-slate-500">Code: {opt.code} | UOM: {opt.uom}</div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="w-28">
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

                        <div className="w-24">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            UOM
                          </label>
                          <input
                            type="text"
                            value={item.uom}
                            readOnly
                            className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-md text-sm text-slate-600"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="mt-6 p-2 text-red-500 hover:text-red-700 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Notes (Optional)
                        </label>
                        <input
                          type="text"
                          value={item.notes}
                          onChange={(e) => updateItem(idx, 'notes', e.target.value)}
                          placeholder="Any specific instructions for this item..."
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
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
              <Send className="w-4 h-4" />
              {submitting ? 'Creating...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}