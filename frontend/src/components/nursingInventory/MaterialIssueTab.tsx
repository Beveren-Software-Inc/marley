import { useEffect, useMemo, useState } from 'react'
import { useCareContext } from '../../providers/CareContextProvider'
import { fetchMaterialIssues, type MaterialIssue } from '../../services/nursingInventory'
import { useMiniWarehouseContext } from './MiniWarehouseInventoryContext'
import {
  FilterToggleButton,
  InventoryFilterBar,
  FilterSearchInput,
  FilterDateField,
  FilterSelectField,
  collectUniqueStrings,
  matchesAnyItemQuery,
  matchesDateRange,
  matchesTextQuery,
} from './InventoryListFilters'
import { toast } from '../../hooks/useToast'
import { Eye, Package } from 'lucide-react'

interface MaterialIssueTabProps {
  onSuccess: () => void
  refreshKey?: number
  costCenter?: string
  isFullAccess?: boolean
}

export const MaterialIssueTab = ({
  refreshKey,
  costCenter: propCostCenter,
}: MaterialIssueTabProps) => {
  const warehouseContext = useMiniWarehouseContext()
  const { userCostCenter } = useCareContext()
  const effectiveCostCenter = propCostCenter || userCostCenter
  const [issues, setIssues] = useState<MaterialIssue[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<MaterialIssue | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filterSearch, setFilterSearch] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterItem, setFilterItem] = useState('')
  const [filterWarehouse, setFilterWarehouse] = useState('')

  const warehouseOptions = useMemo(
    () => collectUniqueStrings(issues.map((issue) => issue.from_warehouse)),
    [issues],
  )

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      const matchesSearch =
        matchesTextQuery(issue.name, filterSearch) ||
        matchesTextQuery(issue.issued_by, filterSearch) ||
        matchesTextQuery(issue.notes, filterSearch)
      const matchesDate = matchesDateRange(issue.issue_date, filterDateFrom, filterDateTo)
      const matchesItem = matchesAnyItemQuery(issue.items, filterItem)
      const matchesWarehouse = !filterWarehouse || issue.from_warehouse === filterWarehouse
      return matchesSearch && matchesDate && matchesItem && matchesWarehouse
    })
  }, [issues, filterSearch, filterDateFrom, filterDateTo, filterItem, filterWarehouse])

  const hasActiveFilters = Boolean(
    filterSearch || filterDateFrom || filterDateTo || filterItem || filterWarehouse,
  )

  const clearFilters = () => {
    setFilterSearch('')
    setFilterDateFrom('')
    setFilterDateTo('')
    setFilterItem('')
    setFilterWarehouse('')
  }

  useEffect(() => {
    if (effectiveCostCenter) {
      void loadIssues()
    }
  }, [effectiveCostCenter, refreshKey, warehouseContext])

  const loadIssues = async () => {
    if (!effectiveCostCenter) return
    setLoading(true)
    try {
      const data = await fetchMaterialIssues(effectiveCostCenter, warehouseContext)
      setIssues(data)
    } catch (error) {
      console.error('Failed to load material issues:', error)
      toast.error('Failed to load material issues')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Material Issues</h2>
        <FilterToggleButton active={showFilters} onClick={() => setShowFilters((prev) => !prev)} />
      </div>

      {showFilters && (
        <InventoryFilterBar onClear={clearFilters} hasActiveFilters={hasActiveFilters}>
          <FilterSearchInput
            value={filterSearch}
            onChange={setFilterSearch}
            placeholder="Search issue ID, user, notes..."
          />
          <FilterSearchInput
            value={filterItem}
            onChange={setFilterItem}
            placeholder="Filter by item name or code..."
            className="relative min-w-[180px] flex-1"
          />
          <FilterDateField label="Date from" value={filterDateFrom} onChange={setFilterDateFrom} />
          <FilterDateField label="Date to" value={filterDateTo} onChange={setFilterDateTo} />
          {warehouseOptions.length > 0 ? (
            <FilterSelectField
              label="Warehouse"
              value={filterWarehouse}
              onChange={setFilterWarehouse}
              options={warehouseOptions}
            />
          ) : null}
        </InventoryFilterBar>
      )}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Issue history</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-500">
              {issues.length === 0 ? 'No material issues found' : 'No material issues match your filters'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredIssues.map((issue) => (
              <div key={issue.name} className="p-4 hover:bg-slate-50 transition">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{issue.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {issue.issue_date} · {issue.from_warehouse}
                    </p>
                    <p className="text-xs text-slate-500">
                      By {issue.issued_by} · {issue.items?.length || 0} item(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {typeof issue.total_amount === 'number' ? (
                      <div className="text-right">
                        <div className="text-sm font-bold text-primary">{issue.total_amount.toLocaleString()}</div>
                        <div className="text-xs text-slate-500">Value</div>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelected(issue)}
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

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900">Material issue details</h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Issue ID</p>
                  <p className="font-medium">{selected.name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Date</p>
                  <p>{selected.issue_date}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Warehouse</p>
                  <p>{selected.from_warehouse}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Issued By</p>
                  <p>{selected.issued_by}</p>
                </div>
              </div>
              {selected.notes ? (
                <div>
                  <p className="text-xs text-slate-500">Notes</p>
                  <p className="text-sm">{selected.notes}</p>
                </div>
              ) : null}
              <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-left">UOM</th>
                    <th className="px-3 py-2 text-left">Batch</th>
                    <th className="px-3 py-2 text-left">Lot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(selected.items || []).map((item, idx) => (
                    <tr key={`${item.item_code}-${idx}`}>
                      <td className="px-3 py-2">{item.item_name || item.item_code}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2">{item.uom || '—'}</td>
                      <td className="px-3 py-2">{item.batch_number || '—'}</td>
                      <td className="px-3 py-2">{item.dispensing_lot || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
