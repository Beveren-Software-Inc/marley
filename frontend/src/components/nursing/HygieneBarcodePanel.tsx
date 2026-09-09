import { useState } from 'react'
import { Printer, Tag } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import { DateFilterInput } from '../ui/DateFilterInput'
import { openHygieneBarcodePrint } from '../../utils/printHygieneBarcodeLabel'

export function HygieneBarcodePanel() {
  const [openDate, setOpenDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')

  const handlePrint = () => {
    if (openDate.trim() && expiryDate.trim() && expiryDate < openDate) {
      toast.error('Expiry Date cannot be before Open Date')
      return
    }
    try {
      openHygieneBarcodePrint(openDate, expiryDate)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to print hygiene label')
    }
  }

  return (
    <div className="max-w-lg rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <div className="rounded-lg bg-teal-50 p-2 text-teal-700">
          <Tag className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Hygiene Barcode</h2>
          <p className="text-xs text-slate-500">
            Label size matches Lab barcode (2.299in × 1.5in). Dates optional — leave blank to write by hand.
          </p>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Open Date</label>
          <DateFilterInput
            value={openDate}
            onChange={(e) => setOpenDate(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Expiry Date</label>
          <DateFilterInput
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90"
        >
          <Printer className="h-4 w-4" />
          Print Hygiene Label
        </button>
      </div>
    </div>
  )
}
