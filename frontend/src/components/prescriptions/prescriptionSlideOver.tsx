import { PrescriptionDetails } from "./prescriptionDetails"

interface PrescriptionSlideOverProps {
  prescriptionName: string | null
  onClose: () => void
  onUpdate?: () => void
}

export const PrescriptionSlideOver = ({
  prescriptionName,
  onClose,
  onUpdate,
}: PrescriptionSlideOverProps) => {
  if (!prescriptionName) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Panel */}
      <div
        className="relative z-10 h-full w-full max-w-2xl bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Prescription Details</p>
            <p className="text-sm font-semibold text-slate-800">{prescriptionName}</p>
          </div>
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

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6">
          <PrescriptionDetails
            prescriptionName={prescriptionName}
            onUpdate={onUpdate}
          />
        </div>
      </div>
    </div>
  )
}