import { AlertTriangle } from 'lucide-react'
import { ConfirmActionModal } from '../ui/ConfirmActionModal'

export interface PrescriptionDoseLimitIssue {
  drugLabel: string
  message: string
}

interface PrescriptionDoseLimitConfirmModalProps {
  open: boolean
  issues: PrescriptionDoseLimitIssue[]
  loading?: boolean
  title?: string
  subtitle?: string
  confirmLabel?: string
  onClose: () => void
  onConfirm: () => void
}

export function PrescriptionDoseLimitConfirmModal({
  open,
  issues,
  loading = false,
  title = 'Dose limit warning',
  subtitle = 'One or more medications exceed configured dose limits.',
  confirmLabel = 'Save anyway',
  onClose,
  onConfirm,
}: PrescriptionDoseLimitConfirmModalProps) {
  return (
    <ConfirmActionModal
      open={open}
      title={title}
      subtitle={subtitle}
      tone="warning"
      loading={loading}
      confirmLabel={confirmLabel}
      cancelLabel="Go back"
      onClose={onClose}
      onConfirm={onConfirm}
      icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
    >
      <ul className="space-y-3">
        {issues.map((issue, index) => (
          <li
            key={`${issue.drugLabel}-${index}`}
            className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2.5"
          >
            <p className="text-sm font-semibold text-amber-950">{issue.drugLabel}</p>
            <p className="mt-1 text-sm text-amber-900/90 whitespace-pre-line leading-relaxed">
              {issue.message}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-sm text-slate-600 leading-relaxed">
        Go back to adjust the dosage, or continue if this prescription is intentional.
      </p>
    </ConfirmActionModal>
  )
}
