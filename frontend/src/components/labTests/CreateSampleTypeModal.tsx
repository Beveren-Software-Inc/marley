import { useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { apiRequest } from '../../services/apiClient'

interface CreateSampleTypeModalProps {
  onClose: () => void
  onSuccess?: () => void
}

export const CreateSampleTypeModal = ({ onClose, onSuccess }: CreateSampleTypeModalProps) => {
  const [sampleType, setSampleType] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sampleType.trim()) { setError('Sample Type name is required'); return }
    try {
      setSaving(true)
      setError(null)
      await apiRequest('/api/resource/Sample%20Type', {
        method: 'POST',
        body: JSON.stringify({ sample_type: sampleType.trim() }),
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create Sample Type')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={createModalShellClass('w-full max-w-sm')} onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-emerald-950">Create Sample Type</h2>
          <button onClick={onClose} className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Sample Type <span className="text-red-500">*</span>
            </label>
            <input type="text" value={sampleType} onChange={e => setSampleType(e.target.value)}
              placeholder="e.g. Whole Blood, Serum, Urine"
              autoFocus
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className={CM_BTN_PRIMARY}>
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
