// CreateStockReconciliationModal.tsx
import { useState, useEffect } from 'react'
import { useCareContext } from '../../providers/CareContextProvider'
import { fetchStockLedger, getWarehousesForCostCenter, createStockReconciliation, getItemBatches, getItemSerials, getBatchSerials } from '../../services/nursingInventory'
import { toast } from '../../hooks/useToast'
import { X, Save, Search, AlertTriangle, Plus, Minus } from 'lucide-react'

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
  serial_nos: string[]
  batch_no: string
  has_serial_no: boolean
  has_batch_no: boolean
  available_batches?: Array<{ 
    batch_id: string
    batch_name: string
    qty: number
    expiry_date: string
    manufacturing_date?: string
  }>
  available_serials?: string[]
  isLoadingBatches?: boolean
}

export const CreateStockReconciliationModal = ({ onClose, onSuccess, costCenter }: CreateStockReconciliationModalProps) => {
  const { userCostCenter, user } = useCareContext()
  const effectiveCostCenter = costCenter || userCostCenter
  
  const [activeTab, setActiveTab] = useState<'details' | 'items'>('details')
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
  const [selectedItemForSerial, setSelectedItemForSerial] = useState<ReconciliationItem | null>(null)
  const [serialInput, setSerialInput] = useState('')

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
    
    if (!effectiveCostCenter) {
      toast.error('Cost center is required')
      return
    }
    
    setLoading(true)
    try {
      const stock = await fetchStockLedger(effectiveCostCenter)
      
      // Fetch item details to know which items are serialized/batched
      const reconciliationItems = await Promise.all(stock.map(async (item) => {
        const itemData: ReconciliationItem = {
          item_code: item.item_code,
          item_name: item.item_name,
          current_qty: item.current_stock,
          new_qty: item.current_stock,
          difference: 0,
          serial_nos: [],
          batch_no: '',
          has_serial_no: false,
          has_batch_no: false,
          available_batches: [],
          isLoadingBatches: false
        }
        
        // Fetch item type details
        try {
          const response = await fetch(`/api/method/frappe.client.get_value`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              doctype: 'Item',
              filters: { item_code: item.item_code },
              fieldname: ['has_serial_no', 'has_batch_no']
            })
          })
          const result = await response.json()
          if (result.message) {
            itemData.has_serial_no = result.message.has_serial_no === 1
            itemData.has_batch_no = result.message.has_batch_no === 1
            
            // If item has batch, load batches immediately
            if (itemData.has_batch_no) {
              await loadBatchesForItem(item.item_code, itemData)
            }
          }
        } catch (e) {
          console.error(`Failed to fetch item details for ${item.item_code}`, e)
        }
        
        return itemData
      }))
      
      setItems(reconciliationItems)
      setFilteredItems(reconciliationItems)
    } catch (error) {
      toast.error('Failed to load current stock data')
    } finally {
      setLoading(false)
    }
  }

  // Load batches for an item and update the item in state
  const loadBatchesForItem = async (itemCode: string, itemToUpdate?: ReconciliationItem) => {
    try {
      // Find the item in state if not provided
      let item: ReconciliationItem | undefined = itemToUpdate
      if (!item) {
        item = items.find(i => i.item_code === itemCode)
      }
      
      if (!item) return
      
      // Set loading state
      const originalIndex = items.findIndex(i => i.item_code === itemCode)
      if (originalIndex !== -1) {
        const updatedItems = [...items]
        updatedItems[originalIndex].isLoadingBatches = true
        setItems(updatedItems)
        
        const updatedFiltered = [...filteredItems]
        const filteredIndex = filteredItems.findIndex(i => i.item_code === itemCode)
        if (filteredIndex !== -1) {
          updatedFiltered[filteredIndex].isLoadingBatches = true
          setFilteredItems(updatedFiltered)
        }
      }
      
      console.log(`Loading batches for ${itemCode} in warehouse ${warehouse}`)
      const batches = await getItemBatches(itemCode, warehouse)
      console.log(`Batches loaded for ${itemCode}:`, batches)
      
      // Update item with batches
      if (originalIndex !== -1) {
        const updatedItems = [...items]
        updatedItems[originalIndex].available_batches = batches || []
        updatedItems[originalIndex].isLoadingBatches = false
        setItems(updatedItems)
        
        const updatedFiltered = [...filteredItems]
        const filteredIndex = filteredItems.findIndex(i => i.item_code === itemCode)
        if (filteredIndex !== -1) {
          updatedFiltered[filteredIndex].available_batches = batches || []
          updatedFiltered[filteredIndex].isLoadingBatches = false
          setFilteredItems(updatedFiltered)
        }
      }
    } catch (error) {
      console.error('Failed to load batches', error)
      toast.error(`Failed to load batches for ${itemCode}`)
      
      // Reset loading state
      const originalIndex = items.findIndex(i => i.item_code === itemCode)
      if (originalIndex !== -1) {
        const updatedItems = [...items]
        updatedItems[originalIndex].isLoadingBatches = false
        setItems(updatedItems)
        
        const updatedFiltered = [...filteredItems]
        const filteredIndex = filteredItems.findIndex(i => i.item_code === itemCode)
        if (filteredIndex !== -1) {
          updatedFiltered[filteredIndex].isLoadingBatches = false
          setFilteredItems(updatedFiltered)
        }
      }
    }
  }

  // Load serials for an item
  const loadSerialsForItem = async (itemCode: string) => {
    try {
      console.log(`Loading serials for ${itemCode} in warehouse ${warehouse}`)
      const serials = await getItemSerials(itemCode, warehouse)
      console.log(`Serials loaded for ${itemCode}:`, serials)
      return serials || []
    } catch (error) {
      console.error('Failed to load serials', error)
      toast.error(`Failed to load serials for ${itemCode}`)
      return []
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

  const updateQuantity = async (index: number, value: number) => {
    const originalIndex = items.findIndex(i => i.item_code === filteredItems[index].item_code)
    const updatedItems = [...items]
    const newQty = value || 0
    const item = updatedItems[originalIndex]
    
    // For serialized items, validate serial count
    if (item.has_serial_no && newQty > item.current_qty) {
      // Need to add serial numbers
      if (item.serial_nos.length < (newQty - item.current_qty)) {
        toast.error(`Please add ${newQty - item.current_qty} serial numbers for ${item.item_name}`)
        return
      }
    }
    
    item.new_qty = newQty
    item.difference = newQty - item.current_qty
    setItems(updatedItems)
    
    const updatedFiltered = [...filteredItems]
    updatedFiltered[index].new_qty = newQty
    updatedFiltered[index].difference = newQty - updatedFiltered[index].current_qty
    setFilteredItems(updatedFiltered)
  }

  const openSerialManager = async (item: ReconciliationItem) => {
    // Load serials for the selected batch if available, otherwise load all serials
    let serials: any[] = []
    
    if (item.batch_no) {
      try {
        serials = await getBatchSerials(item.batch_no, warehouse)
      } catch (e) {
        console.error(`Failed to fetch serials for batch ${item.batch_no}`, e)
        serials = []
      }
    } else {
      try {
        serials = await loadSerialsForItem(item.item_code)
      } catch (e) {
        console.error(`Failed to load serials for item ${item.item_code}`, e)
        serials = []
      }
    }
    
    console.log("Loaded serials for modal:", serials)
    
    setSelectedItemForSerial({ 
      ...item, 
      available_serials: serials || []
    })
    setSerialInput('')
  }

  const addSerialNumber = () => {
    if (!selectedItemForSerial) return
    
    const serialToAdd = serialInput.trim()
    if (!serialToAdd) return
    
    // Check if serial already added
    if (selectedItemForSerial.serial_nos.includes(serialToAdd)) {
      toast.error('Serial number already added')
      return
    }
    
    // Allow new serials - no warehouse validation
    
    const updatedItem = { ...selectedItemForSerial }
    updatedItem.serial_nos = [...updatedItem.serial_nos, serialToAdd]
    updatedItem.new_qty = updatedItem.current_qty + updatedItem.serial_nos.length
    updatedItem.difference = updatedItem.new_qty - updatedItem.current_qty
    
    setSelectedItemForSerial(updatedItem)
    setSerialInput('')
    
    // Update main items array
    const originalIndex = items.findIndex(i => i.item_code === updatedItem.item_code)
    if (originalIndex !== -1) {
      const updatedItems = [...items]
      updatedItems[originalIndex] = updatedItem
      setItems(updatedItems)
      
      // Update filtered items
      const filteredIndex = filteredItems.findIndex(i => i.item_code === updatedItem.item_code)
      if (filteredIndex !== -1) {
        const updatedFiltered = [...filteredItems]
        updatedFiltered[filteredIndex] = updatedItem
        setFilteredItems(updatedFiltered)
      }
    }
  }

  const removeSerialNumber = (serialToRemove: string) => {
    if (!selectedItemForSerial) return
    
    const updatedItem = { ...selectedItemForSerial }
    updatedItem.serial_nos = updatedItem.serial_nos.filter(s => s !== serialToRemove)
    updatedItem.new_qty = updatedItem.current_qty + updatedItem.serial_nos.length
    updatedItem.difference = updatedItem.new_qty - updatedItem.current_qty
    
    setSelectedItemForSerial(updatedItem)
    
    // Update main items array
    const originalIndex = items.findIndex(i => i.item_code === updatedItem.item_code)
    if (originalIndex !== -1) {
      const updatedItems = [...items]
      updatedItems[originalIndex] = updatedItem
      setItems(updatedItems)
      
      // Update filtered items
      const filteredIndex = filteredItems.findIndex(i => i.item_code === updatedItem.item_code)
      if (filteredIndex !== -1) {
        const updatedFiltered = [...filteredItems]
        updatedFiltered[filteredIndex] = updatedItem
        setFilteredItems(updatedFiltered)
      }
    }
  }

  const updateBatch = async (index: number, batchNo: string) => {
    const originalIndex = items.findIndex(i => i.item_code === filteredItems[index].item_code)
    const updatedItems = [...items]
    updatedItems[originalIndex].batch_no = batchNo
    setItems(updatedItems)
    
    const updatedFiltered = [...filteredItems]
    updatedFiltered[index].batch_no = batchNo
    setFilteredItems(updatedFiltered)
  }

  const handleScan = async () => {
    if (!scanInput.trim()) return
    
    const foundIndex = filteredItems.findIndex(
      item => item.item_code.toLowerCase() === scanInput.toLowerCase() || 
              item.item_name.toLowerCase().includes(scanInput.toLowerCase())
    )
    
    if (foundIndex !== -1) {
      const item = filteredItems[foundIndex]
      
      if (item.has_serial_no) {
        // For serialized items, open serial manager
        await openSerialManager(item)
        setScanInput('')
      } else {
        // For non-serialized items, just increment quantity
        const originalIndex = items.findIndex(i => i.item_code === item.item_code)
        const updatedItems = [...items]
        updatedItems[originalIndex].new_qty += 1
        updatedItems[originalIndex].difference = updatedItems[originalIndex].new_qty - updatedItems[originalIndex].current_qty
        setItems(updatedItems)
        
        const updatedFiltered = [...filteredItems]
        updatedFiltered[foundIndex].new_qty += 1
        updatedFiltered[foundIndex].difference = updatedFiltered[foundIndex].new_qty - updatedFiltered[foundIndex].current_qty
        setFilteredItems(updatedFiltered)
        
        toast.success(`Added 1 to ${item.item_name}`)
        setScanInput('')
      }
    } else {
      toast.error(`Item not found: ${scanInput}`)
      setScanInput('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!warehouse) {
      toast.error('Please select a warehouse')
      setActiveTab('details')
      return
    }

    const itemsWithDiscrepancy = items.filter(item => item.difference !== 0)
    if (!effectiveCostCenter) {
      toast.error('Cost center is required')
      return
    }

    // Validate serialized items have proper serial numbers
    for (const item of itemsWithDiscrepancy) {
      if (item.has_serial_no && item.new_qty > 0 && item.serial_nos.length !== item.new_qty) {
        toast.error(`Item ${item.item_name}: Please provide ${item.new_qty} serial numbers (${item.serial_nos.length} provided)`)
        return
      }
      
      if (item.has_batch_no && item.new_qty > 0 && !item.batch_no) {
        toast.error(`Item ${item.item_name}: Please select a batch number`)
        return
      }
    }

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
          item_name: item.item_name,
          system_quantity: item.current_qty,
          physical_quantity: item.new_qty,
          difference: item.difference,
          serial_nos: item.has_serial_no ? item.serial_nos.join(', ') : undefined,
          batch_no: item.batch_no || undefined
        })),
        reconciled_by: user?.name || '',
        status: 'Draft'
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
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col">
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
                            <th className="px-3 py-2 text-center">Batch No</th>
                            <th className="px-3 py-2 text-center">Serials</th>
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
                              <td className="px-3 py-2">
                                {item.has_batch_no && (
                                  <div className="min-w-[150px]">
                                    {item.isLoadingBatches ? (
                                      <div className="flex items-center gap-1 text-xs text-slate-500">
                                        <div className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                                        <span>Loading...</span>
                                      </div>
                                    ) : (
                                      <select
                                        value={item.batch_no}
                                        onChange={(e) => updateBatch(idx, e.target.value)}
                                        className="w-full px-2 py-1 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                      >
                                        <option value="">Select Batch</option>
                                        {item.available_batches && item.available_batches.length > 0 ? (
                                          item.available_batches.map((batch, i) => (
                                            <option key={i} value={batch.batch_id || batch.batch_name}>
                                              {batch.batch_id || batch.batch_name} 
                                              (Qty: {batch.qty})
                                              {batch.expiry_date && ` | Exp: ${batch.expiry_date}`}
                                            </option>
                                          ))
                                        ) : (
                                          <option value="" disabled>No batches available</option>
                                        )}
                                      </select>
                                    )}
                                    {!item.isLoadingBatches && (!item.available_batches || item.available_batches.length === 0) && (
                                      <button
                                        type="button"
                                        onClick={() => loadBatchesForItem(item.item_code)}
                                        className="text-xs text-blue-600 mt-1 hover:underline"
                                      >
                                        Retry loading batches
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {item.has_serial_no && (
                                  <button
                                    type="button"
                                    onClick={() => openSerialManager(item)}
                                    className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                                  >
                                    {item.serial_nos.length} serials
                                  </button>
                                )}
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

      {/* Serial Number Manager Modal */}
      {selectedItemForSerial && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-semibold">Manage Serial Numbers</h3>
              <button onClick={() => setSelectedItemForSerial(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <p className="text-sm text-slate-600">Item: <span className="font-medium">{selectedItemForSerial.item_name}</span></p>
                <p className="text-sm text-slate-600">Current System Quantity: <span className="font-medium">{selectedItemForSerial.current_qty}</span></p>
                <p className="text-sm text-slate-600">New Quantity: <span className="font-medium">{selectedItemForSerial.new_qty}</span></p>
                <p className="text-sm text-slate-600">Serials Added: <span className="font-bold text-blue-600">{selectedItemForSerial.serial_nos.length}</span></p>
              </div>
              
              {/* Show available serials from warehouse */}
              {selectedItemForSerial.available_serials && selectedItemForSerial.available_serials.length > 0 && (
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-xs font-medium text-blue-800 mb-2">Available Serials in Warehouse:</p>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {selectedItemForSerial.available_serials.map((serial, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSerialInput(serial)
                          addSerialNumber()
                        }}
                        className="text-xs bg-white text-blue-700 px-2 py-1 rounded border border-blue-200 hover:bg-blue-100"
                      >
                        {serial}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={serialInput}
                  onChange={(e) => setSerialInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addSerialNumber()}
                  placeholder="Enter new or existing serial number"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={addSerialNumber}
                  className="px-3 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary/90"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              <div className="border rounded-lg max-h-48 overflow-y-auto">
                {selectedItemForSerial.serial_nos.length === 0 ? (
                  <p className="text-center text-slate-500 py-4">No serial numbers added</p>
                ) : (
                  <ul className="divide-y">
                    {selectedItemForSerial.serial_nos.map((serial, idx) => (
                      <li key={idx} className="flex justify-between items-center p-2">
                        <span className="font-mono text-sm">{serial}</span>
                        <button
                          type="button"
                          onClick={() => removeSerialNumber(serial)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              
              <div className="text-xs text-slate-500 bg-yellow-50 p-2 rounded">
                <p>💡 Tip: You can add new serial numbers not yet in the warehouse. They will be created during reconciliation.</p>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
              <button
                onClick={() => setSelectedItemForSerial(null)}
                className="px-4 py-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Update the main items with the serial numbers
                  const originalIndex = items.findIndex(i => i.item_code === selectedItemForSerial.item_code)
                  if (originalIndex !== -1) {
                    const updatedItems = [...items]
                    updatedItems[originalIndex] = selectedItemForSerial
                    setItems(updatedItems)
                    
                    const filteredIndex = filteredItems.findIndex(i => i.item_code === selectedItemForSerial.item_code)
                    if (filteredIndex !== -1) {
                      const updatedFiltered = [...filteredItems]
                      updatedFiltered[filteredIndex] = selectedItemForSerial
                      setFilteredItems(updatedFiltered)
                    }
                  }
                  setSelectedItemForSerial(null)
                  toast.success(`Updated serials for ${selectedItemForSerial.item_name}`)
                }}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}