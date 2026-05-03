import { useState } from 'react'
import {
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { apiRequest } from '../../services/apiClient'
import { toast } from '../../hooks/useToast'

interface CreateHealthcareActivityModalProps {
  onClose: () => void
  onSuccess: (activityName: string, label: string) => void
}

export const CreateHealthcareActivityModal = ({ onClose, onSuccess }: CreateHealthcareActivityModalProps) => {
  const [activityType, setActivityType] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!activityType.trim()) {
      setError('Activity Type is required')
      return
    }

    try {
      setSubmitting(true)
      const payload = {
        doctype: 'Healthcare Activity',
        activity: activityType.trim(),
        description: description.trim() || undefined,
      }
      const created = await apiRequest<{ name: string }>(
        '/api/resource/Healthcare%20Activity',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      )
      const name = created?.name
      if (!name) {
        throw new Error('Activity created but no name returned')
      }
      toast.success('Healthcare Activity created')
      onSuccess(name, activityType.trim())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create Healthcare Activity')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-md w-full max-h-[90vh]')}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Create Healthcare Activity</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {error && (
            <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm text-slate-800">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Activity Type <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={activityType}
                onChange={(e) => setActivityType(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. Vital Signs, Wound Dressing"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Optional description for this activity"
              />
            </div>
          </div>

          <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={CM_BTN_PRIMARY}
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

