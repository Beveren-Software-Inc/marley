import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { fetchCostCenters, type LinkFieldOption } from '../../services/common'
import type { SalesInvoiceDetail } from '../../services/billingSpecialty'

export type DraftInvoiceLineEdit = {
  name: string
  item_code: string
  item_name?: string
  description?: string
  qty: number
  rate: number
  discount_amount: number
  cost_center: string
}

export function invoiceDetailToEditableLines(detail: SalesInvoiceDetail): DraftInvoiceLineEdit[] {
  return (detail.items || []).map((line) => ({
    name: line.name || '',
    item_code: line.item_code,
    item_name: line.item_name,
    description: line.description,
    qty: Number(line.qty || 0),
    rate: Number(line.rate || 0),
    discount_amount: Number(line.discount_amount || 0),
    cost_center: line.cost_center || detail.custom_created_at || detail.cost_center || '',
  }))
}

interface DraftSalesInvoiceItemsEditorProps {
  lines: DraftInvoiceLineEdit[]
  onChange: (lines: DraftInvoiceLineEdit[]) => void
  company?: string
  disabled?: boolean
}

export function DraftSalesInvoiceItemsEditor({
  lines,
  onChange,
  company,
  disabled = false,
}: DraftSalesInvoiceItemsEditorProps) {
  const [costCenters, setCostCenters] = useState<LinkFieldOption[]>([])
  const [ccLoading, setCcLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setCcLoading(true)
    fetchCostCenters(company)
      .then((rows) => {
        if (!cancelled) setCostCenters(rows)
      })
      .catch(() => {
        if (!cancelled) setCostCenters([])
      })
      .finally(() => {
        if (!cancelled) setCcLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [company])

  const patchLine = (idx: number, patch: Partial<DraftInvoiceLineEdit>) => {
    onChange(lines.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }

  return (
    <div className="rounded-xl border border-emerald-100 overflow-hidden bg-white">
      <div className="px-3 py-2 bg-emerald-50/90 border-b border-emerald-100 text-xs font-semibold text-emerald-900">
        Edit invoice lines
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-emerald-50/60 border-b border-emerald-100">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-emerald-900/80 min-w-[160px]">Item</th>
              <th className="text-right px-2 py-2 font-medium text-emerald-900/80 w-20">Qty</th>
              <th className="text-right px-2 py-2 font-medium text-emerald-900/80 w-24">Rate</th>
              <th className="text-right px-2 py-2 font-medium text-emerald-900/80 w-24">Discount</th>
              <th className="text-left px-2 py-2 font-medium text-emerald-900/80 min-w-[140px]">Branch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line, idx) => (
              <tr key={line.name || `${line.item_code}-${idx}`}>
                <td className="px-3 py-2 text-slate-800 align-top">
                  <div className="font-medium">{line.item_name || line.item_code}</div>
                  <div className="text-[10px] font-mono text-slate-500">{line.item_code}</div>
                </td>
                <td className="px-2 py-2 align-top">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    disabled={disabled}
                    value={line.qty}
                    onChange={(e) => patchLine(idx, { qty: Number(e.target.value || 0) })}
                    className="w-full rounded-lg border border-emerald-200/70 bg-white px-2 py-1.5 text-right tabular-nums text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25 disabled:bg-emerald-50/50"
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    disabled={disabled}
                    value={line.rate}
                    onChange={(e) => patchLine(idx, { rate: Number(e.target.value || 0) })}
                    className="w-full rounded-lg border border-emerald-200/70 bg-white px-2 py-1.5 text-right tabular-nums text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25 disabled:bg-emerald-50/50"
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    disabled={disabled}
                    value={line.discount_amount}
                    onChange={(e) => patchLine(idx, { discount_amount: Number(e.target.value || 0) })}
                    className="w-full rounded-lg border border-emerald-200/70 bg-white px-2 py-1.5 text-right tabular-nums text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25 disabled:bg-emerald-50/50"
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <input
                    type="text"
                    list={`invoice-cc-${idx}`}
                    disabled={disabled}
                    value={line.cost_center}
                    onChange={(e) => patchLine(idx, { cost_center: e.target.value })}
                    placeholder="Cost center"
                    className="w-full rounded-lg border border-emerald-200/70 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25 disabled:bg-emerald-50/50"
                  />
                  <datalist id={`invoice-cc-${idx}`}>
                    {costCenters.map((cc) => (
                      <option key={cc.name} value={cc.name}>
                        {cc.label || cc.name}
                      </option>
                    ))}
                  </datalist>
                  {ccLoading ? (
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Branches…
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
