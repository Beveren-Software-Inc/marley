import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  fetchIndicatorDashboard,
  snapshotIndicators,
  type QualityIndicatorRow,
} from '../../services/qualityIndicators'
import { toast } from '../../hooks/useToast'
import { DateFilterInput } from '../ui/DateFilterInput'

const CATEGORIES = [
  'Patient Safety',
  'Clinical Effectiveness',
  'Patient Experience',
  'Timeliness & Access',
  'Documentation & Compliance',
]

const firstOfMonth = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
const lastOfMonth = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

const monthYearLabel = (start?: string) => {
  if (!start) return '—'
  const d = new Date(`${start}T00:00:00`)
  if (Number.isNaN(d.getTime())) return start
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

const formatValue = (row: QualityIndicatorRow) => {
  const v = Number(row.value ?? 0)
  switch (row.unit) {
    case 'Percentage':
      return `${v.toFixed(2)}%`
    case 'Rate per 1000':
      return `${v.toFixed(2)} /1000`
    case 'Hours':
      return `${v.toFixed(1)} h`
    case 'Days':
      return `${v.toFixed(1)} d`
    default:
      return String(v)
  }
}

const DetailLine = ({ label, value }: { label: string; value?: string | null }) => (
  <div>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-0.5 text-sm text-slate-800 whitespace-pre-wrap">{value?.trim() || '—'}</p>
  </div>
)

export const QualityIndicatorsBoard = () => {
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(lastOfMonth())
  const [category, setCategory] = useState('')
  const [rows, setRows] = useState<QualityIndicatorRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(
        await fetchIndicatorDashboard({
          period_start: from,
          period_end: to,
          category: category || undefined,
        })
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load quality indicators')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [from, to, category])

  useEffect(() => {
    load()
  }, [load])

  const snapshot = async () => {
    setSaving(true)
    try {
      const n = await snapshotIndicators({ period_start: from, period_end: to })
      toast.success(n ? `${n} indicator results saved` : 'Results already saved for this period')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save snapshot')
    } finally {
      setSaving(false)
    }
  }

  const metCount = rows.filter((r) => r.met).length
  const withTarget = rows.filter((r) => r.target_value).length

  const grouped = (() => {
    const map = new Map<string, QualityIndicatorRow[]>()
    for (const r of rows) {
      const key =
        (r.area_monitored || r.category || 'Quality Indicators').trim() || 'Quality Indicators'
      const list = map.get(key)
      if (list) list.push(r)
      else map.set(key, [r])
    }
    return Array.from(map.entries()).map(([key, groupRows]) => ({ key, rows: groupRows }))
  })()

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600">From</label>
          <DateFilterInput
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">To</label>
          <DateFilterInput
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={snapshot}
          disabled={saving || !rows.length}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          title="Freeze these values as Quality Indicator Result records"
        >
          {saving ? 'Saving…' : 'Save Snapshot'}
        </button>
        {withTarget > 0 && (
          <span className="ml-auto text-sm text-slate-600">
            <strong className={metCount === withTarget ? 'text-green-600' : 'text-amber-600'}>
              {metCount}/{withTarget}
            </strong>{' '}
            targets met
          </span>
        )}
      </div>

      {loading && <p className="py-6 text-center text-sm text-slate-500">Loading indicators…</p>}

      {!loading && rows.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">
          No active quality indicators. Use + to complete a KPI Report.
        </p>
      )}

      {!loading &&
        grouped.map((group) => (
          <div key={group.key} className="mb-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">{group.key}</h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Indicator</th>
                    <th className="px-3 py-2 text-left font-medium">Month / Year</th>
                    <th className="px-3 py-2 text-right font-medium">Numerator</th>
                    <th className="px-3 py-2 text-right font-medium">Denominator</th>
                    <th className="px-3 py-2 text-right font-medium">Percentage</th>
                    <th className="px-3 py-2 text-right font-medium">Target</th>
                    <th className="px-3 py-2 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((r) => {
                    const isOpen = expanded === r.indicator
                    return (
                      <Fragment key={r.indicator}>
                        <tr
                          className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                          onClick={() => setExpanded(isOpen ? null : r.indicator)}
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-800">{r.indicator_name}</div>
                            {r.indicator_code && (
                              <div className="text-[11px] text-slate-500">{r.indicator_code}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-700">{monthYearLabel(r.period_start)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.numerator}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {r.denominator || '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {formatValue(r)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                            {r.target_value ? `${r.target_value}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {r.target_value ? (
                              <span
                                className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${
                                  r.met
                                    ? 'border-green-200 bg-green-100 text-green-800'
                                    : 'border-red-200 bg-red-100 text-red-800'
                                }`}
                              >
                                {r.met ? 'Met' : 'Not met'}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-t border-slate-100 bg-slate-50/70">
                            <td colSpan={7} className="px-4 py-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <DetailLine label="Area Monitored" value={r.area_monitored} />
                                <DetailLine label="Frequency" value={r.frequency} />
                                <DetailLine label="Numerator" value={r.numerator_description} />
                                <DetailLine label="Denominator" value={r.denominator_description} />
                                <div className="sm:col-span-2">
                                  <DetailLine label="Indicator" value={r.indicator_formula} />
                                </div>
                                <div className="sm:col-span-2">
                                  <DetailLine
                                    label="Selection Criteria"
                                    value={
                                      r.selection_criteria?.length
                                        ? r.selection_criteria.join(' · ')
                                        : undefined
                                    }
                                  />
                                </div>
                                <DetailLine label="Source of Data" value={r.source_of_data} />
                                <DetailLine label="Responsible Person" value={r.responsible_person} />
                                <DetailLine label="Reported To" value={r.reported_to} />
                                <DetailLine label="Category" value={r.category} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </section>
  )
}
