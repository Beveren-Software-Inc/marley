import { useEffect, useState } from 'react'
import { useCareContext } from '../../providers/CareContextProvider'
import { getAllCostCenters } from '../../services/nursingInventory'
import { useMiniWarehouseContext } from './MiniWarehouseInventoryContext'

interface InventoryBranchFieldProps {
  costCenter?: string
  isFullAccess?: boolean
  value: string
  onChange: (branch: string) => void
}

/** Branch selector for inventory modals — maps to Stock Entry cost_center. */
export function useInventoryBranch(costCenter?: string, isFullAccess?: boolean) {
  const { userCostCenter } = useCareContext()
  const warehouseContext = useMiniWarehouseContext()
  const [selectedBranch, setSelectedBranch] = useState(costCenter || userCostCenter || '')
  const [branchOptions, setBranchOptions] = useState<{ name: string; label: string }[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)

  useEffect(() => {
    setSelectedBranch(costCenter || userCostCenter || '')
  }, [costCenter, userCostCenter])

  useEffect(() => {
    if (!isFullAccess) return
    setLoadingBranches(true)
    void getAllCostCenters(warehouseContext)
      .then((rows) => setBranchOptions(rows))
      .catch((error) => console.error('Failed to load branches:', error))
      .finally(() => setLoadingBranches(false))
  }, [isFullAccess, warehouseContext])

  const effectiveBranch = selectedBranch || costCenter || userCostCenter || ''

  return {
    selectedBranch: effectiveBranch,
    setSelectedBranch,
    branchOptions,
    loadingBranches,
  }
}

export function InventoryBranchField({
  costCenter,
  isFullAccess,
  value,
  onChange,
}: InventoryBranchFieldProps) {
  const { userCostCenter } = useCareContext()
  const warehouseContext = useMiniWarehouseContext()
  const [branchOptions, setBranchOptions] = useState<{ name: string; label: string }[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)

  useEffect(() => {
    if (!isFullAccess) return
    setLoadingBranches(true)
    void getAllCostCenters(warehouseContext)
      .then((rows) => setBranchOptions(rows))
      .catch((error) => console.error('Failed to load branches:', error))
      .finally(() => setLoadingBranches(false))
  }, [isFullAccess, warehouseContext])

  const displayValue = value || costCenter || userCostCenter || ''

  if (isFullAccess) {
    return (
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Branch <span className="text-red-500">*</span>
        </label>
        {loadingBranches ? (
          <div className="text-sm text-slate-500 py-2">Loading branches…</div>
        ) : (
          <select
            value={displayValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          >
            <option value="">Select branch…</option>
            {branchOptions.map((row) => (
              <option key={row.name} value={row.name}>
                {row.label || row.name}
              </option>
            ))}
          </select>
        )}
        <p className="text-xs text-slate-400 mt-1">Saved on Stock Entry as cost center / branch.</p>
      </div>
    )
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        Branch <span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        value={displayValue}
        readOnly
        disabled
        className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
      />
    </div>
  )
}
