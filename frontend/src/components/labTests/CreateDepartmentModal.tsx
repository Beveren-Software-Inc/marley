import { useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { apiRequest } from '../../services/apiClient'

interface CreateDepartmentModalProps {
  onClose: () => void
  onSuccess?: (created: { name: string; department: string }) => void
}

export const CreateDepartmentModal = ({ onClose, onSuccess }: CreateDepartmentModalProps) => {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('Department name is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const created = await apiRequest<{ name: string; department: string }>(
        '/api/resource/Medical%20Department',
        {
          method: 'POST',
          body: JSON.stringify({
            department: name.trim(),
          }),
        }
      )

      if (onSuccess) {
        onSuccess(created)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create department')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-md w-full')}>
        <CreateModalHeader title="Create Medical Department" onClose={onClose} />


        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Department <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g. Laboratory, Radiology, Pathology"
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
              {loading ? 'Creating...' : 'Create Department'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

