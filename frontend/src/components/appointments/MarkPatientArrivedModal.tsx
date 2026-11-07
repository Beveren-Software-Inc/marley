import { useEffect, useMemo, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  appointmentNeedsRegistration,
  updateAppointmentStatus,
  type Appointment,
} from '../../services/appointments'
import {
  fetchPatientVisitChargeLines,
  fetchPatientVisitTypes,
  type PatientVisitTypeOption,
} from '../../services/patientVisits'
import { toast } from '../../hooks/useToast'
import { useFormatMoney } from '../../hooks/useFormatMoney'
import { isAppointmentInvoiced } from './AppointmentInlineBillingOption'

interface ChargeLineRow {
  template: string
  service_name: string
  item_name: string
  rate: number
  discount_pct?: number
  discount_amount?: number
  include: boolean
}

function chargeLineNet(row: ChargeLineRow): number {
  const list = row.rate || 0
  if (row.discount_pct && row.discount_pct > 0) {
    return list * (1 - row.discount_pct / 100)
  }
  if (row.discount_amount && row.discount_amount > 0) {
    return Math.max(0, list - row.discount_amount)
  }
  return list
}

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
  const formatMoney = useFormatMoney(appointment.company ?? null)
  const [notes, setNotes] = useState('')
  const [billNow, setBillNow] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [visitTypeOptions, setVisitTypeOptions] = useState<PatientVisitTypeOption[]>([])
  const [visitTypeOpen, setVisitTypeOpen] = useState(false)
  const [visitTypeQuery, setVisitTypeQuery] = useState('')
  const [visitType, setVisitType] = useState('')
  const [chargeNoCharges, setChargeNoCharges] = useState(false)
  const [chargeLines, setChargeLines] = useState<ChargeLineRow[]>([])
  const [chargesLoading, setChargesLoading] = useState(false)

  const label = appointment.patient_name || appointment.temporary_patient_name || appointment.name
  const showBilling = Boolean(appointment.patient) && !isAppointmentInvoiced(appointment)

  const chargeTotal = useMemo(
    () => chargeLines.filter((r) => r.include).reduce((sum, r) => sum + chargeLineNet(r), 0),
    [chargeLines],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const types = await fetchPatientVisitTypes()
        if (!cancelled) setVisitTypeOptions(types)
      } catch (err) {
        console.error('Failed to load visit types:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!visitType) {
      setChargeLines([])
      setChargeNoCharges(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setChargesLoading(true)
      try {
        const data = await fetchPatientVisitChargeLines(visitType, appointment.patient)
        if (cancelled) return
        setChargeNoCharges(Boolean(data.no_charges))
        const rows: ChargeLineRow[] = (data.lines || [])
          .filter((l) => l.template && l.configured !== false)
          .map((l) => ({
            template: l.template as string,
            service_name: l.service_name || l.item_name || 'Visit fee',
            item_name: l.item_name || '',
            rate: l.rate || 0,
            discount_pct: Number(l.discount_pct || 0) || undefined,
            discount_amount: Number(l.discount_amount || 0) || undefined,
            include: true,
          }))
        setChargeLines(rows)
        if (data.no_charges) setBillNow(false)
      } catch (err) {
        if (!cancelled) console.error('Failed to load visit charges:', err)
      } finally {
        if (!cancelled) setChargesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [visitType, appointment.patient])

  const updateChargeLine = (idx: number, patch: Partial<ChargeLineRow>) => {
    setChargeLines((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }

  const removeChargeLine = (idx: number) => {
    setChargeLines((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (appointmentNeedsRegistration(appointment)) {
      onRequiresRegistration?.()
      onClose()
      return
    }

    if (!visitType.trim()) {
      setError('Please select a visit type.')
      return
    }

    const includedLines = chargeLines.filter((row) => row.include && row.template)
    if (showBilling && billNow && !chargeNoCharges && includedLines.length === 0) {
      setError('Select at least one charge, or turn off Bill now.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const result = await updateAppointmentStatus(appointment.name, 'Patient Arrived', {
        notes: notes.trim() || undefined,
        visitType,
        chargeVisit: showBilling && billNow && !chargeNoCharges,
        chargeLines:
          showBilling && billNow && !chargeNoCharges
            ? includedLines.map((row) => ({
                template: row.template,
                rate: row.rate,
                qty: 1,
                ...(row.discount_pct && row.discount_pct > 0
                  ? { discount_type: 'Percentage' as const, discount_rate: row.discount_pct, discount: 0 }
                  : row.discount_amount && row.discount_amount > 0
                    ? { discount_type: 'Amount' as const, discount: row.discount_amount, discount_rate: 0 }
                    : { discount_type: 'Amount' as const, discount: 0, discount_rate: 0 }),
              }))
            : undefined,
      })

      if (result.patient_visit && result.sales_order) {
        toast.success(
          `Arrived · visit ${result.patient_visit} · charge order ${result.sales_order}`,
        )
      } else if (result.patient_visit && result.visit_charge_error) {
        toast.success(`Arrived · visit ${result.patient_visit}`)
        toast.error(result.visit_charge_error)
      } else if (result.patient_visit) {
        toast.success(`Patient marked as arrived · visit ${result.patient_visit} created`)
      } else {
        toast.success('Patient marked as arrived')
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

  const visitTypeLabel =
    visitTypeOptions.find((v) => v.name === visitType)?.visit_type || visitType

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-lg w-full')}>
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
            <span className="font-medium text-slate-800">{label}</span>, choose the visit type,
            and bill visit charges if needed.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Visit Type <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={visitType ? visitTypeLabel : visitTypeQuery}
              onChange={(e) => {
                setVisitTypeQuery(e.target.value)
                setVisitTypeOpen(true)
                if (visitType) setVisitType('')
              }}
              onFocus={() => setVisitTypeOpen(true)}
              placeholder="Search visit type..."
              disabled={saving}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {visitType && (
              <button
                type="button"
                onClick={() => {
                  setVisitType('')
                  setVisitTypeQuery('')
                }}
                className="absolute right-2 top-[calc(50%+10px)] -translate-y-1/2 text-slate-400 hover:text-slate-600"
                title="Clear"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            {visitTypeOpen && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                {visitTypeOptions
                  .filter((vt) => {
                    const q = visitTypeQuery.trim().toLowerCase()
                    if (!q || visitType) return true
                    return (
                      (vt.visit_type || '').toLowerCase().includes(q) ||
                      (vt.name || '').toLowerCase().includes(q)
                    )
                  })
                  .map((vt) => (
                    <button
                      key={vt.name}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                      onClick={() => {
                        setVisitType(vt.name)
                        setVisitTypeQuery(vt.visit_type || vt.name)
                        setVisitTypeOpen(false)
                      }}
                    >
                      {vt.visit_type || vt.name}
                    </button>
                  ))}
                {visitTypeOptions.length === 0 && (
                  <div className="px-3 py-2 text-xs text-slate-500">No visit types found.</div>
                )}
              </div>
            )}
          </div>

          {visitType && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
              {chargeNoCharges ? (
                <p className="text-sm text-slate-600">
                  This visit type is marked <span className="font-medium">No Charges</span> — no
                  visit fee will be created.
                </p>
              ) : (
                <>
                  {showBilling && (
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={billNow}
                        onChange={(e) => setBillNow(e.target.checked)}
                        disabled={saving || chargesLoading}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-slate-700">
                        <span className="font-medium text-slate-900">Bill now</span>
                        <span className="block text-slate-500 mt-0.5">
                          Create a Sales Order from the visit type charges below. You can change
                          amounts before saving.
                        </span>
                      </span>
                    </label>
                  )}

                  {chargesLoading ? (
                    <p className="text-xs text-slate-500">Loading charges…</p>
                  ) : chargeLines.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700">Services</span>
                        <span className="text-xs text-slate-500">
                          Total{' '}
                          <span className="font-semibold text-slate-800">
                            {formatMoney(chargeTotal)}
                          </span>
                        </span>
                      </div>
                      {chargeLines.map((row, idx) => {
                        const net = chargeLineNet(row)
                        return (
                          <div
                            key={`${row.template}-${idx}`}
                            className={`rounded-md border px-2.5 py-2 ${
                              row.include
                                ? 'border-slate-200 bg-white'
                                : 'border-dashed border-slate-200 bg-slate-50 opacity-70'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                checked={row.include}
                                disabled={saving || (showBilling && !billNow)}
                                onChange={(e) => updateChargeLine(idx, { include: e.target.checked })}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium text-slate-800 truncate">
                                    {row.service_name}
                                  </span>
                                  <button
                                    type="button"
                                    className="shrink-0 text-slate-400 hover:text-red-500 leading-none"
                                    onClick={() => removeChargeLine(idx)}
                                    title="Remove service"
                                    aria-label="Remove service"
                                    disabled={saving}
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-slate-500">Price</span>
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      className="w-24 rounded border border-slate-300 px-2 py-0.5 text-xs focus:border-primary focus:ring-primary"
                                      value={row.rate || ''}
                                      placeholder="0"
                                      disabled={saving || (showBilling && !billNow)}
                                      onChange={(e) =>
                                        updateChargeLine(idx, {
                                          rate: parseFloat(e.target.value) || 0,
                                        })
                                      }
                                    />
                                  </div>
                                  <span className="text-xs text-slate-400">·</span>
                                  <span className="text-xs text-slate-600">
                                    Net: <span className="font-semibold">{formatMoney(net)}</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-amber-700">
                      Visit charge is not configured for this visit type. Add Services to the
                      Patient Visit Type or set the Normal Patient Visit Charge Item in Healthcare
                      Settings.
                    </p>
                  )}
                </>
              )}
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

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={CM_BTN_PRIMARY}>
              {saving
                ? 'Saving…'
                : showBilling && billNow && !chargeNoCharges
                  ? 'Mark arrived & bill'
                  : 'Mark patient arrived'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
