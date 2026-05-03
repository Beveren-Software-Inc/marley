import { useState, useEffect } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { createIOPDay, fetchIOPSessionTypes, fetchCompanies, fetchCostCenters, type IOPSessionType } from '../../services/iop'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'

interface CreateIOPDayModalProps {
  onClose: () => void
  onSuccess: () => void
}

type SessionRow = { session_type: string; from_time: string; to_time: string }

export const CreateIOPDayModal = ({ onClose, onSuccess }: CreateIOPDayModalProps) => {
  const [posting_date, setPostingDate] = useState(() => new Date().toISOString().split('T')[0])
  const [company, setCompany] = useState('')
  const [cost_center, setCostCenter] = useState('')
  const [sessions, setSessions] = useState<SessionRow[]>([{ session_type: '', from_time: '', to_time: '' }])
  const [sessionTypes, setSessionTypes] = useState<IOPSessionType[]>([])
  const [companies, setCompanies] = useState<{ name: string }[]>([])
  const [costCenters, setCostCenters] = useState<{ name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchIOPSessionTypes().then(setSessionTypes).catch(() => setSessionTypes([]))
    fetchCompanies().then(setCompanies).catch(() => setCompanies([]))
    fetchCostCenters().then(setCostCenters).catch(() => setCostCenters([]))
  }, [])

  const addSession = () => {
    setSessions((prev) => [...prev, { session_type: '', from_time: '', to_time: '' }])
  }

  const updateSession = (idx: number, field: keyof SessionRow, value: string) => {
    setSessions((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const removeSession = (idx: number) => {
    setSessions((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!posting_date) {
      setError('Date is required')
      return
    }
    const validSessions = sessions.filter((s) => s.session_type)
    if (validSessions.length === 0) {
      setError('Add at least one session with Session Type')
      return
    }
    try {
      setLoading(true)
      await createIOPDay({
        posting_date,
        company: company || undefined,
        cost_center: cost_center || undefined,
        sessions: validSessions.map((s) => ({
          session_type: s.session_type,
          from_time: s.from_time || undefined,
          to_time: s.to_time || undefined
        }))
      })
      toast.success('IOP Day created')
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create IOP Day')
      toast.error(err instanceof Error ? err.message : 'Failed to create IOP Day')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-lg w-full max-h-[90vh] overflow-y-auto')}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-emerald-950">Create IOP Day</h2>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={posting_date}
              onChange={(e) => setPostingDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Company</label>
              <select
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                <option value="">Select company</option>
                {companies.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cost Center</label>
              <select
                value={cost_center}
                onChange={(e) => setCostCenter(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                <option value="">Select cost center</option>
                {costCenters.map((cc) => (
                  <option key={cc.name} value={cc.name}>{cc.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">Sessions</label>
              <button type="button" onClick={addSession} className="text-sm text-primary hover:underline">
                + Add session
              </button>
            </div>
            <div className="space-y-2">
              {sessions.map((row, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 p-2 border border-slate-200 rounded-md">
                  <select
                    value={row.session_type}
                    onChange={(e) => updateSession(idx, 'session_type', e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm flex-1 min-w-[120px]"
                  >
                    <option value="">Select type</option>
                    {sessionTypes.map((st) => (
                      <option key={st.name} value={st.name}>{st.session_type_name || st.name}</option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={row.from_time}
                    onChange={(e) => updateSession(idx, 'from_time', e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm w-28"
                    placeholder="From"
                  />
                  <input
                    type="time"
                    value={row.to_time}
                    onChange={(e) => updateSession(idx, 'to_time', e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm w-28"
                    placeholder="To"
                  />
                  <button
                    type="button"
                    onClick={() => removeSession(idx)}
                    className="text-slate-500 hover:text-red-600 p-1"
                    title="Remove"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={CM_BTN_PRIMARY}>
              {loading ? 'Creating…' : 'Create IOP Day'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
