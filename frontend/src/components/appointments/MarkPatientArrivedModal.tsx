import { useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  appointmentNeedsRegistration,
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

interface MarkPatientArrivedModalProps {
  appointment: Appointment
  onClose: () => void
  onSuccess: () => void
  /** Walk-in with no patient file — open registration instead of marking arrived. */
  onRequiresRegistration?: () => void
}

export const MarkPatientArrivedModal = ({
  appointment,
  onClose,
  onSuccess,
  onRequiresRegistration,
}: MarkPatientArrivedModalProps) => {
  const [notes, setNotes] = useState('')
  const [billNow, setBillNow] = useState(false)
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const label = appointment.patient_name || appointment.temporary_patient_name || appointment.name
  const showBilling = Boolean(appointment.patient) && !isAppointmentInvoiced(appointment)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (appointmentNeedsRegistration(appointment)) {
      onRequiresRegistration?.()
      onClose()
      return
    }

    const billAmount = billNow ? parseAppointmentBillAmount(amount) : null
    if (billNow && billAmount === null) {
      setError('Enter a billing amount greater than zero.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const result = await updateAppointmentStatus(
        appointment.name,
        'Patient Arrived',
        notes.trim() || undefined,
      )
      if (result.patient_visit) {
        toast.success(`Patient marked as arrived · visit ${result.patient_visit} created`)
      } else {
        toast.success('Patient marked as arrived')
      }

      if (billNow && billAmount !== null) {
        try {
          const billed = await createAppointmentSalesOrder(appointment.name, true, billAmount)
          toast.success(`Sales Order ${billed.sales_order} and Invoice ${billed.sales_invoice} created`)
        } catch (billErr) {
          const billMsg = billErr instanceof Error ? billErr.message : 'Billing failed'
          toast.error(`Patient arrived, but billing failed: ${billMsg}`)
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
            <h2 className="text-lg font-semibold text-slate-900">Patient arrived</h2>
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
            Set appointment status to <strong>Patient Arrived</strong> for{' '}
            <span className="font-medium text-slate-800">{label}</span>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="arrival-notes" className="block text-sm font-medium text-slate-700 mb-1">
              Notes <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="arrival-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="e.g. arrived at 09:15, accompanied by family"
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
              {saving ? 'Saving…' : billNow ? 'Mark arrived & bill' : 'Mark patient arrived'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
