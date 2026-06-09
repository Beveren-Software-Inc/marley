import { canEditLabTestResults } from '../../config/permissions'
import { useCareContext } from '../../providers/CareContextProvider'

export type LabTestResultsSaveHeaderProps = {
  pendingCount: number
  batchSaving: boolean
  onSave: () => void | Promise<void>
}

export function LabTestResultsSaveHeader({
  pendingCount,
  batchSaving,
  onSave,
}: LabTestResultsSaveHeaderProps) {
  const { userRole } = useCareContext()
  const canEdit = canEditLabTestResults(userRole)

  if (!canEdit) return null

  return (
    <button
      type="button"
      disabled={batchSaving || pendingCount === 0}
      onClick={() => void onSave()}
      className="px-3 py-1 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
      title={pendingCount === 0 ? 'Edit results in the table, then save' : `Save ${pendingCount} changed result(s)`}
    >
      {batchSaving ? 'Saving…' : pendingCount > 0 ? `Save (${pendingCount})` : 'Save'}
    </button>
  )
}
