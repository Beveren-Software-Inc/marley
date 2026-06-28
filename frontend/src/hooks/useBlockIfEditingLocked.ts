import { toast } from './useToast'
import { useCareContext } from '../providers/CareContextProvider'

/** Call at the start of update/save handlers for existing records. */
export function useBlockIfEditingLocked() {
  const { lockEditingData, editingLockMessage } = useCareContext()

  return () => {
    if (!lockEditingData) return
    const message =
      editingLockMessage ??
      'Editing is locked in Healthcare Settings. You can create new records but cannot modify existing data.'
    toast.error(message)
    throw new Error(message)
  }
}
