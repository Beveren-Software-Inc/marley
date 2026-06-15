// tabs/StockLedgerTab.tsx
import { useState, useEffect } from 'react'
import { useCareContext } from '../../providers/CareContextProvider'
import { fetchStockLedger, fetchItemGroups, type StockLedgerItem } from '../../services/nursingInventory'
import { useMiniWarehouseContext } from './MiniWarehouseInventoryContext'
import { Search, Filter, Package, AlertTriangle, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react'

interface StockLedgerTabProps {
  refreshTrigger?: number
  costCenter?: string
  isFullAccess?: boolean
}

export const StockLedgerTab = ({ refreshTrigger = 0, costCenter, isFullAccess = false }: StockLedgerTabProps) => {
  const warehouseContext = useMiniWarehouseContext()
  const { userCostCenter } = useCareContext()
  const effectiveCostCenter = costCenter || userCostCenter
  
  const [stockItems, setStockItems] = useState<StockLedgerItem[]>([])
  const [filteredItems, setFilteredItems] = useState<StockLedgerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [itemGroups, setItemGroups] = useState<{ name: string; label: string }[]>([])
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [summary, setSummary] = useState({
    totalItems: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
    totalValue: 0
      });
      const [_debugItem, setDebugItem] = useState<any>(null)

  useEffect(() => {
    if (effectiveCostCenter) {
      loadStockLedger()
    }
  }, [refreshTrigger, effectiveCostCenter, warehouseContext])

  useEffect(() => {
    if (!searchTerm.trim() && !filterCategory) {
      setFilteredItems(stockItems)
    } else {
      const filtered = stockItems.filter(item => {
        const matchesSearch = item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             item.item_code.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesCategory = !filterCategory || item.item_group === filterCategory
        return matchesSearch && matchesCategory
      })
      setFilteredItems(filtered)
    }
  }, [searchTerm, filterCategory, stockItems])

  const loadStockLedger = async () => {
    if (!effectiveCostCenter) return
    
    setLoading(true)
    try {
      const [stockData, itemGroupsData] = await Promise.all([
        fetchStockLedger(effectiveCostCenter, warehouseContext),
        fetchItemGroups()
      ])
      
      setStockItems(stockData)
      setItemGroups(itemGroupsData)
      setFilteredItems(stockData)
      if (stockData.length > 0) {
        setDebugItem(stockData[0])
      }
      
      // Calculate summary
      setSummary({
        totalItems: stockData.length,
        lowStockItems: stockData.filter(item => item.current_stock <= item.reorder_level && item.current_stock > 0).length,
        outOfStockItems: stockData.filter(item => item.current_stock === 0).length,
        totalValue: stockData.reduce((sum, item) => sum + ((item.current_stock || 0) * (item.unit_price || 0)), 0)
      })
    } catch (error) {
      console.error('Failed to load stock ledger:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleCard = (itemCode: string) => {
    const newExpanded = new Set(expandedCards)
    if (newExpanded.has(itemCode)) {
      newExpanded.delete(itemCode)
    } else {
      newExpanded.add(itemCode)
    }
    setExpandedCards(newExpanded)
  }

  const getStockStatus = (currentStock: number, reorderLevel: number) => {
    if (currentStock === 0) return { label: 'Out of Stock', color: 'bg-red-100 text-red-800 border-red-200', icon: AlertTriangle }
    if (currentStock <= reorderLevel) return { label: 'Low Stock', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: AlertTriangle }
    if (currentStock <= reorderLevel * 2) return { label: 'Reordering Level', color: 'bg-orange-100 text-orange-800 border-orange-200', icon: TrendingDown }
    return { label: 'In Stock', color: 'bg-green-100 text-green-800 border-green-200', icon: TrendingUp }
  }

  // Summary Card Component
  const SummaryCard = ({ title, value, icon: Icon, color, bgColor }: any) => (
    <div className={`bg-white rounded-lg border ${bgColor} p-4`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">{title}</p>
          <p className="text-2xl font-bold text-slate-900">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        </div>
        <div className={`p-2 rounded-full ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  )

  if (!effectiveCostCenter) {
    return (
      <div className="text-center py-12">
        <Package className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-slate-900 mb-1">No Branch Selected</h3>
        <p className="text-sm text-slate-500">
          {isFullAccess 
            ? 'Please select a branch from the dropdown above to view stock ledger.'
            : 'Please ensure you have a branch assigned to view stock ledger.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard 
          title="Total Items" 
          value={summary.totalItems} 
          icon={Package}
          color="bg-primary"
          bgColor="border-primary/20"
        />
        <SummaryCard 
          title="Low Stock" 
          value={summary.lowStockItems} 
          icon={AlertTriangle}
          color="bg-yellow-500"
          bgColor="border-yellow-200"
        />
        <SummaryCard 
          title="Out of Stock" 
          value={summary.outOfStockItems} 
          icon={AlertTriangle}
          color="bg-red-500"
          bgColor="border-red-200"
        />
        <SummaryCard 
          title="Total Value" 
          value={summary.totalValue} 
          icon={TrendingUp}
          color="bg-green-500"
          bgColor="border-green-200"
        />
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by item name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        
        {itemGroups.length > 0 && (
          <div className="sm:w-64 relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              <option value="">All Item Groups</option>
              {itemGroups.map(group => (
                <option key={group.name} value={group.name}>{group.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Stock Items List - Card based view */}
      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-2 text-sm text-slate-500">Loading stock data...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-8">
          <Package className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-500">No items found in stock</p>
          {searchTerm && (
            <p className="text-xs text-slate-400 mt-1">Try adjusting your search criteria</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => {
            const status = getStockStatus(item.current_stock, item.reorder_level)
            const StatusIcon = status.icon
            const isExpanded = expandedCards.has(item.item_code)
            
            return (
              <div key={item.item_code} className={`bg-white border rounded-lg overflow-hidden hover:shadow-sm transition ${status.color.replace('bg-', 'border-').replace('text-', '')}`}>
                {/* Card Header - Click to expand */}
                <button
                  onClick={() => toggleCard(item.item_code)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${status.color.split(' ')[0].replace('bg-', 'bg-')}`} />
                      <div className="text-left">
                        <p className="text-sm font-medium text-slate-900">{item.item_name}</p>
                        <p className="text-xs text-slate-500">{item.item_code}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">{item.current_stock} {item.uom || 'Unit'}</p>
                      <p className="text-xs text-slate-500">Qty in Stock</p>
                    </div>
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                      <div className="flex items-center gap-1">
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </button>
                
                {/* Card Expanded Content */}
                {isExpanded && (
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <label className="text-xs text-slate-500">Item Group</label>
                        <p className="text-slate-900 font-medium">{item.item_group || item.category || '-'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Reorder Level</label>
                        <p className="text-slate-900 font-medium">{item.reorder_level}</p>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Unit Price</label>
                        <p className="text-slate-900 font-medium">{item.unit_price?.toLocaleString() || '-'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Total Value</label>
                        <p className="text-slate-900 font-medium">{((item.current_stock || 0) * (item.unit_price || 0)).toLocaleString()}</p>
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-slate-500">Last Updated</label>
                        <p className="text-slate-900 font-medium">{item.last_updated ? new Date(item.last_updated).toLocaleDateString() : '-'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}