import { useState, useEffect, useMemo } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { IOPHealthcareServiceTemplateSelect } from '../ui/IOPHealthcareServiceTemplateSelect'
import {
  fetchIOPDayWithSessions,
  fetchIOPHealthcareServiceTemplates,
  updateIOPDay,
  type IOPHealthcareServiceTemplate,
} from '../../services/iop'
import { useFormatMoney } from '../../hooks/useFormatMoney'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'
import { DateFilterInput } from '../ui/DateFilterInput'

interface EditIOPDayModalProps {
  iopDayName: string
  onClose: () => void
  onSuccess: () => void
}

type SessionRow = { session_type: string }

function sessionRate(templates: IOPHealthcareServiceTemplate[], sessionType: string): number {
  const match = templates.find((t) => t.name === sessionType)
  return Number(match?.rate ?? 0)
}

export const EditIOPDayModal = ({ iopDayName, onClose, onSuccess }: EditIOPDayModalProps) => {
  const formatMoney = useFormatMoney()
  const [postingDate, setPostingDate] = useState('')
  const [sessions, setSessions] = useState<SessionRow[]>([{ session_type: '' }])
  const [sessionTemplates, setSessionTemplates] = useState<IOPHealthcareServiceTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [day, templates] = await Promise.all([
          fetchIOPDayWithSessions(iopDayName),
          fetchIOPHealthcareServiceTemplates(),
        ])
        if (cancelled) return
        setPostingDate(day.posting_date || '')
        setSessionTemplates(templates)
        const rows = (day.sessions || []).map((s) => ({ session_type: s.session_type || '' }))
        setSessions(rows.length > 0 ? rows : [{ session_type: '' }])
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load IOP Day')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [iopDayName])

  const sessionsTotal = useMemo(
    () =>
      sessions.reduce(
        (sum, row) => sum + (row.session_type ? sessionRate(sessionTemplates, row.session_type) : 0),
        0,
      ),
    [sessions, sessionTemplates],
  )

  const addSession = () => {
    setSessions((prev) => [...prev, { session_type: '' }])
  }

  const updateSession = (idx: number, session_type: string) => {
    setSessions((prev) => {
      const next = [...prev]
      next[idx] = { session_type }
      return next
    })
  }

  const removeSession = (idx: number) => {
    setSessions((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!postingDate) {
      setError('Date is required')
      return
    }
    const validSessions = sessions.filter((s) => s.session_type)
    if (validSessions.length === 0) {
      setError('Add at least one session with a Healthcare Service')
      return
    }
    try {
      setSaving(true)
      await updateIOPDay(iopDayName, {
        posting_date: postingDate,
        sessions: validSessions.map((s) => ({ session_type: s.session_type })),
      })
      toast.success('IOP Day updated')
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update IOP Day')
      toast.error(err instanceof Error ? err.message : 'Failed to update IOP Day')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-lg w-full max-h-[90vh] overflow-y-auto')}>
        <CreateModalHeader title="Edit IOP Day" onClose={onClose} />

        {loading ? (
          <div className="p-6 text-sm text-slate-600">Loading IOP Day…</div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <DateFilterInput
                value={postingDate}
                onChange={(e) => setPostingDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-700">Sessions</label>
                <button type="button" onClick={addSession} className="text-sm text-primary hover:underline">
                  + Add session
                </button>
              </div>
              <div className="space-y-2">
                {sessions.map((row, idx) => {
                  const rate = row.session_type ? sessionRate(sessionTemplates, row.session_type) : 0
                  return (
                    <div key={idx} className="flex items-center gap-2 p-2 border border-slate-200 rounded-md">
                      <IOPHealthcareServiceTemplateSelect
                        value={row.session_type}
                        onChange={(value) => updateSession(idx, value)}
                        templates={sessionTemplates}
                        onTemplatesUpdated={setSessionTemplates}
                        className="flex-1 min-w-0"
                        placeholder="Select healthcare service..."
                      />
                      {row.session_type ? (
                        <span className="text-sm font-medium text-slate-700 tabular-nums shrink-0">
                          {formatMoney(rate)}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeSession(idx)}
                        className="text-slate-500 hover:text-red-600 p-1 shrink-0"
                        title="Remove"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
              {sessionsTotal > 0 ? (
                <div className="mt-2 text-right text-sm font-medium text-slate-700">
                  Day total: <span className="tabular-nums">{formatMoney(sessionsTotal)}</span>
                </div>
              ) : null}
            </div>
            <CreateModalFooter>
              <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className={CM_BTN_PRIMARY}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </CreateModalFooter>
          </form>
        )}
      </div>
    </div>
  )
}
