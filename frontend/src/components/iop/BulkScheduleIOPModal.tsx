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
  createIOPDaysBulk,
  fetchIOPHealthcareServiceTemplates,
  fetchCompanies,
  type IOPHealthcareServiceTemplate,
} from '../../services/iop'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'

interface BulkScheduleIOPModalProps {
  onClose: () => void
  onSuccess: () => void
}

type SessionRow = { session_type: string }

// value = Python date.weekday(): Mon=0 … Sun=6
const WEEKDAYS = [
  { label: 'Mon', value: 0 },
  { label: 'Tue', value: 1 },
  { label: 'Wed', value: 2 },
  { label: 'Thu', value: 3 },
  { label: 'Fri', value: 4 },
  { label: 'Sat', value: 5 },
  { label: 'Sun', value: 6 },
]

const today = () => new Date().toISOString().split('T')[0]
const inDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export const BulkScheduleIOPModal = ({ onClose, onSuccess }: BulkScheduleIOPModalProps) => {
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(() => inDays(13))
  const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4]) // Mon–Fri by default
  const [sessions, setSessions] = useState<SessionRow[]>([{ session_type: '' }])
  const [sessionTemplates, setSessionTemplates] = useState<IOPHealthcareServiceTemplate[]>([])
  const [defaultCompany, setDefaultCompany] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchIOPHealthcareServiceTemplates().then(setSessionTemplates).catch(() => setSessionTemplates([]))
    fetchCompanies()
      .then((companies) => {
        if (companies.length > 0) setDefaultCompany(companies[0].name)
      })
      .catch(() => setDefaultCompany(''))
  }, [])

  const toggleWeekday = (value: number) => {
    setWeekdays((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }
  const addSession = () => setSessions((prev) => [...prev, { session_type: '' }])
  const updateSession = (idx: number, session_type: string) =>
    setSessions((prev) => prev.map((r, i) => (i === idx ? { session_type } : r)))
  const removeSession = (idx: number) => setSessions((prev) => prev.filter((_, i) => i !== idx))

  // Preview count of dates that will be scheduled (before de-duplication server-side)
  const matchingDates = useMemo(() => {
    if (!startDate || !endDate || endDate < startDate || weekdays.length === 0) return 0
    let count = 0
    const d = new Date(startDate + 'T00:00:00')
    const end = new Date(endDate + 'T00:00:00')
    while (d <= end) {
      const py = (d.getDay() + 6) % 7 // JS Sun=0..Sat=6 → Python Mon=0..Sun=6
      if (weekdays.includes(py)) count++
      d.setDate(d.getDate() + 1)
    }
    return count
  }, [startDate, endDate, weekdays])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!startDate || !endDate) {
      setError('Start and end date are required')
      return
    }
    if (endDate < startDate) {
      setError('End date must be on or after the start date')
      return
    }
    if (weekdays.length === 0) {
      setError('Select at least one weekday')
      return
    }
    const validSessions = sessions.filter((s) => s.session_type)
    if (validSessions.length === 0) {
      setError('Add at least one session with a Healthcare Service')
      return
    }
    try {
      setLoading(true)
      const result = await createIOPDaysBulk({
        start_date: startDate,
        end_date: endDate,
        weekdays,
        company: defaultCompany || undefined,
        sessions: validSessions.map((s) => ({ session_type: s.session_type })),
      })
      const skipped = result.skipped_existing?.length ?? 0
      toast.success(
        `${result.count} IOP day${result.count === 1 ? '' : 's'} created` +
          (skipped ? ` · ${skipped} skipped (already existed)` : ''),
      )
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to bulk-schedule IOP days'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-lg w-full max-h-[90vh] overflow-y-auto')}>
        <CreateModalHeader title="Bulk Schedule IOP Days" onClose={onClose} />

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">From <span className="text-red-500">*</span></label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">To <span className="text-red-500">*</span></label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" required />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Days of week</label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const on = weekdays.includes(d.value)
                return (
                  <button key={d.value} type="button" onClick={() => toggleWeekday(d.value)}
                    className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                      on ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}>
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">Sessions (applied to every day)</label>
              <button type="button" onClick={addSession} className="text-sm text-primary hover:underline">+ Add session</button>
            </div>
            <div className="space-y-2">
              {sessions.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 border border-slate-200 rounded-md">
                  <IOPHealthcareServiceTemplateSelect
                    value={row.session_type}
                    onChange={(value) => updateSession(idx, value)}
                    templates={sessionTemplates}
                    onTemplatesUpdated={setSessionTemplates}
                    className="flex-1 min-w-0"
                    placeholder="Select healthcare service..."
                  />
                  <button type="button" onClick={() => removeSession(idx)} className="text-slate-500 hover:text-red-600 p-1 shrink-0" title="Remove">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="text-sm text-slate-500">
            {matchingDates > 0
              ? `Will create up to ${matchingDates} IOP day${matchingDates === 1 ? '' : 's'} (existing dates are skipped).`
              : 'No dates match the selected range and weekdays.'}
          </div>

          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>Cancel</button>
            <button type="submit" disabled={loading || matchingDates === 0} className={CM_BTN_PRIMARY}>
              {loading ? 'Scheduling…' : 'Schedule IOP Days'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}
