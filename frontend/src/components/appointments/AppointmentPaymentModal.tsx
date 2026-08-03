import { useState, useEffect } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { toast } from '../../hooks/useToast'
import {
  createPaymentEntry,
  fetchModeOfPayments,
  fetchSalesInvoiceSummary,
} from '../../services/paymentEntry'
import type { Appointment } from '../../services/appointments'
import {
  PaymentModeLines,
  newPaymentModeLine,
  sumPaymentModeLines,
  paymentModesPayload,
  validatePaymentModeLines,
  type PaymentModeLine,
} from '../billing/PaymentModeLines'

interface AppointmentPaymentModalProps {
  appointment: Appointment
  salesInvoice: string
  onClose: () => void
  onSuccess: () => void
}

export const AppointmentPaymentModal = ({
  appointment,
  salesInvoice,
  onClose,
  onSuccess,
}: AppointmentPaymentModalProps) => {
  const [paymentModes, setPaymentModes] = useState<string[]>([])
  const [modeLines, setModeLines] = useState<PaymentModeLine[]>([newPaymentModeLine()])
  const [remarks, setRemarks] = useState('')
  const [outstanding, setOutstanding] = useState<number | null>(null)
  const [grandTotal, setGrandTotal] = useState<number | null>(null)
  const [loadingInvoice, setLoadingInvoice] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const label =
    appointment.patient_name || appointment.temporary_patient_name || appointment.name

  useEffect(() => {
    fetchModeOfPayments()
      .then((modes) => {
        setPaymentModes(modes)
        if (modes.length) {
          setModeLines((prev) =>
            prev.length === 1 && !prev[0].mode_of_payment
              ? [{ ...prev[0], mode_of_payment: modes[0] }]
              : prev
          )
        }
      })
      .catch(() => setPaymentModes(['Cash', 'Bank Transfer', 'Credit Card', 'Cheque']))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadingInvoice(true)
    setError(null)
    fetchSalesInvoiceSummary(salesInvoice)
      .then((inv) => {
        if (cancelled) return
        setOutstanding(inv.outstanding_amount)
        setGrandTotal(inv.grand_total)
        if (inv.outstanding_amount > 0) {
          const amt = String(inv.outstanding_amount)
          setModeLines((prev) => {
            const next = prev.length ? [...prev] : [newPaymentModeLine()]
            next[0] = { ...next[0], amount: amt }
            return next
          })
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load invoice')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingInvoice(false)
      })
    return () => {
      cancelled = true
    }
  }, [salesInvoice])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const modesErr = validatePaymentModeLines(modeLines)
    if (modesErr) {
      toast.error(modesErr)
      return
    }
    const modesPayload = paymentModesPayload(modeLines)
    const paid = sumPaymentModeLines(modeLines)
    if (!Number.isFinite(paid) || paid <= 0) {
      toast.error('Enter a valid payment amount')
      return
    }
    if (outstanding != null && outstanding > 0 && paid > outstanding) {
      toast.error(`Amount cannot exceed outstanding (${outstanding})`)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await createPaymentEntry({
        reference_doctype: 'Sales Invoice',
        reference_name: salesInvoice,
        paid_amount: paid,
        mode_of_payment: modesPayload[0].mode_of_payment,
        payment_modes: modesPayload,
        patient: appointment.patient,
        appointment: appointment.name,
        remarks: remarks.trim() || undefined,
      })
      toast.success(result.server_message || `Payment ${result.name} recorded`)
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create payment'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const noOutstanding = outstanding != null && outstanding <= 0

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-md w-full')}>
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Record payment</h2>
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
            Payment for <span className="font-medium text-slate-800">{label}</span> against invoice{' '}
            <span className="font-mono text-slate-800">{salesInvoice}</span>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {loadingInvoice ? (
            <p className="text-sm text-slate-500">Loading invoice…</p>
          ) : (
            <>
              {grandTotal != null && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                  <div className="flex justify-between">
                    <span>Invoice total</span>
                    <span className="font-medium">{grandTotal}</span>
                  </div>
                  {outstanding != null && (
                    <div className="flex justify-between mt-1">
                      <span>Outstanding</span>
                      <span
                        className={`font-medium ${outstanding > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
                      >
                        {outstanding}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {noOutstanding && (
                <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                  This invoice is already fully paid.
                </p>
              )}

              {!noOutstanding && (
                <PaymentModeLines
                  modes={paymentModes}
                  lines={modeLines}
                  onChange={setModeLines}
                />
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Remarks</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  placeholder="Optional"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  disabled={noOutstanding}
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              {noOutstanding ? 'Close' : 'Cancel'}
            </button>
            {!noOutstanding && (
              <button
                type="submit"
                disabled={loading || loadingInvoice}
                className={CM_BTN_PRIMARY}
              >
                {loading ? 'Saving…' : 'Create payment'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
