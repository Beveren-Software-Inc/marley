import { toast } from './useToast'
import { useCareContext } from '../providers/CareContextProvider'

/** Call at the start of create/save handlers tied to the header OP visit or IP admission. */
export function useBlockIfActiveCareClosed() {
  const { isActiveCareEpisodeClosed, activeCareBlockReason } = useCareContext()

  return () => {
    if (!isActiveCareEpisodeClosed) return
    const message =
      activeCareBlockReason ??
      'This visit or admission is closed. Select or create an open OP visit or active IP admission.'
    toast.error(message)
    throw new Error(message)
  }
}
