import { useEffect, useState } from 'react'
import { useCareContext } from '../../providers/CareContextProvider'

interface InventoryBranchFieldProps {
  costCenter?: string
  /** @deprecated Local inventory branch override removed — global navbar branch applies. */
  isFullAccess?: boolean
  value?: string
  onChange?: (branch: string) => void
}

/** Branch from the global navbar filter — maps to Stock Entry cost_center. */
export function useInventoryBranch(costCenter?: string, _isFullAccess?: boolean) {
  const { userCostCenter } = useCareContext()
  const effectiveBranch = costCenter || userCostCenter || ''
  const [selectedBranch, setSelectedBranch] = useState(effectiveBranch)

  useEffect(() => {
    setSelectedBranch(costCenter || userCostCenter || '')
  }, [costCenter, userCostCenter])

  return {
    selectedBranch: selectedBranch || effectiveBranch,
    setSelectedBranch,
    branchOptions: [] as { name: string; label: string }[],
    loadingBranches: false,
  }
}

export function InventoryBranchField({
  costCenter,
  value,
}: InventoryBranchFieldProps) {
  const { userCostCenter } = useCareContext()
  const displayValue = value || costCenter || userCostCenter || ''

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        Branch <span className="text-red-500">*</span>
      </label>
      {displayValue ? (
        <input
          type="text"
          value={displayValue}
          readOnly
          disabled
          className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
        />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No branch selected. Choose a branch from the top navbar.
        </div>
      )}
      <p className="text-xs text-slate-400 mt-1">
        Uses the global branch filter from the top navbar.
      </p>
    </div>
  )
}
