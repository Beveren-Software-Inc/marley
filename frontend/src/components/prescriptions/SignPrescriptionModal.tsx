import { X } from 'lucide-react'
import { CREATE_MODAL_OVERLAY, createModalShellClass } from '../ui/CreateModalChrome'
import { SignPrescriptionPanel } from './SignPrescriptionPanel'

interface SignPrescriptionModalProps {
  prescriptionName: string
  currentSignature?: string | null
  status?: string
  newSystem?: 0 | 1
  onClose: () => void
  onSigned?: () => void
}

export const SignPrescriptionModal = ({
  prescriptionName,
  currentSignature,
  status,
  newSystem,
  onClose,
  onSigned,
}: SignPrescriptionModalProps) => (
  <div
    className={CREATE_MODAL_OVERLAY}
    onClick={onClose}
    role="presentation"
  >
    <div
      className={createModalShellClass('max-w-lg w-full max-h-[90vh]')}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sign-prescription-title"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 id="sign-prescription-title" className="text-base font-semibold text-slate-900">
            Sign prescription
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">{prescriptionName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4 overflow-y-auto">
        <SignPrescriptionPanel
          prescriptionName={prescriptionName}
          currentSignature={currentSignature}
          status={status}
          newSystem={newSystem}
          compact
          onSigned={() => {
            onSigned?.()
            onClose()
          }}
        />
      </div>
    </div>
  </div>
)
