import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CREATE_MODAL_OVERLAY_STACK } from './CreateModalChrome'
import { createIOPSessionType, type IOPSessionType } from '../../services/iop'

interface CreateIOPSessionTypeModalProps {
  onClose: () => void
  onSuccess?: (created: IOPSessionType) => void
}

export function CreateIOPSessionTypeModal({ onClose, onSuccess }: CreateIOPSessionTypeModalProps) {
  const [sessionTypeName, setSessionTypeName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!sessionTypeName.trim()) {
      setError('Session type name is required')
      return
    }
    try {
      setLoading(true)
      setError(null)
      const created = await createIOPSessionType(sessionTypeName.trim())
      onSuccess?.(created)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session type')
    } finally {
      setLoading(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className={CREATE_MODAL_OVERLAY_STACK}
      onClick={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="mx-4 w-full max-w-md rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Create Session Type</h2>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onClose()
              }}
              className="text-slate-400 transition-colors hover:text-slate-600"
              aria-label="Close"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Session Type <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={sessionTypeName}
              onChange={(e) => setSessionTypeName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.stopPropagation()
                  void handleCreate()
                }
              }}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g. Morning Group, Individual Therapy"
              autoFocus
            />
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onClose()
              }}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                void handleCreate()
              }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create Type'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
