import { useState } from 'react'
import { toast } from '../../hooks/useToast'
import { cancelVisit } from '../../services/patientVisits'

interface CancelVisitModalProps {
  visitName: string
  onClose: () => void
  onSuccess?: () => void
  /** If provided, parent handles cancel; modal calls this with reason and closes. */
  onConfirm?: (reason: string) => void | Promise<void>
  loading?: boolean
}

export const CancelVisitModal = ({ visitName, onClose, onSuccess, onConfirm, loading: parentLoading }: CancelVisitModalProps) => {
  const [reason, setReason] = useState('')
  const [internalLoading, setInternalLoading] = useState(false)
  const loading = parentLoading ?? internalLoading

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error('Please enter a reason for cancellation')
      return
    }

    if (onConfirm) {
      try {
        await onConfirm(reason)
        onClose()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to cancel visit')
      }
      return
    }

    setInternalLoading(true)
    try {
      await cancelVisit(visitName, reason)
      toast.success('Visit cancelled successfully')
      onSuccess?.()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel visit')
    } finally {
      setInternalLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Cancel Visit {visitName}</h2>
        <label className="block text-sm font-medium text-slate-700 mb-1">Reason for Cancellation</label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="w-full border border-slate-300 rounded-md p-2 text-sm mb-4 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
          rows={4}
          placeholder="Enter reason..."
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Cancelling…' : 'Confirm Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}