import { useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  createAppointmentSalesOrder,
  type Appointment,
  type AppointmentSalesOrderResult,
} from '../../services/appointments'
import { toast } from '../../hooks/useToast'

interface AppointmentCreateSalesOrderModalProps {
  appointment: Appointment
  onClose: () => void
  onSuccess: (result: AppointmentSalesOrderResult) => void
}

export const AppointmentCreateSalesOrderModal = ({
  appointment,
  onClose,
  onSuccess,
}: AppointmentCreateSalesOrderModalProps) => {
  const [alsoInvoice, setAlsoInvoice] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const label = appointment.patient_name || appointment.temporary_patient_name || appointment.name
  const hasExistingOrder = Boolean(appointment.sales_order)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const result = await createAppointmentSalesOrder(appointment.name, alsoInvoice)
      if (result.sales_invoice) {
        toast.success(`Sales Order ${result.sales_order} and Invoice ${result.sales_invoice} created`)
      } else if (result.existing && !alsoInvoice) {
        toast.success(`Sales Order ${result.sales_order} already linked`)
      } else {
        toast.success(`Sales Order ${result.sales_order} created (Draft)`)
      }
      onSuccess(result)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create Sales Order'
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
            <h2 className="text-lg font-semibold text-slate-900">Bill appointment</h2>
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
            Create a Sales Order for <span className="font-medium text-slate-800">{label}</span> using the
            default appointment item from Healthcare Settings.
          </p>
          {hasExistingOrder && (
            <p className="text-sm text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Sales Order <strong>{appointment.sales_order}</strong> is already linked.
              {alsoInvoice ? ' An invoice will be created from that order.' : ''}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={alsoInvoice}
              onChange={(e) => setAlsoInvoice(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-slate-700">
              <span className="font-medium text-slate-900">Also create Sales Invoice</span>
              <span className="block text-slate-500 mt-0.5">
                Submits the Sales Order, creates and submits a Sales Invoice, and marks this appointment as
                invoiced.
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={CM_BTN_PRIMARY}>
              {saving
                ? 'Working…'
                : alsoInvoice
                  ? hasExistingOrder
                    ? 'Create invoice'
                    : 'Create order & invoice'
                  : hasExistingOrder
                    ? 'Open existing order'
                    : 'Create Sales Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
