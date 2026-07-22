import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../../services/apiClient'
import { DoctypeListPanel } from '../generic/DoctypeListPanel'
import { toast } from '../../hooks/useToast'

interface PromotionRow {
  promotion: string
  promotion_name: string
  op_count: number
  ip_count: number
  total_count: number
  invoice_count: number
  invoiced_value: number
  discount_given: number
}

interface AnalysisResult {
  from_date: string
  to_date: string
  rows: PromotionRow[]
  totals: { op: number; ip: number; invoiced_value: number; discount_given: number }
}

const startOfYear = () => `${new Date().getFullYear()}-01-01`
const today = () => new Date().toISOString().slice(0, 10)

export const PromotionAnalysis = () => {
  const [tab, setTab] = useState<'analysis' | 'master'>('analysis')
  const [from, setFrom] = useState(startOfYear())
  const [to, setTo] = useState(today())
  const [data, setData] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ from_date: from, to_date: to })
      const res = await apiRequest<{ message: AnalysisResult }>(
        `/api/method/healthcare.api.promotions.get_promotion_analysis?${qs.toString()}`
      )
      setData(res?.message ?? null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load promotion analysis')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    if (tab === 'analysis') load()
  }, [tab, load])

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['analysis', 'master'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t
                ? 'border-primary bg-primary text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t === 'analysis' ? 'Analysis' : 'Promotions'}
          </button>
        ))}
      </div>

      {tab === 'master' && (
        <DoctypeListPanel
          doctype="Promotion"
          columns={[
            { fieldname: 'promotion_name', label: 'Promotion' },
            { fieldname: 'promotion_code', label: 'Code' },
            { fieldname: 'applies_to', label: 'Applies To' },
            { fieldname: 'discount_type', label: 'Discount Type' },
            { fieldname: 'discount_value', label: 'Value' },
            { fieldname: 'valid_from', label: 'From' },
            { fieldname: 'valid_upto', label: 'Upto' },
            {
              fieldname: 'is_active',
              label: 'Active',
              render: (r) => (r.is_active ? 'Yes' : 'No'),
            },
          ]}
          createFields={[
            { fieldname: 'promotion_name', label: 'Promotion Name', fieldtype: 'Data', reqd: true },
            { fieldname: 'promotion_code', label: 'Code', fieldtype: 'Data' },
            {
              fieldname: 'applies_to',
              label: 'Applies To',
              fieldtype: 'Select',
              options: 'Both\nOP\nIP',
              default: 'Both',
            },
            { fieldname: 'valid_from', label: 'Valid From', fieldtype: 'Date', reqd: true },
            { fieldname: 'valid_upto', label: 'Valid Upto', fieldtype: 'Date' },
            {
              fieldname: 'discount_type',
              label: 'Discount Type',
              fieldtype: 'Select',
              options: 'Percentage\nAmount',
              default: 'Percentage',
            },
            { fieldname: 'discount_value', label: 'Discount Value', fieldtype: 'Float' },
            {
              fieldname: 'patient_category',
              label: 'Limit to Patient Category',
              fieldtype: 'Link',
              options: 'Patient Category',
            },
            { fieldname: 'description', label: 'Description', fieldtype: 'Small Text' },
          ]}
          createDefaults={{ is_active: 1 }}
          emptyMessage="No promotions defined yet."
        />
      )}

      {tab === 'analysis' && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={load}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>

          {loading && <p className="py-6 text-center text-sm text-slate-500">Loading…</p>}

          {!loading && data && (
            <>
              <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['OP uptake', data.totals.op],
                  ['IP uptake', data.totals.ip],
                  ['Invoiced value', data.totals.invoiced_value.toFixed(3)],
                  ['Discount given', data.totals.discount_given.toFixed(3)],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-md border border-slate-200 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
                    <div className="text-lg font-semibold text-slate-800">{value}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Promotion</th>
                      <th className="px-3 py-2 text-right font-medium">OP</th>
                      <th className="px-3 py-2 text-right font-medium">IP</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2 text-right font-medium">Invoices</th>
                      <th className="px-3 py-2 text-right font-medium">Invoiced Value</th>
                      <th className="px-3 py-2 text-right font-medium">Discount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                          No promotion tagged on any visit, admission or invoice in this period.
                        </td>
                      </tr>
                    )}
                    {data.rows.map((r) => (
                      <tr key={r.promotion} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-800">{r.promotion_name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.op_count}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.ip_count}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {r.total_count}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.invoice_count}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.invoiced_value.toFixed(3)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.discount_given.toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
