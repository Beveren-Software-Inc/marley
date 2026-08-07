import { useEffect, useState } from 'react'
import {
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { fetchInpatientAdmissions, type LinkFieldOption } from '../../services/common'
import {
  createSleepingPattern,
  inputDateTimeToFrappe,
} from '../../services/sleepingPattern'
import { toast } from '../../hooks/useToast'

interface CreateSleepingPatternModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
}

export const CreateSleepingPatternModal = ({
  onClose,
  onSuccess,
  initialPatient,
}: CreateSleepingPatternModalProps) => {
  const [admissions, setAdmissions] = useState<LinkFieldOption[]>([])
  const [admissionNo, setAdmissionNo] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [morningFrom, setMorningFrom] = useState('')
  const [morningTo, setMorningTo] = useState('')
  const [eveningFrom, setEveningFrom] = useState('')
  const [eveningTo, setEveningTo] = useState('')
  const [nightFrom, setNightFrom] = useState('')
  const [nightTo, setNightTo] = useState('')
  const [sleepComment, setSleepComment] = useState('')

  useEffect(() => {
    const loadAdmissions = async () => {
      if (!initialPatient) return
      try {
        const opts = await fetchInpatientAdmissions(initialPatient)
        setAdmissions(opts)
        if (opts.length > 0) {
          setAdmissionNo(opts[0].name)
        }
      } catch (err) {
        console.error('Failed to load inpatient admissions for sleeping pattern', err)
      }
    }
    loadAdmissions()
  }, [initialPatient])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!admissionNo) {
      setError('Admission No is required')
      return
    }
    try {
      setLoading(true)
      setError(null)
      await createSleepingPattern({
        admission_no: admissionNo,
        date,
        morning_from: inputDateTimeToFrappe(morningFrom),
        morning_to: inputDateTimeToFrappe(morningTo),
        evening_from: inputDateTimeToFrappe(eveningFrom),
        evening_to: inputDateTimeToFrappe(eveningTo),
        night_from: inputDateTimeToFrappe(nightFrom),
        night_to: inputDateTimeToFrappe(nightTo),
        sleep_comment: sleepComment.trim() || undefined,
        patient: initialPatient,
      })
      toast.success('Sleeping Pattern created')
      onSuccess?.()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create Sleeping Pattern'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-lg w-full max-h-[90vh] overflow-y-auto')}>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-emerald-950">Create Sleeping Pattern</h2>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Admission No <span className="text-red-500">*</span>
              </label>
              <select
                value={admissionNo}
                onChange={(e) => setAdmissionNo(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select admission...</option>
                {admissions.map((adm) => (
                  <option key={adm.name} value={adm.name}>
                    {adm.label || adm.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Date
              </label>
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
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-3 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

