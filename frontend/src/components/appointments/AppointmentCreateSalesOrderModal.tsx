import { useEffect, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  createAppointmentSalesOrder,
  fetchAppointmentBillingPreview,
  type Appointment,
  type AppointmentSalesOrderResult,
} from '../../services/appointments'
import { toast } from '../../hooks/useToast'
import { useFormatMoney, useMoneyInputConfig } from '../../hooks/useFormatMoney'

interface AppointmentCreateSalesOrderModalProps {
  appointment: Appointment
  onClose: () => void
  onSuccess: (result: AppointmentSalesOrderResult) => void
  onRecordPayment?: (result: AppointmentSalesOrderResult) => void
}

export const AppointmentCreateSalesOrderModal = ({
  appointment,
  onClose,
  onSuccess,
  onRecordPayment,
}: AppointmentCreateSalesOrderModalProps) => {
  const [alsoInvoice, setAlsoInvoice] = useState(false)
  const [amount, setAmount] = useState('')
  const [itemCode, setItemCode] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState<AppointmentSalesOrderResult | null>(null)

  const formatMoney = useFormatMoney(appointment.company ?? null)
  const { step, placeholder, fractionDigits } = useMoneyInputConfig(appointment.company ?? null)

  const label = appointment.patient_name || appointment.temporary_patient_name || appointment.name
  const hasExistingOrder = Boolean(appointment.sales_order)
  const needsAmount = !hasExistingOrder

  useEffect(() => {
    if (!needsAmount) return
    let cancelled = false
    const loadPreview = async () => {
      setPreviewLoading(true)
      try {
        const preview = await fetchAppointmentBillingPreview(appointment.name)
        if (cancelled) return
        setItemCode(preview.item_code)
        const preset =
          (appointment.paid_amount && appointment.paid_amount > 0
            ? appointment.paid_amount
            : preview.paid_amount && preview.paid_amount > 0
              ? preview.paid_amount
              : preview.suggested_amount) ?? 0
        if (preset > 0) {
          setAmount(preset.toFixed(fractionDigits))
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load billing preview:', err)
        }
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }
    void loadPreview()
    return () => {
      cancelled = true
    }
  }, [
    appointment.name,
    appointment.paid_amount,
    fractionDigits,
    needsAmount,
  ])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsedAmount = needsAmount ? Number.parseFloat(amount) : undefined
    if (needsAmount && (!Number.isFinite(parsedAmount) || (parsedAmount ?? 0) <= 0)) {
      setError('Enter a billing amount greater than zero.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const result = await createAppointmentSalesOrder(
        appointment.name,
        alsoInvoice,
        needsAmount ? parsedAmount : undefined,
      )
      if (result.sales_invoice) {
        toast.success(`Sales Order ${result.sales_order} and Invoice ${result.sales_invoice} created`)
        setCompleted(result)
        onSuccess(result)
      } else if (result.existing && !alsoInvoice) {
        toast.success(`Sales Order ${result.sales_order} already linked`)
        onSuccess(result)
        onClose()
      } else {
        toast.success(`Sales Order ${result.sales_order} created (Draft)`)
        onSuccess(result)
        onClose()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create Sales Order'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  if (completed?.sales_invoice) {
    return (
      <div className={CREATE_MODAL_OVERLAY}>
        <div className={createModalShellClass('max-w-md w-full')}>
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Invoice created</h2>
            <p className="text-sm text-slate-600 mt-2">
              Sales Invoice <span className="font-mono font-medium">{completed.sales_invoice}</span> is
              linked to this appointment. Record a payment now or do it later from the appointment menu.
            </p>
          </div>
          <div className="p-6 flex flex-col gap-3">
            {onRecordPayment && (
              <button
                type="button"
                className={CM_BTN_PRIMARY}
                onClick={() => {
                  onRecordPayment(completed)
                  onClose()
                }}
              >
                Record payment
              </button>
            )}
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Done
            </button>
          </div>
        </div>
      </div>
    )
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
            Bill <span className="font-medium text-slate-800">{label}</span> using the default appointment
            item from Healthcare Settings{itemCode ? ` (${itemCode})` : ''}.
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

          {needsAmount && (
            <div>
              <label htmlFor="appointment-billing-amount" className="block text-sm font-medium text-slate-700 mb-1">
                Amount <span className="text-red-500">*</span>
              </label>
              <input
                id="appointment-billing-amount"
                type="number"
                min={step}
                step={step}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={placeholder}
                required
                disabled={previewLoading}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-slate-500 mt-1">
                {previewLoading
                  ? 'Loading suggested amount…'
                  : amount
                    ? `Charge: ${formatMoney(Number.parseFloat(amount) || 0)}`
                    : 'Enter the amount reception should bill for this appointment.'}
              </p>
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
            <button type="submit" disabled={saving || (needsAmount && previewLoading)} className={CM_BTN_PRIMARY}>
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
