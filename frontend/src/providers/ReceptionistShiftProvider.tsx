import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthProvider'
import {
  closeReceptionistShift,
  fetchReceptionistShiftContext,
  openReceptionistShift,
  type ReceptionistShiftContext,
} from '../services/receptionistShift'
import { toast } from '../hooks/useToast'

type ReceptionistShiftContextValue = {
  context: ReceptionistShiftContext | null
  loading: boolean
  submitting: boolean
  shiftRequired: boolean
  mustOpenShift: boolean
  refresh: () => Promise<void>
  openShift: (openingNotes?: string) => Promise<void>
  closeShift: (closingNotes?: string) => Promise<void>
}

const ShiftContext = createContext<ReceptionistShiftContextValue | null>(null)

export function useReceptionistShift() {
  return useContext(ShiftContext)
}

function ReceptionistShiftGateModal({
  submitting,
  notes,
  onNotesChange,
  onOpen,
}: {
  submitting: boolean
  notes: string
  onNotesChange: (value: string) => void
  onOpen: () => void
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4">
      <div
        data-healthcare-modal
        className="w-full max-w-md rounded-lg bg-white text-slate-900 shadow-2xl"
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Open Reception Shift</h2>
          <p className="mt-1 text-sm text-slate-600">
            You must open a shift before using the healthcare portal.
          </p>
        </div>
        <div className="px-5 py-4">
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Opening Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Handover notes, cash float, etc."
          />
        </div>
        <div className="flex justify-end border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onOpen}
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? 'Opening…' : 'Open Shift'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ReceptionistShiftProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [context, setContext] = useState<ReceptionistShiftContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [gateNotes, setGateNotes] = useState('')

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setContext(null)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const next = await fetchReceptionistShiftContext()
      setContext(next)
    } catch (err) {
      console.error('Failed to load receptionist shift context:', err)
      setContext(null)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (authLoading) return
    void refresh()
  }, [authLoading, refresh])

  const shiftRequired = Boolean(context?.shift_required)
  const mustOpenShift = shiftRequired && !context?.open_shift

  const openShift = useCallback(
    async (openingNotes?: string) => {
      if (!context) return
      try {
        setSubmitting(true)
        await openReceptionistShift({
          opening_notes: openingNotes?.trim() || undefined,
          company: context.company,
          cost_center: context.cost_center,
        })
        toast.success('Reception shift opened')
        setGateNotes('')
        await refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to open shift')
        throw err
      } finally {
        setSubmitting(false)
      }
    },
    [context, refresh]
  )

  const closeShift = useCallback(
    async (closingNotes?: string) => {
      try {
        setSubmitting(true)
        await closeReceptionistShift({
          name: context?.open_shift?.name,
          closing_notes: closingNotes?.trim() || undefined,
        })
        toast.success('Reception shift closed')
        await refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to close shift')
        throw err
      } finally {
        setSubmitting(false)
      }
    },
    [context?.open_shift?.name, refresh]
  )

  const value = useMemo(
    () => ({
      context,
      loading: authLoading || loading,
      submitting,
      shiftRequired,
      mustOpenShift,
      refresh,
      openShift,
      closeShift,
    }),
    [
      context,
      authLoading,
      loading,
      submitting,
      shiftRequired,
      mustOpenShift,
      refresh,
      openShift,
      closeShift,
    ]
  )

  return (
    <ShiftContext.Provider value={value}>
      {children}
      {!authLoading && !loading && mustOpenShift ? (
        <ReceptionistShiftGateModal
          submitting={submitting}
          notes={gateNotes}
          onNotesChange={setGateNotes}
          onOpen={() => void openShift(gateNotes)}
        />
      ) : null}
    </ShiftContext.Provider>
  )
}
