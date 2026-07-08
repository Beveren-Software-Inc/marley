import { useEffect, useState } from 'react'
import { Ban } from 'lucide-react'
import { ConfirmActionModal } from '../ui/ConfirmActionModal'
import { linkComboboxInputClassCompact } from '../ui/linkComboboxStyles'

export interface LabTestRejectionReasonModalProps {
  open: boolean
  loading?: boolean
  testLabel?: string
  initialReason?: string
  onClose: () => void
  onConfirm: (reason: string) => void
}

export function LabTestRejectionReasonModal({
  open,
  loading = false,
  testLabel,
  initialReason = '',
  onClose,
  onConfirm,
}: LabTestRejectionReasonModalProps) {
  const [reason, setReason] = useState(initialReason)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setReason(initialReason)
      setError(null)
    }
  }, [open, initialReason])

  const handleConfirm = () => {
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('Please enter a reason for rejection.')
      return
    }
    onConfirm(trimmed)
  }

  return (
    <ConfirmActionModal
      open={open}
      title="Reason for rejection"
      subtitle={testLabel}
      icon={<Ban className="h-5 w-5" />}
      tone="danger"
      loading={loading}
      confirmLabel="Reject"
      cancelLabel="Cancel"
      onClose={onClose}
      onConfirm={handleConfirm}
    >
      <p className="text-sm leading-relaxed text-slate-600">
        Enter why this lab result is being rejected. This will be saved in the review comments.
      </p>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Rejection reason <span className="text-red-600">*</span>
        </label>
        <textarea
          className={`${linkComboboxInputClassCompact} min-h-[100px] resize-y`}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value)
            if (error) setError(null)
          }}
          rows={4}
          placeholder="Describe why this result is being rejected…"
          autoFocus
        />
        {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : null}
      </div>
    </ConfirmActionModal>
  )
}
