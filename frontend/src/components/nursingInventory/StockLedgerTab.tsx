// tabs/StockLedgerTab.tsx
import { useState, useEffect } from 'react'
import { useCareContext } from '../../../providers/CareContextProvider'
import { fetchStockLedger, type StockLedgerItem } from '../../../services/nursingInventory'
import { Search, Filter, Package, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'

interface StockLedgerTabProps {
  refreshTrigger: number
}

export const StockLedgerTab = ({ refreshTrigger }: StockLedgerTabProps) => {
  const { userCostCenter } = useCareContext()
  const [stockItems, setStockItems] = useState<StockLedgerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [summary, setSummary] = useState({
    totalItems: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
    totalValue: 0
  })

  useEffect(() => {
    loadStockLedger()
  }, [refreshTrigger, userCostCenter])

  const loadStockLedger = async () => {
    if (!userCostCenter) return
    
    setLoading(true)
    try {
      const data = await fetchStockLedger(userCostCenter)
      setStockItems(data)
      
      // Extract unique categories
      const uniqueCategories = [...new Set(data.map(item => item.category).filter(Boolean))]
      setCategories(uniqueCategories as string[])
      
      // Calculate summary
      setSummary({
        totalItems: data.length,
        lowStockItems: data.filter(item => item.current_stock <= item.reorder_level).length,
        outOfStockItems: data.filter(item => item.current_stock === 0).length,
        totalValue: data.reduce((sum, item) => sum + (item.current_stock * item.unit_price), 0)
      })
    } catch (error) {
      console.error('Failed to load stock ledger:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredItems = stockItems.filter(item => {
    const matchesSearch = item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.item_code.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = !filterCategory || item.category === filterCategory
    return matchesSearch && matchesCategory
  })

  const getStockStatus = (currentStock: number, reorderLevel: number) => {
    if (currentStock === 0) return { label: 'Out of Stock', color: 'bg-red-100 text-red-800', icon: AlertTriangle }
    if (currentStock <= reorderLevel) return { label: 'Low Stock', color: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle }
    if (currentStock <= reorderLevel * 2) return { label: 'Reordering', color: 'bg-orange-100 text-orange-800', icon: TrendingDown }
    return { label: 'In Stock', color: 'bg-green-100 text-green-800', icon: TrendingUp }
  }

  if (!userCostCenter) {
    return (
      <div className="text-center py-12">
        <Package className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-slate-900 mb-1">No Cost Center Assigned</h3>
        <p className="text-sm text-slate-500">
          Please ensure you have a cost center assigned to view stock ledger.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Total Items</p>
              <p className="text-2xl font-bold text-slate-900">{summary.totalItems}</p>
            </div>
            <Package className="w-8 h-8 text-primary opacity-60" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Low Stock Items</p>
              <p className="text-2xl font-bold text-yellow-600">{summary.lowStockItems}</p>
            </div>
            <TrendingDown className="w-8 h-8 text-yellow-500" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Out of Stock</p>
              <p className="text-2xl font-bold text-red-600">{summary.outOfStockItems}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Total Stock Value</p>
              <p className="text-2xl font-bold text-slate-900">{summary.totalValue.toLocaleString()}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-500" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
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
          
          {categories.length > 0 && (
            <div className="sm:w-64 relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Stock Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="mt-2 text-sm text-slate-500">Loading stock data...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-500">No items found in stock</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Item Code</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Item Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Category</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-600 uppercase">Current Stock</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-600 uppercase">Unit</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-600 uppercase">Unit Price</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-600 uppercase">Total Value</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredItems.map((item) => {
                  const status = getStockStatus(item.current_stock, item.reorder_level)
                  const StatusIcon = status.icon
                  return (
                    <tr key={item.item_code} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-sm text-slate-600">{item.item_code}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{item.item_name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{item.category || '-'}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">
                        {item.current_stock}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-slate-600">{item.uom || 'Unit'}</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-600">
                        {item.unit_price?.toLocaleString() || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">
                        {((item.current_stock || 0) * (item.unit_price || 0)).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}