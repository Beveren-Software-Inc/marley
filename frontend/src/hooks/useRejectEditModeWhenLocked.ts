import { useEffect } from 'react'
import { toast } from './useToast'
import { useCareContext } from '../providers/CareContextProvider'

/** Close edit modals when Healthcare Settings lock is enabled. */
export function useRejectEditModeWhenLocked(
  editMode: boolean | undefined,
  onClose: () => void,
) {
  const { lockEditingData, editingLockMessage } = useCareContext()

  useEffect(() => {
    if (!editMode || !lockEditingData) return
    toast.error(
      editingLockMessage ??
        'Editing is locked in Healthcare Settings. You can create new records but cannot modify existing data.',
    )
    onClose()
  }, [editMode, lockEditingData, editingLockMessage, onClose])
}
