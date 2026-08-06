import { useEffect, useState } from 'react'
import {
  CREATE_MODAL_OVERLAY,
  CM_BTN_OUTLINE_CANCEL,
  CM_BTN_OUTLINE_SAVE,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  frappeDateTimeToInput,
  inputDateTimeToFrappe,
  updateSleepingPattern,
  type SleepingPattern,
} from '../../services/sleepingPattern'
import { toast } from '../../hooks/useToast'
import { useRejectEditModeWhenLocked } from '../../hooks/useRejectEditModeWhenLocked'
import { useBlockIfEditingLocked } from '../../hooks/useBlockIfEditingLocked'

interface EditSleepingPatternModalProps {
  row: SleepingPattern
  onClose: () => void
  onSuccess?: () => void
}

export const EditSleepingPatternModal = ({
  row,
  onClose,
  onSuccess,
}: EditSleepingPatternModalProps) => {
  useRejectEditModeWhenLocked(true, onClose)
  const blockIfEditingLocked = useBlockIfEditingLocked()

  const [date, setDate] = useState(() => row.date?.slice(0, 10) || '')
  const [morningFrom, setMorningFrom] = useState(() => frappeDateTimeToInput(row.morning_from))
  const [morningTo, setMorningTo] = useState(() => frappeDateTimeToInput(row.morning_to))
  const [eveningFrom, setEveningFrom] = useState(() => frappeDateTimeToInput(row.evening_from))
  const [eveningTo, setEveningTo] = useState(() => frappeDateTimeToInput(row.evening_to))
  const [nightFrom, setNightFrom] = useState(() => frappeDateTimeToInput(row.night_from))
  const [nightTo, setNightTo] = useState(() => frappeDateTimeToInput(row.night_to))
  const [sleepComment, setSleepComment] = useState(() => row.sleep_comment || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDate(row.date?.slice(0, 10) || '')
    setMorningFrom(frappeDateTimeToInput(row.morning_from))
    setMorningTo(frappeDateTimeToInput(row.morning_to))
    setEveningFrom(frappeDateTimeToInput(row.evening_from))
    setEveningTo(frappeDateTimeToInput(row.evening_to))
    setNightFrom(frappeDateTimeToInput(row.night_from))
    setNightTo(frappeDateTimeToInput(row.night_to))
    setSleepComment(row.sleep_comment || '')
  }, [row])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    blockIfEditingLocked()
    try {
      setLoading(true)
      setError(null)
      await updateSleepingPattern({
        name: row.name,
        date: date || undefined,
        morning_from: inputDateTimeToFrappe(morningFrom) ?? null,
        morning_to: inputDateTimeToFrappe(morningTo) ?? null,
        evening_from: inputDateTimeToFrappe(eveningFrom) ?? null,
        evening_to: inputDateTimeToFrappe(eveningTo) ?? null,
        night_from: inputDateTimeToFrappe(nightFrom) ?? null,
        night_to: inputDateTimeToFrappe(nightTo) ?? null,
        sleep_comment: sleepComment.trim() || null,
      })
      toast.success('Sleeping Pattern updated')
      onSuccess?.()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update Sleeping Pattern'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-lg w-full max-h-[90vh] overflow-y-auto')}>
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Edit Sleeping Pattern</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {row.patient_name || row.file_no || '—'} · {row.admission_no || '—'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error ? (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs font-medium text-slate-500">Patient</div>
              <div className="text-slate-900">{row.patient_name || row.file_no || '—'}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Admission</div>
              <div className="text-slate-900">{row.admission_no || '—'}</div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="pt-2 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Sleeping Periods</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs font-medium text-slate-600 mb-1">Morning</div>
                <div className="space-y-2">
                  <input
                    type="datetime-local"
                    value={morningFrom}
                    onChange={(e) => setMorningFrom(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  />
                  <input
                    type="datetime-local"
                    value={morningTo}
                    onChange={(e) => setMorningTo(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-600 mb-1">Evening</div>
                <div className="space-y-2">
                  <input
                    type="datetime-local"
                    value={eveningFrom}
                    onChange={(e) => setEveningFrom(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  />
                  <input
                    type="datetime-local"
                    value={eveningTo}
                    onChange={(e) => setEveningTo(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-600 mb-1">Night</div>
                <div className="space-y-2">
                  <input
                    type="datetime-local"
                    value={nightFrom}
                    onChange={(e) => setNightFrom(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  />
                  <input
                    type="datetime-local"
                    value={nightTo}
                    onChange={(e) => setNightTo(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200">
            <label className="block text-sm font-medium text-slate-700 mb-1">Comment</label>
            <textarea
              value={sleepComment}
              onChange={(e) => setSleepComment(e.target.value)}
              rows={3}
              placeholder="Sleep notes…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={loading} className={CM_BTN_OUTLINE_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={CM_BTN_OUTLINE_SAVE}>
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
