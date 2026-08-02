import { useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { scheduleObservationDischarge, type Observation } from '../../services/observations'
import { toast } from '../../hooks/useToast'

interface ScheduleObservationDischargeModalProps {
  observation: Observation
  onClose: () => void
  onSuccess?: () => void
}

export function ScheduleObservationDischargeModal({
  observation,
  onClose,
  onSuccess,
}: ScheduleObservationDischargeModalProps) {
  const [dcDate, setDcDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dcDate) {
      setError('DC date is required')
      return
    }

    try {
      setLoading(true)
      setError(null)
      await scheduleObservationDischarge(observation.name, dcDate)
      toast.success('Observation discharge scheduled')
      onSuccess?.()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to schedule discharge'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-md w-full')}>
        <CreateModalHeader
          title="Schedule observation discharge"
          subtitle={`${observation.trans_no || observation.name}`}
          onClose={onClose}
        />
        <form onSubmit={handleSubmit} className={`${CREATE_MODAL_BODY_GRADIENT} space-y-4 p-6`}>
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <p className="text-sm text-slate-600">
            Sets the observation discharge (DC) date.
          </p>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              DC date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={dcDate}
              onChange={(e) => setDcDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={CM_BTN_PRIMARY}>
              {loading ? 'Saving…' : 'Schedule discharge'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}
