import { useEffect, useMemo, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { useFormatMoney, useMoneyInputConfig } from '../../hooks/useFormatMoney'
import { toast } from '../../hooks/useToast'
import { roundMoneyAmount } from '../../utils/currencyFormat'
import {
  fetchReconciliationCandidates,
  reconcileAdvanceToInvoices,
  type ReconciliationAllocationRow,
  type ReconciliationCandidates,
} from '../../services/paymentEntry'

type InvoiceAllocMap = Record<string, number>

interface AdvanceInvoiceReconcileModalProps {
  patient: string
  patientName?: string
  onClose: () => void
  onSuccess: () => void
}

/** Greedy: oldest advance → oldest invoices. */
function buildAutoAllocations(data: ReconciliationCandidates, currencyCode: string): ReconciliationAllocationRow[] {
  const advances = data.advances.map((a) => ({
    name: a.name,
    left: roundMoneyAmount(a.unallocated_amount, currencyCode),
  }))
  const invoices = data.invoices.map((i) => ({
    name: i.name,
    left: roundMoneyAmount(i.outstanding_amount, currencyCode),
  }))
  const out: ReconciliationAllocationRow[] = []
  for (const adv of advances) {
    for (const inv of invoices) {
      if (adv.left <= 0) break
      if (inv.left <= 0) continue
      const take = roundMoneyAmount(Math.min(adv.left, inv.left), currencyCode)
      if (take <= 0) continue
      out.push({ payment_entry: adv.name, invoice: inv.name, allocated_amount: take })
      adv.left = roundMoneyAmount(adv.left - take, currencyCode)
      inv.left = roundMoneyAmount(inv.left - take, currencyCode)
    }
  }
  return out
}

export function AdvanceInvoiceReconcileModal({
  patient,
  patientName,
  onClose,
  onSuccess,
}: AdvanceInvoiceReconcileModalProps) {
  const formatMoney = useFormatMoney()
  const moneyInput = useMoneyInputConfig()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<ReconciliationCandidates | null>(null)
  /** invoice → amount to take from advances (auto-split across advances on submit) */
  const [invoiceAmounts, setInvoiceAmounts] = useState<InvoiceAllocMap>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const res = await fetchReconciliationCandidates(patient)
        if (cancelled) return
        setData(res)
        const auto = buildAutoAllocations(res, moneyInput.currencyCode)
        const byInv: InvoiceAllocMap = {}
        for (const row of auto) {
          byInv[row.invoice] = roundMoneyAmount(
            (byInv[row.invoice] || 0) + row.allocated_amount,
            moneyInput.currencyCode
          )
        }
        setInvoiceAmounts(byInv)
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Failed to load reconciliation data')
          onClose()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [patient, moneyInput.currencyCode, onClose])

  const totalToApply = useMemo(
    () =>
      roundMoneyAmount(
        Object.values(invoiceAmounts).reduce((s, v) => s + (Number(v) || 0), 0),
        moneyInput.currencyCode
      ),
    [invoiceAmounts, moneyInput.currencyCode]
  )

  const advanceTotal = data?.advance_total || 0

  const buildAllocationsFromUi = (): ReconciliationAllocationRow[] => {
    if (!data) return []
    const advances = data.advances.map((a) => ({
      name: a.name,
      left: roundMoneyAmount(a.unallocated_amount, moneyInput.currencyCode),
    }))
    const out: ReconciliationAllocationRow[] = []
    // Apply in invoice order using remaining advance pool
    for (const inv of data.invoices) {
      let need = roundMoneyAmount(invoiceAmounts[inv.name] || 0, moneyInput.currencyCode)
      if (need <= 0) continue
      const maxOut = roundMoneyAmount(inv.outstanding_amount, moneyInput.currencyCode)
      if (need > maxOut) need = maxOut
      for (const adv of advances) {
        if (need <= 0) break
        if (adv.left <= 0) continue
        const take = roundMoneyAmount(Math.min(need, adv.left), moneyInput.currencyCode)
        if (take <= 0) continue
        out.push({ payment_entry: adv.name, invoice: inv.name, allocated_amount: take })
        adv.left = roundMoneyAmount(adv.left - take, moneyInput.currencyCode)
        need = roundMoneyAmount(need - take, moneyInput.currencyCode)
      }
    }
    return out
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const allocations = buildAllocationsFromUi()
    if (allocations.length === 0) {
      toast.error('Enter amounts to apply against outstanding invoices')
      return
    }
    if (totalToApply > advanceTotal + 0.0005) {
      toast.error('Total to apply cannot exceed available advance')
      return
    }
    try {
      setSaving(true)
      const result = await reconcileAdvanceToInvoices(patient, allocations)
      toast.success(result.message || `Reconciled ${formatMoney(result.total_allocated)}`)
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reconciliation failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('w-full max-w-xl max-h-[90vh] flex flex-col')}>
        <div className="flex items-center justify-between px-6 py-4 border-t-0 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Reconcile advance to invoices</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Apply unallocated patient credit to outstanding service invoices
              {patientName ? ` · ${patientName}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 overflow-y-auto">
          {loading || !data ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
          ) : !data.can_reconcile ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              Need both unallocated advance and outstanding invoices for this patient.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-teal-200 bg-teal-50/80 px-3 py-2 text-xs text-teal-900">
                <span>
                  Available advance: <strong>{formatMoney(advanceTotal)}</strong>
                </span>
                <span>
                  Invoice outstanding: <strong>{formatMoney(data.invoice_outstanding_total)}</strong>
                </span>
                <span>
                  To apply: <strong>{formatMoney(totalToApply)}</strong>
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-600">Advances</label>
                </div>
                <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-28 overflow-y-auto text-xs">
                  {data.advances.map((a) => (
                    <div key={a.name} className="flex items-center justify-between px-3 py-2">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate">{a.name}</div>
                        <div className="text-slate-500">
                          {a.posting_date || '—'} · {a.mode_of_payment || '—'}
                        </div>
                      </div>
                      <div className="font-semibold text-teal-700 shrink-0">
                        {formatMoney(a.unallocated_amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Outstanding invoices — amount to apply
                </label>
                <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {data.invoices.map((inv) => (
                    <div key={inv.name} className="flex items-center gap-3 px-3 py-2 text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-800 truncate">{inv.name}</div>
                        <div className="text-slate-500">
                          Outstanding {formatMoney(inv.outstanding_amount)}
                          {inv.custom_reference_name ? ` · ${inv.custom_reference_name}` : ''}
                        </div>
                      </div>
                      <input
                        type="number"
                        min={0}
                        step={moneyInput.step}
                        max={inv.outstanding_amount}
                        value={invoiceAmounts[inv.name] ?? 0}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0
                          const capped = Math.min(v, inv.outstanding_amount)
                          setInvoiceAmounts((prev) => ({
                            ...prev,
                            [inv.name]: roundMoneyAmount(capped, moneyInput.currencyCode),
                          }))
                        }}
                        className="w-28 rounded border border-slate-300 px-2 py-1 text-right"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loading || !data?.can_reconcile || totalToApply <= 0}
              className={CM_BTN_PRIMARY}
            >
              {saving ? 'Reconciling…' : `Apply ${formatMoney(totalToApply)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
