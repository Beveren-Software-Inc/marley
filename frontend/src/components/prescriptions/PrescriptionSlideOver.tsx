import { Pill } from 'lucide-react'
import { PrescriptionDetails } from './PrescriptionDetails'
import { DetailSlideOver } from '../ui/DetailSlideOver'

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
    <DetailSlideOver
      title="Prescription Details"
      subtitle={prescriptionName}
      icon={<Pill className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
    >
      <div className="p-2">
        <PrescriptionDetails prescriptionName={prescriptionName} onUpdate={onUpdate} />
      </div>
    </DetailSlideOver>
  )
}
