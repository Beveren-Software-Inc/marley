// tabs/StockReconciliationTab.tsx
import { useState, useEffect } from 'react'
import { useCareContext } from '../../../providers/CareContextProvider'
import { createStockReconciliation, fetchStockLedger, type StockLedgerItem, type StockReconciliation } from '../../../services/nursingInventory'
import { toast } from '../../../hooks/useToast'
import { Plus, Trash2, Save, Eye, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react'

interface StockReconciliationTabProps {
  onSuccess: () => void
}

interface ReconciliationItem {
  item_code: string
  item_name: string
  system_quantity: number
  physical_quantity: number
  difference: number
  notes?: string
}

export const StockReconciliationTab = ({ onSuccess }: StockReconciliationTabProps) => {
  const { userCostCenter, user } = useCareContext()
  const [reconciliations, setReconciliations] = useState<StockReconciliation[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedReconciliation, setSelectedReconciliation] = useState<StockReconciliation | null>(null)
  
  // Form state
  const [items, setItems] = useState<ReconciliationItem[]>([])
  const [notes, setNotes] = useState('')
  const [scanMode, setScanMode] = useState(false)
  const [scanInput, setScanInput] = useState('')

  useEffect(() => {
    if (userCostCenter) {
      loadReconciliations()
      loadCurrentStock()
    }
  }, [userCostCenter])

  const loadReconciliations = async () => {
    if (!userCostCenter) return
    setLoading(true)
    try {
      const response = await fetch(`/api/method/healthcare.api.nursing_inventory.get_stock_reconciliations?cost_center=${encodeURIComponent(userCostCenter)}`)
      const data = await response.json()
      setReconciliations(data.message || [])
    } catch (error) {
      console.error('Failed to load reconciliations:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadCurrentStock = async () => {
    if (!userCostCenter) return
    try {
      const stock = await fetchStockLedger(userCostCenter)
      const reconciliationItems = stock.map(item => ({
        item_code: item.item_code,
        item_name: item.item_name,
        system_quantity: item.current_stock,
        physical_quantity: item.current_stock, // Start with system quantity
        difference: 0,
        notes: ''
      }))
      setItems(reconciliationItems)
    } catch (error) {
      toast.error('Failed to load current stock data')
    }
  }

  const updatePhysicalQuantity = (index: number, value: number) => {
    const updatedItems = [...items]
    const physicalQty = value || 0
    updatedItems[index].physical_quantity = physicalQty
    updatedItems[index].difference = physicalQty - updatedItems[index].system_quantity
    setItems(updatedItems)
  }

  const filterItems = () => {
    // Only show items that have discrepancies or have been counted
    return items.filter(item => item.difference !== 0 || item.physical_quantity !== item.system_quantity)
  }

  const handleScan = () => {
    if (!scanInput.trim()) return
    
    // Find item by code or name
    const foundIndex = items.findIndex(
      item => item.item_code.toLowerCase() === scanInput.toLowerCase() || 
              item.item_name.toLowerCase().includes(scanInput.toLowerCase())
    )
    
    if (foundIndex !== -1) {
      // Auto-increment physical quantity by 1
      const updatedItems = [...items]
      updatedItems[foundIndex].physical_quantity += 1
      updatedItems[foundIndex].difference = updatedItems[foundIndex].physical_quantity - updatedItems[foundIndex].system_quantity
      setItems(updatedItems)
      
      // Scroll to the item
      const element = document.getElementById(`item-${foundIndex}`)
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      
      toast.success(`Added 1 to ${items[foundIndex].item_name}`)
    } else {
      toast.error(`Item not found: ${scanInput}`)
    }
    
    setScanInput('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!userCostCenter) {
      toast.error('No cost center assigned')
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
        cost_center: userCostCenter,
        reconciliation_date: new Date().toISOString().split('T')[0],
        items: itemsWithDiscrepancy,
        status: 'Completed',
        reconciled_by: user?.name || ''
      })
      toast.success(`Stock reconciliation completed. ${itemsWithDiscrepancy.length} items adjusted.`)
      setShowForm(false)
      loadReconciliations()
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create reconciliation')
    } finally {
      setSubmitting(false)
    }
  }

  const getDifferenceColor = (difference: number) => {
    if (difference > 0) return 'text-green-600'
    if (difference < 0) return 'text-red-600'
    return 'text-slate-400'
  }

  const getDifferenceIcon = (difference: number) => {
    if (difference > 0) return <AlertTriangle className="w-4 h-4 text-green-500" />
    if (difference < 0) return <AlertTriangle className="w-4 h-4 text-red-500" />
    return null
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-slate-900">Stock Reconciliation</h2>
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true)
              loadCurrentStock()
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            New Reconciliation
          </button>
        )}
      </div>

      {/* Create Reconciliation Form */}
      {showForm && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-md font-semibold text-slate-900">Physical Stock Count</h3>
            <button
              onClick={() => setShowForm(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Scan Mode Toggle */}
          <div className="mb-4 flex items-center justify-between p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="scanMode"
                checked={scanMode}
                onChange={(e) => setScanMode(e.target.checked)}
                className="w-4 h-4 text-primary rounded"
              />
              <label htmlFor="scanMode" className="text-sm font-medium text-slate-700">
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="max-h-[500px] overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Item Code</th>
                    <th className="px-3 py-2 text-left">Item Name</th>
                    <th className="px-3 py-2 text-right">System Qty</th>
                    <th className="px-3 py-2 text-right">Physical Qty</th>
                    <th className="px-3 py-2 text-right">Difference</th>
                    <th className="px-3 py-2 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((item, idx) => {
                    const hasDiscrepancy = item.difference !== 0
                    return (
                      <tr key={item.item_code} id={`item-${idx}`} className={hasDiscrepancy ? 'bg-yellow-50' : ''}>
                        <td className="px-3 py-2 font-mono text-xs">{item.item_code}</td>
                        <td className="px-3 py-2 font-medium">{item.item_name}</td>
                        <td className="px-3 py-2 text-right">{item.system_quantity}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            value={item.physical_quantity}
                            onChange={(e) => updatePhysicalQuantity(idx, parseInt(e.target.value) || 0)}
                            className="w-24 text-right px-2 py-1 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </td>
                        <td className={`px-3 py-2 text-right font-medium ${getDifferenceColor(item.difference)}`}>
                          <div className="flex items-center justify-end gap-1">
                            {getDifferenceIcon(item.difference)}
                            {item.difference > 0 ? `+${item.difference}` : item.difference}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.notes || ''}
                            onChange={(e) => {
                              const updatedItems = [...items]
                              updatedItems[idx].notes = e.target.value
                              setItems(updatedItems)
                            }}
                            placeholder="Reason for variance"
                            className="w-full px-2 py-1 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            
            <div className="flex justify-between items-center pt-4">
              <div className="text-sm text-slate-600">
                Items with discrepancies: <span className="font-bold">{items.filter(i => i.difference !== 0).length}</span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || items.filter(i => i.difference !== 0).length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {submitting ? 'Processing...' : 'Complete Reconciliation'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Reconciliation History */}
      {!showForm && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">Reconciliation History</h3>
          </div>
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : reconciliations.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-500">No reconciliation records found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {reconciliations.map((rec) => {
                const totalDifference = rec.items.reduce((sum, item) => sum + item.difference, 0)
                return (
                  <div key={rec.name} className="p-4 hover:bg-slate-50 transition">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{rec.name}</span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3" />
                            {rec.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Reconciled on: {rec.reconciliation_date} | By: {rec.reconciled_by}
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedReconciliation(rec)}
                        className="text-primary hover:text-primary/80 text-sm inline-flex items-center gap-1"
                      >
                        <Eye className="w-4 h-4" />
                        View Details
                      </button>
                    </div>
                    
                    <div className="mt-2 text-sm">
                      <span className={`font-medium ${totalDifference > 0 ? 'text-green-600' : totalDifference < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                        Net Difference: {totalDifference > 0 ? `+${totalDifference}` : totalDifference}
                      </span>
                      <span className="text-slate-400 mx-2">|</span>
                      <span className="text-slate-600">{rec.items.length} items adjusted</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* View Reconciliation Modal */}
      {selectedReconciliation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900">Reconciliation Details</h3>
              <button onClick={() => setSelectedReconciliation(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-500">Reconciliation ID</label>
                    <p className="text-sm font-medium">{selectedReconciliation.name}</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Date</label>
                    <p className="text-sm">{selectedReconciliation.reconciliation_date}</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Reconciled By</label>
                    <p className="text-sm">{selectedReconciliation.reconciled_by}</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Cost Center</label>
                    <p className="text-sm">{selectedReconciliation.cost_center}</p>
                  </div>
                </div>
                
                <div>
                  <label className="text-xs text-slate-500 mb-2 block">Adjusted Items</label>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-right">System Qty</th>
                          <th className="px-3 py-2 text-right">Physical Qty</th>
                          <th className="px-3 py-2 text-right">Difference</th>
                          <th className="px-3 py-2 text-left">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedReconciliation.items.map((item, idx) => (
                          <tr key={idx} className={item.difference !== 0 ? 'bg-yellow-50' : ''}>
                            <td className="px-3 py-2">
                              <div className="font-medium">{item.item_name}</div>
                              <div className="text-xs text-slate-500">{item.item_code}</div>
                            </td>
                            <td className="px-3 py-2 text-right">{item.system_quantity}</td>
                            <td className="px-3 py-2 text-right">{item.physical_quantity}</td>
                            <td className={`px-3 py-2 text-right font-medium ${item.difference > 0 ? 'text-green-600' : item.difference < 0 ? 'text-red-600' : ''}`}>
                              {item.difference > 0 ? `+${item.difference}` : item.difference}
                            </td>
                            <td className="px-3 py-2 text-slate-500">{item.notes || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
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