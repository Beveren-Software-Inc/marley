// CreateStockReconciliationModal.tsx
import { useState, useEffect } from 'react'
import { useCareContext } from '../../providers/CareContextProvider'
import { fetchStockLedger, getWarehousesForCostCenter, createStockReconciliation } from '../../services/nursingInventory'
import { toast } from '../../hooks/useToast'
import { X, Save, Search, AlertTriangle, Scan } from 'lucide-react'

interface CreateStockReconciliationModalProps {
  onClose: () => void
  onSuccess: () => void
  costCenter?: string
  isFullAccess?: boolean
}

interface ReconciliationItem {
  item_code: string
  item_name: string
  current_qty: number
  new_qty: number
  difference: number
}

type TabId = 'details' | 'items'

export const CreateStockReconciliationModal = ({ onClose, onSuccess, costCenter, isFullAccess }: CreateStockReconciliationModalProps) => {
  const { userCostCenter, user } = useCareContext()
  const effectiveCostCenter = costCenter || userCostCenter
  
  const [activeTab, setActiveTab] = useState<TabId>('details')
  const [warehouse, setWarehouse] = useState('')
  const [warehouses, setWarehouses] = useState<{ name: string; label: string }[]>([])
  const [loadingWarehouses, setLoadingWarehouses] = useState(false)
  
  const [items, setItems] = useState<ReconciliationItem[]>([])
  const [filteredItems, setFilteredItems] = useState<ReconciliationItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [scanMode, setScanMode] = useState(false)
  const [scanInput, setScanInput] = useState('')

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

  const loadCurrentStock = async () => {
    if (!warehouse) {
      toast.error('Please select a warehouse')
      return
    }
    
    setLoading(true)
    try {
      const stock = await fetchStockLedger(effectiveCostCenter)
      const reconciliationItems = stock.map(item => ({
        item_code: item.item_code,
        item_name: item.item_name,
        current_qty: item.current_stock,
        new_qty: item.current_stock,
        difference: 0
      }))
      setItems(reconciliationItems)
      setFilteredItems(reconciliationItems)
    } catch (error) {
      toast.error('Failed to load current stock data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (warehouse) {
      loadCurrentStock()
    }
  }, [warehouse])

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredItems(items)
    } else {
      const filtered = items.filter(item =>
        item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.item_code.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredItems(filtered)
    }
  }, [searchTerm, items])

  const updateQuantity = (index: number, value: number) => {
    const originalIndex = items.findIndex(i => i.item_code === filteredItems[index].item_code)
    const updatedItems = [...items]
    const newQty = value || 0
    updatedItems[originalIndex].new_qty = newQty
    updatedItems[originalIndex].difference = newQty - updatedItems[originalIndex].current_qty
    setItems(updatedItems)
    
    const updatedFiltered = [...filteredItems]
    updatedFiltered[index].new_qty = newQty
    updatedFiltered[index].difference = newQty - updatedFiltered[index].current_qty
    setFilteredItems(updatedFiltered)
  }

  const handleScan = () => {
    if (!scanInput.trim()) return
    
    const foundIndex = filteredItems.findIndex(
      item => item.item_code.toLowerCase() === scanInput.toLowerCase() || 
              item.item_name.toLowerCase().includes(scanInput.toLowerCase())
    )
    
    if (foundIndex !== -1) {
      const originalIndex = items.findIndex(i => i.item_code === filteredItems[foundIndex].item_code)
      const updatedItems = [...items]
      updatedItems[originalIndex].new_qty += 1
      updatedItems[originalIndex].difference = updatedItems[originalIndex].new_qty - updatedItems[originalIndex].current_qty
      setItems(updatedItems)
      
      const updatedFiltered = [...filteredItems]
      updatedFiltered[foundIndex].new_qty += 1
      updatedFiltered[foundIndex].difference = updatedFiltered[foundIndex].new_qty - updatedFiltered[foundIndex].current_qty
      setFilteredItems(updatedFiltered)
      
      toast.success(`Added 1 to ${filteredItems[foundIndex].item_name}`)
    } else {
      toast.error(`Item not found: ${scanInput}`)
    }
    
    setScanInput('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!warehouse) {
      toast.error('Please select a warehouse')
      setActiveTab('details')
      return
    }

    const itemsWithDiscrepancy = items.filter(item => item.difference !== 0)
    if (itemsWithDiscrepancy.length === 0) {
      toast.error('No discrepancies found. Nothing to reconcile.')
      return
    }

    setSubmitting(true)
    try {
      await createStockReconciliation({
        cost_center: effectiveCostCenter,
        warehouse: warehouse,
        reconciliation_date: new Date().toISOString().split('T')[0],
        items: itemsWithDiscrepancy.map(item => ({
          item_code: item.item_code,
          qty: item.new_qty,
          current_qty: item.current_qty
        })),
        reconciled_by: user?.name || ''
      })
      toast.success(`Stock reconciliation completed. ${itemsWithDiscrepancy.length} items adjusted.`)
      onSuccess()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create reconciliation')
    } finally {
      setSubmitting(false)
    }
  }

  const discrepanciesCount = items.filter(i => i.difference !== 0).length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 rounded-t-xl">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Stock Reconciliation</h2>
            <p className="text-xs text-slate-500 mt-0.5">Physical count and stock adjustment for {effectiveCostCenter}</p>
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
            Items ({discrepanciesCount > 0 ? `${discrepanciesCount} adjusted` : 'no changes'})
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

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Reconciliation Date
                  </label>
                  <input
                    type="date"
                    value={new Date().toISOString().split('T')[0]}
                    readOnly
                    disabled
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                  />
                </div>

                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-start gap-3">
                    <Scan className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-800">Scan/Barcode Mode</p>
                      <p className="text-xs text-blue-600 mt-1">
                        After loading items, enable scan mode in the Items tab to quickly count stock by scanning barcodes.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Items Tab */}
            {activeTab === 'items' && (
              <div className="space-y-4">
                {/* Scan Mode Toggle */}
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="scanMode"
                      checked={scanMode}
                      onChange={(e) => setScanMode(e.target.checked)}
                      className="w-4 h-4 text-primary rounded"
                    />
                    <label htmlFor="scanMode" className="text-sm font-medium text-slate-700 cursor-pointer">
                      Scan/Barcode Mode
                    </label>
                  </div>
                  {scanMode && (
                    <div className="flex gap-2 flex-1 max-w-md ml-4">
                      <input
                        type="text"
                        value={scanInput}
                        onChange={(e) => setScanInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleScan()}
                        placeholder="Scan or enter item code..."
                        className="flex-1 px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleScan}
                        className="px-3 py-1.5 bg-primary text-white rounded-md text-sm hover:bg-primary/90"
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search items by name or code..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Items Table */}
                {loading ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <p className="mt-2 text-sm text-slate-500">Loading stock data...</p>
                  </div>
                ) : (
                  <>
                    <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[450px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left">Item Code</th>
                            <th className="px-3 py-2 text-left">Item Name</th>
                            <th className="px-3 py-2 text-right">System Qty</th>
                            <th className="px-3 py-2 text-right">Physical Qty</th>
                            <th className="px-3 py-2 text-right">Difference</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {filteredItems.map((item, idx) => (
                            <tr key={item.item_code} className={item.difference !== 0 ? 'bg-yellow-50' : ''}>
                              <td className="px-3 py-2 font-mono text-xs">{item.item_code}</td>
                              <td className="px-3 py-2 font-medium">{item.item_name}</td>
                              <td className="px-3 py-2 text-right">{item.current_qty}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min="0"
                                  value={item.new_qty}
                                  onChange={(e) => updateQuantity(idx, parseInt(e.target.value) || 0)}
                                  className="w-24 text-right px-2 py-1 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                              </td>
                              <td className={`px-3 py-2 text-right font-medium ${item.difference > 0 ? 'text-green-600' : item.difference < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                {item.difference > 0 ? `+${item.difference}` : item.difference}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Summary */}
                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <span className="text-sm text-slate-600">
                          Items with discrepancies: <span className="font-bold text-amber-600">{discrepanciesCount}</span>
                        </span>
                      </div>
                      <button
                        type="submit"
                        disabled={submitting || discrepanciesCount === 0}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 transition"
                      >
                        <Save className="w-4 h-4" />
                        {submitting ? 'Processing...' : 'Complete Reconciliation'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions - only show for details tab */}
          {activeTab === 'details' && (
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('items')}
                disabled={!warehouse}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 text-sm font-medium transition-colors"
              >
                Next: Count Items →
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}