import { useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { apiRequest } from '../../services/apiClient'

interface CreateClinicalNoteTypeModalProps {
  onClose: () => void
  onSuccess?: (created: { name: string; clinical_note_type: string }) => void
}

export const CreateClinicalNoteTypeModal = ({
  onClose,
  onSuccess,
}: CreateClinicalNoteTypeModalProps) => {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('Clinical Note Type is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const created = await apiRequest<{ name: string; clinical_note_type: string }>(
        '/api/resource/Clinical%20Note%20Type',
        {
          method: 'POST',
          body: JSON.stringify({
            clinical_note_type: name.trim(),
          }),
        }
      )

      if (onSuccess) {
        onSuccess(created)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create clinical note type')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-md w-full')}>
        <CreateModalHeader title="Create Clinical Note Type" onClose={onClose} />


        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Clinical Note Type <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g. Progress Note, Discharge Summary"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={CM_BTN_CANCEL}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={CM_BTN_PRIMARY}
            >
              {loading ? 'Creating...' : 'Create Type'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

