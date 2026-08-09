import { useMemo, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { createBulkInvoice, getServiceOrderBillableTotal, type ServiceOrder } from '../../services/serviceOrders'
import { ServiceOrderServiceCell } from './ServiceOrderServiceCell'
import { toast } from '../../hooks/useToast'
import { useFormatMoney } from '../../hooks/useFormatMoney'

export function isBillableServiceOrder(order: ServiceOrder): boolean {
  return order.docstatus === 1 && !order.invoice_name && getServiceOrderBillableTotal(order) > 0
}

interface BulkInvoiceModalProps {
  orders: ServiceOrder[]
  patient?: string
  referenceType?: string
  referenceName?: string
  onClose: () => void
  onSuccess: (invoiceName: string) => void
}

export const BulkInvoiceModal = ({
  orders,
  patient,
  referenceType,
  referenceName,
  onClose,
  onSuccess,
}: BulkInvoiceModalProps) => {
  const formatCurrency = useFormatMoney()
  const billable = useMemo(() => orders.filter(isBillableServiceOrder), [orders])
  const [selected, setSelected] = useState<Set<string>>(() => new Set(billable.map((o) => o.name)))
  const [saving, setSaving] = useState(false)

  const allSelected = billable.length > 0 && selected.size === billable.length
  const selectedTotal = billable
    .filter((o) => selected.has(o.name))
    .reduce((sum, o) => sum + getServiceOrderBillableTotal(o), 0)

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(billable.map((o) => o.name)))
  }

  const handleCreate = async () => {
    if (selected.size === 0) {
      toast.error('Select at least one order to invoice')
      return
    }
    try {
      setSaving(true)
      const result = await createBulkInvoice({
        salesOrderNames: [...selected],
        referenceType,
        referenceName,
        patient,
      })
      if (typeof result === 'string') {
        toast.success(`Invoice ${result} created`)
        onSuccess(result)
      } else {
        const parts = (result.details || []).map((d) => {
          if (d.source === 'delivery_note') return `${d.invoice} (stock/DN)`
          if (d.source === 'sales_order') return `${d.invoice} (services)`
          return d.invoice
        })
        toast.success(
          parts.length
            ? `Created ${result.invoices.length} invoices: ${parts.join(', ')}`
            : `Created ${result.invoices.length} invoices: ${result.invoices.join(', ')}`,
        )
        onSuccess(result.invoices[0])
      }
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create invoice'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY} onClick={onClose}>
      <div
        className={createModalShellClass('max-w-2xl w-full max-h-[85vh] overflow-hidden')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create bulk invoice</h2>
            <p className="text-sm text-slate-600 mt-1">
              Choose which service orders to include. All billable orders are selected by default.
            </p>
          </div>
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

        {billable.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No billable orders (submitted and not yet invoiced).
          </div>
        ) : (
          <>
            <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/80">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                Select all ({billable.length})
              </label>
              <span className="text-sm font-medium text-slate-800">
                Selected total: {formatCurrency(selectedTotal)}
              </span>
            </div>

            <div className="overflow-y-auto max-h-[50vh]" style={{ scrollbarWidth: 'thin' }}>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                      Order
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase min-w-[180px]">
                      Service / type
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {billable.map((order) => (
                    <tr
                      key={order.name}
                      className={`hover:bg-slate-50 cursor-pointer ${selected.has(order.name) ? 'bg-primary/5' : ''}`}
                      onClick={() => toggle(order.name)}
                    >
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(order.name)}
                          onChange={() => toggle(order.name)}
                          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                        />
                      </td>
                      <td className="px-3 py-2.5 font-medium text-primary">{order.name}</td>
                      <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                        {order.transaction_date}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <ServiceOrderServiceCell order={order} />
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-900 tabular-nums">
                        <div>{formatCurrency(getServiceOrderBillableTotal(order))}</div>
                        {order.has_dispense_returns && (order.returned_amount ?? 0) > 0 ? (
                          <div className="text-[10px] font-normal text-purple-700">
                            Returned {formatCurrency(order.returned_amount ?? 0)}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
          <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || billable.length === 0 || selected.size === 0}
            className={CM_BTN_PRIMARY}
          >
            {saving ? 'Creating…' : `Create invoice (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}
