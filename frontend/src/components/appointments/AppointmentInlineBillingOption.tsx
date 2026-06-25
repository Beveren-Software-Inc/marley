import { useEffect, useState } from 'react'
import { fetchAppointmentBillingPreview, type Appointment } from '../../services/appointments'
import { useFormatMoney, useMoneyInputConfig } from '../../hooks/useFormatMoney'

export function isAppointmentInvoiced(appointment: Pick<Appointment, 'invoiced' | 'ref_sales_invoice'>): boolean {
  return Number(appointment.invoiced) === 1 || Boolean(appointment.ref_sales_invoice?.trim())
}

interface AppointmentInlineBillingOptionProps {
  appointment: Appointment
  billNow: boolean
  onBillNowChange: (value: boolean) => void
  amount: string
  onAmountChange: (value: string) => void
  disabled?: boolean
}

export function AppointmentInlineBillingOption({
  appointment,
  billNow,
  onBillNowChange,
  amount,
  onAmountChange,
  disabled = false,
}: AppointmentInlineBillingOptionProps) {
  const formatMoney = useFormatMoney(appointment.company ?? null)
  const { step, placeholder, fractionDigits } = useMoneyInputConfig(appointment.company ?? null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [itemCode, setItemCode] = useState<string | null>(null)

  useEffect(() => {
    if (!billNow) return
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
          onAmountChange(preset.toFixed(fractionDigits))
        }
      } catch (err) {
        if (!cancelled) console.error('Failed to load billing preview:', err)
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }
    void loadPreview()
    return () => {
      cancelled = true
    }
  }, [billNow, appointment.name, appointment.paid_amount, fractionDigits, onAmountChange])

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={billNow}
          onChange={(e) => onBillNowChange(e.target.checked)}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
        />
        <span className="text-sm text-slate-700">
          <span className="font-medium text-slate-900">Bill now</span>
          <span className="block text-slate-500 mt-0.5">
            Create a Sales Order and Sales Invoice{itemCode ? ` (${itemCode})` : ''} for this appointment.
          </span>
        </span>
      </label>

      {billNow && (
        <div>
          <label htmlFor={`apt-bill-amount-${appointment.name}`} className="block text-sm font-medium text-slate-700 mb-1">
            Amount <span className="text-red-500">*</span>
          </label>
          <input
            id={`apt-bill-amount-${appointment.name}`}
            type="number"
            min={step}
            step={step}
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder={placeholder}
            required
            disabled={disabled || previewLoading}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-slate-500 mt-1">
            {previewLoading
              ? 'Loading suggested amount…'
              : amount
                ? `Charge: ${formatMoney(Number.parseFloat(amount) || 0)}`
                : 'Enter the appointment charge.'}
          </p>
        </div>
      )}
    </div>
  )
}

export function parseAppointmentBillAmount(amount: string): number | null {
  const parsed = Number.parseFloat(amount)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}
