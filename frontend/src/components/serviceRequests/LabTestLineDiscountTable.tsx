import { useFormatMoney } from '../../hooks/useFormatMoney'
import type { MultiLabPricingLine } from '../../services/serviceRequests'
import {
  defaultLineDiscount,
  type DiscountType,
  type LabLineDiscount,
} from '../../utils/labTestDiscounts'
import { linkComboboxInputClass as inputClass } from '../ui/linkComboboxStyles'

interface LabTestLineDiscountTableProps {
  lines: MultiLabPricingLine[]
  lineDiscounts: Record<string, LabLineDiscount>
  onChange: (template: string, patch: Partial<LabLineDiscount>) => void
  readOnly?: boolean
}

export function LabTestLineDiscountTable({
  lines,
  lineDiscounts,
  onChange,
  readOnly = false,
}: LabTestLineDiscountTableProps) {
  const formatMoney = useFormatMoney()

  if (!lines.length) return null

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            <th className="px-3 py-2.5">Test</th>
            <th className="px-3 py-2.5 text-right">Amount</th>
            <th className="px-3 py-2.5">Discount type</th>
            <th className="px-3 py-2.5 text-right">Discount</th>
            <th className="px-3 py-2.5 text-right">Net</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const d = lineDiscounts[line.template] || defaultLineDiscount()
            const net = line.net_amount ?? line.amount
            const applied = line.discount_applied ?? 0
            return (
              <tr key={line.template} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2.5">
                  <div className="font-medium text-slate-900">{line.lab_test_name || line.template}</div>
                  {line.parent_group ? (
                    <div className="text-xs text-slate-500">Group: {line.parent_group}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                  {formatMoney(line.amount)}
                </td>
                <td className="px-3 py-2.5">
                  {readOnly ? (
                    <span className="text-slate-600">{d.discount_type}</span>
                  ) : (
                    <select
                      value={d.discount_type}
                      onChange={(e) =>
                        onChange(line.template, {
                          discount_type: e.target.value as DiscountType,
                          discount_rate: 0,
                          discount: 0,
                        })
                      }
                      className={`${inputClass} py-1.5 text-xs`}
                    >
                      <option value="Percentage">Percentage (%)</option>
                      <option value="Amount">Fixed amount</option>
                    </select>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {readOnly ? (
                    <span className="tabular-nums text-slate-600">
                      {d.discount_type === 'Amount'
                        ? formatMoney(d.discount)
                        : `${d.discount_rate}%`}
                    </span>
                  ) : d.discount_type === 'Amount' ? (
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={d.discount || ''}
                      onChange={(e) =>
                        onChange(line.template, {
                          discount: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className={`${inputClass} py-1.5 text-right text-xs tabular-nums`}
                      placeholder="0"
                    />
                  ) : (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={d.discount_rate || ''}
                      onChange={(e) =>
                        onChange(line.template, {
                          discount_rate: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                        })
                      }
                      className={`${inputClass} py-1.5 text-right text-xs tabular-nums`}
                      placeholder="0"
                    />
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="font-semibold tabular-nums text-emerald-800">{formatMoney(net)}</div>
                  {applied > 0 ? (
                    <div className="text-xs tabular-nums text-slate-500">−{formatMoney(applied)}</div>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
