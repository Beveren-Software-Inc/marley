import { useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  createAppointmentSalesOrder,
  updateAppointmentStatus,
  type Appointment,
} from '../../services/appointments'
import { toast } from '../../hooks/useToast'
import {
  AppointmentInlineBillingOption,
  isAppointmentInvoiced,
  parseAppointmentBillAmount,
} from './AppointmentInlineBillingOption'

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface MarkPatientCheckedOutModalProps {
  appointment: Appointment
  onClose: () => void
  onSuccess: () => void
}

export const MarkPatientCheckedOutModal = ({
  appointment,
  onClose,
  onSuccess,
}: MarkPatientCheckedOutModalProps) => {
  const [notes, setNotes] = useState('')
  const [checkoutTime, setCheckoutTime] = useState(() => toDatetimeLocalValue(new Date()))
  const [billNow, setBillNow] = useState(false)
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const label = appointment.patient_name || appointment.temporary_patient_name || appointment.name
  const showBilling = Boolean(appointment.patient) && !isAppointmentInvoiced(appointment)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const billAmount = billNow ? parseAppointmentBillAmount(amount) : null
    if (billNow && billAmount === null) {
      setError('Enter a billing amount greater than zero.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const checkoutIso = checkoutTime ? new Date(checkoutTime).toISOString() : undefined
      await updateAppointmentStatus(
        appointment.name,
        'Checked Out',
        notes.trim() || undefined,
        checkoutIso,
      )
      toast.success('Patient checked out')

      if (billNow && billAmount !== null) {
        try {
          const billed = await createAppointmentSalesOrder(appointment.name, true, billAmount)
          toast.success(`Sales Order ${billed.sales_order} and Invoice ${billed.sales_invoice} created`)
        } catch (billErr) {
          const billMsg = billErr instanceof Error ? billErr.message : 'Billing failed'
          toast.error(`Patient checked out, but billing failed: ${billMsg}`)
        }
      }

      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update status'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-md w-full')}>
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Check out patient</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-slate-600 mt-2">
            Set appointment status to <strong>Checked Out</strong> for{' '}
            <span className="font-medium text-slate-800">{label}</span> and record checkout time.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="checkout-time" className="block text-sm font-medium text-slate-700 mb-1">
              Checkout time
            </label>
            <input
              id="checkout-time"
              type="datetime-local"
              value={checkoutTime}
              onChange={(e) => setCheckoutTime(e.target.value)}
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="checkout-notes" className="block text-sm font-medium text-slate-700 mb-1">
              Notes <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="checkout-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="e.g. departed after pharmacy pickup"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {showBilling && (
            <AppointmentInlineBillingOption
              appointment={appointment}
              billNow={billNow}
              onBillNowChange={setBillNow}
              amount={amount}
              onAmountChange={setAmount}
              disabled={saving}
            />
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={CM_BTN_PRIMARY}>
              {saving ? 'Saving…' : billNow ? 'Check out & bill' : 'Check out patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
