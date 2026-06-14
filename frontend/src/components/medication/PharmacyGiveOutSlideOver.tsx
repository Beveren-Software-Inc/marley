import { Pill } from 'lucide-react'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PharmacyGiveOutDetails } from './PharmacyGiveOutDetails'

interface PharmacyGiveOutSlideOverProps {
  giveOutName: string | null
  onClose: () => void
}

export function PharmacyGiveOutSlideOver({ giveOutName, onClose }: PharmacyGiveOutSlideOverProps) {
  if (!giveOutName) return null

  return (
    <DetailSlideOver
      title="Pharmacy Give Out"
      subtitle={giveOutName}
      icon={<Pill className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
    >
      <div className="p-2">
        <PharmacyGiveOutDetails giveOutName={giveOutName} />
      </div>
    </DetailSlideOver>
  )
}
