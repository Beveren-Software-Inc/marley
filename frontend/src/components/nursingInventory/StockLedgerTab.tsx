// tabs/StockLedgerTab.tsx
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useCareContext } from '../../providers/CareContextProvider'
import {
  fetchStockLedger,
  fetchStockLedgerExport,
  fetchItemGroups,
  type StockLedgerItem,
  type StockLedgerExportRow,
} from '../../services/nursingInventory'
import { useMiniWarehouseContext } from './MiniWarehouseInventoryContext'
import {
  FilterToggleButton,
  InventoryFilterBar,
  FilterSearchInput,
  FilterSelectField,
  matchesTextQuery,
} from './InventoryListFilters'
import {
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  FileText,
  FileDown,
} from 'lucide-react'
import { toast } from '../../hooks/useToast'

type StockStatusFilter = '' | 'in_stock' | 'low_stock' | 'out_of_stock'

interface StockLedgerTabProps {
  refreshTrigger?: number
  costCenter?: string
  isFullAccess?: boolean
}

export const StockLedgerTab = ({ refreshTrigger = 0, costCenter }: StockLedgerTabProps) => {
  const warehouseContext = useMiniWarehouseContext()
  const { userCostCenter } = useCareContext()
  const effectiveCostCenter = costCenter || userCostCenter
  
  const [stockItems, setStockItems] = useState<StockLedgerItem[]>([])
  const [ledgerWarehouse, setLedgerWarehouse] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [stockStatusFilter, setStockStatusFilter] = useState<StockStatusFilter>('')
  const [itemGroups, setItemGroups] = useState<{ name: string; label: string }[]>([])
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [summary, setSummary] = useState({
    totalItems: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
    totalValue: 0
      });
      const [_debugItem, setDebugItem] = useState<any>(null)

  const hasActiveFilters = Boolean(searchTerm || filterCategory || stockStatusFilter)

  const filteredItems = useMemo(() => {
    return stockItems.filter((item) => {
      const matchesSearch =
        matchesTextQuery(item.item_name, searchTerm) || matchesTextQuery(item.item_code, searchTerm)
      const group = item.item_group || item.category || ''
      const matchesCategory = !filterCategory || group === filterCategory
      const reorder = item.reorder_level || 10
      const current = item.current_stock
      const matchesStatus =
        !stockStatusFilter ||
        (stockStatusFilter === 'out_of_stock' && current === 0) ||
        (stockStatusFilter === 'low_stock' && current > 0 && current <= reorder) ||
        (stockStatusFilter === 'in_stock' && current > reorder)
      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [stockItems, searchTerm, filterCategory, stockStatusFilter])

  const clearFilters = () => {
    setSearchTerm('')
    setFilterCategory('')
    setStockStatusFilter('')
  }

  useEffect(() => {
    if (effectiveCostCenter) {
      loadStockLedger()
    }
  }, [refreshTrigger, effectiveCostCenter, warehouseContext])

  const loadStockLedger = async () => {
    if (!effectiveCostCenter) return
    
    setLoading(true)
    try {
      const [stockData, itemGroupsData] = await Promise.all([
        fetchStockLedger(effectiveCostCenter, warehouseContext),
        fetchItemGroups(undefined, warehouseContext),
      ])
      
      setStockItems(stockData)
      setLedgerWarehouse(stockData[0]?.warehouse || '')
      setItemGroups(itemGroupsData)
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

  const formatQty = (qty: number | null | undefined) => {
    if (qty == null || Number.isNaN(Number(qty))) return null
    const n = Number(qty)
    return Number.isInteger(n) ? String(n) : n.toLocaleString(undefined, { maximumFractionDigits: 3 })
  }

  const loadExportRows = useCallback(async (): Promise<{
    warehouse: string
    rows: StockLedgerExportRow[]
  }> => {
    if (!effectiveCostCenter) return { warehouse: '', rows: [] }
    const data = await fetchStockLedgerExport(effectiveCostCenter, warehouseContext)
    const allowed = new Set(filteredItems.map((item) => item.item_code))
    return {
      warehouse: data.warehouse || ledgerWarehouse,
      rows: data.rows.filter((row) => allowed.has(row.item_code)),
    }
  }, [effectiveCostCenter, warehouseContext, filteredItems, ledgerWarehouse])

  const exportExcel = async () => {
    if (!filteredItems.length) {
      toast.error('No stock items to export')
      return
    }
    setExporting(true)
    try {
      const { warehouse, rows } = await loadExportRows()
      if (!rows.length) {
        toast.error('No stock rows to export')
        return
      }
      const headers = [
        'Item Code',
        'Item Name',
        'Item Group',
        'Qty (Units)',
        'Unit UOM',
        'Pack Qty',
        'Pack UOM',
        'Stock Qty',
        'Stock UOM',
        'Reorder Level',
        'Unit Price',
        'Warehouse',
      ]
      const escapeCsv = (value: unknown) => {
        const text = value == null ? '' : String(value)
        if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
        return text
      }
      const lines = [
        headers.join(','),
        ...rows.map((row) =>
          [
            row.item_code,
            row.item_name,
            row.item_group || '',
            row.unit_qty ?? row.qty ?? '',
            row.unit_uom || row.uom || '',
            row.pack_qty ?? '',
            row.pack_uom || '',
            row.stock_qty ?? '',
            row.stock_uom || '',
            row.reorder_level ?? '',
            row.unit_price ?? '',
            row.warehouse || warehouse || '',
          ]
            .map(escapeCsv)
            .join(',')
        ),
      ]
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `stock-ledger-${warehouse || 'warehouse'}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Excel (CSV) downloaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export Excel')
    } finally {
      setExporting(false)
    }
  }

  const exportPdf = async () => {
    if (!filteredItems.length) {
      toast.error('No stock items to export')
      return
    }
    setExporting(true)
    try {
      const { warehouse, rows } = await loadExportRows()
      if (!rows.length) {
        toast.error('No stock rows to export')
        return
      }
      const contextLabel = warehouseContext === 'laboratory' ? 'Laboratory' : 'Nurse'
      const title = `${contextLabel} mini warehouse stock`
      const bodyRows = rows
        .map(
          (row) => {
            const unitQty = formatQty(row.unit_qty ?? row.qty) ?? row.unit_qty ?? row.qty ?? ''
            const unitUom = row.unit_uom || row.uom || ''
            const packLabel =
              row.pack_qty != null
                ? `${formatQty(row.pack_qty) ?? row.pack_qty} ${row.pack_uom || ''}`.trim()
                : '—'
            return `<tr>
            <td>${row.item_code || ''}</td>
            <td>${row.item_name || ''}</td>
            <td>${unitQty} ${unitUom}</td>
            <td>${packLabel}</td>
            <td>${row.item_group || '—'}</td>
          </tr>`
          }
        )
        .join('')
      const html = `<!DOCTYPE html>
<html><head><title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; font-size: 12px; color: #0f172a; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 0 0 16px; color: #475569; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: 0.02em; }
</style></head><body>
  <h1>${title}</h1>
  <p>Warehouse: <strong>${warehouse || '—'}</strong> · Generated ${new Date().toLocaleString('en-GB')} · ${rows.length} item(s)</p>
  <table>
    <thead>
      <tr>
        <th>Item Code</th><th>Item Name</th><th>Qty (Units)</th><th>Packs</th><th>Item Group</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body></html>`
      const win = window.open('', '_blank', 'width=1100,height=800')
      if (!win) {
        toast.error('Pop-up blocked — allow pop-ups to download PDF')
        return
      }
      win.document.open()
      win.document.write(html)
      win.document.close()
      win.focus()
      win.print()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export PDF')
    } finally {
      setExporting(false)
    }
  }

  const renderStockQty = (item: StockLedgerItem) => {
    const packLabel = formatQty(item.pack_qty)
    const unitLabel = formatQty(item.unit_qty)
    const hasPack = packLabel != null && item.pack_uom
    const hasUnit = unitLabel != null && item.unit_uom

    if (hasPack || hasUnit) {
      return (
        <div className="text-right">
          {hasPack ? (
            <p className="text-sm font-semibold text-slate-900">
              {packLabel} <span className="font-medium text-slate-600">{item.pack_uom}</span>
            </p>
          ) : null}
          {hasUnit ? (
            <p className={`text-sm ${hasPack ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>
              {unitLabel} <span className="font-medium text-slate-600">{item.unit_uom}</span>
            </p>
          ) : null}
          <p className="text-xs text-slate-500 mt-0.5">
            {hasPack && hasUnit ? 'Packs · Units (dispense)' : hasUnit ? 'Units (dispense)' : 'Packs'}
          </p>
        </div>
      )
    }

    return (
      <div className="text-right">
        <p className="text-sm font-semibold text-slate-900">
          {formatQty(item.current_stock) ?? item.current_stock} {item.uom || 'Unit'}
        </p>
        <p className="text-xs text-slate-500">Qty in Stock</p>
      </div>
    )
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
          Choose a branch from the top navbar to view stock ledger.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {ledgerWarehouse ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div>
            Showing stock from{' '}
            {warehouseContext === 'laboratory' ? 'laboratory' : 'nurse'} mini warehouse{' '}
            <span className="font-semibold text-slate-900">{ledgerWarehouse}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void exportPdf()}
              disabled={loading || exporting || filteredItems.length === 0}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-300 rounded-md hover:bg-white bg-white text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              title="Download PDF"
            >
              <FileText className="w-3.5 h-3.5" />
              PDF
            </button>
            <button
              type="button"
              onClick={() => void exportExcel()}
              disabled={loading || exporting || filteredItems.length === 0}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-300 rounded-md hover:bg-white bg-white text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              title="Download Excel (CSV)"
            >
              <FileDown className="w-3.5 h-3.5" />
              Excel
            </button>
          </div>
        </div>
      ) : null}

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

      <div className="flex items-center justify-end">
        <FilterToggleButton active={showFilters} onClick={() => setShowFilters((prev) => !prev)} />
      </div>

      {showFilters && (
        <InventoryFilterBar onClear={clearFilters} hasActiveFilters={hasActiveFilters}>
          <FilterSearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search item name or code..."
          />
          {itemGroups.length > 0 ? (
            <FilterSelectField
              label="Item group"
              value={filterCategory}
              onChange={setFilterCategory}
              options={itemGroups}
            />
          ) : null}
          <FilterSelectField
            label="Stock status"
            value={stockStatusFilter}
            onChange={(value) => setStockStatusFilter(value as StockStatusFilter)}
            options={[
              { name: 'in_stock', label: 'In stock' },
              { name: 'low_stock', label: 'Low stock' },
              { name: 'out_of_stock', label: 'Out of stock' },
            ]}
          />
        </InventoryFilterBar>
      )}

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
          {hasActiveFilters && (
            <p className="text-xs text-slate-400 mt-1">Try adjusting your filters</p>
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
                    {renderStockQty(item)}
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
                        <label className="text-xs text-slate-500">Stock UOM qty</label>
                        <p className="text-slate-900 font-medium">
                          {formatQty(item.current_stock) ?? item.current_stock} {item.uom || '-'}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Packs</label>
                        <p className="text-slate-900 font-medium">
                          {item.pack_qty != null
                            ? `${formatQty(item.pack_qty)} ${item.pack_uom || 'PACK'}`
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Units (dispense)</label>
                        <p className="text-slate-900 font-medium">
                          {item.unit_qty != null
                            ? `${formatQty(item.unit_qty)} ${item.unit_uom || 'Unit'}`
                            : '—'}
                        </p>
                      </div>
                      {item.units_per_pack != null ? (
                        <div>
                          <label className="text-xs text-slate-500">Units per pack</label>
                          <p className="text-slate-900 font-medium">{formatQty(item.units_per_pack)}</p>
                        </div>
                      ) : null}
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
                        <p className="text-slate-900 font-medium">{item.last_updated ? new Date(item.last_updated).toLocaleDateString('en-GB') : '-'}</p>
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