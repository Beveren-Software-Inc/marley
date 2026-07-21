import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../../services/apiClient'
import { toast } from '../../hooks/useToast'

/**
 * DOC-008 - overdue clinical actions tile for the doctor landing dashboard.
 * Surfaces lab results awaiting review, overdue follow-ups and visits left
 * open past their encounter date.
 */

interface OverdueAction {
  type: string
  reference_doctype: string
  reference: string
  patient?: string
  patient_name?: string
  detail?: string
  since?: string
}

const TONE: Record<string, string> = {
  'Lab result awaiting review': 'bg-amber-100 text-amber-800 border-amber-200',
  'Follow-up overdue': 'bg-red-100 text-red-800 border-red-200',
  'Visit documentation incomplete': 'bg-blue-100 text-blue-800 border-blue-200',
}

export const OverdueClinicalActions = ({ costCenter }: { costCenter?: string }) => {
  const [rows, setRows] = useState<OverdueAction[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (costCenter) qs.set('cost_center', costCenter)
      const res = await apiRequest<{ message: OverdueAction[] }>(
        `/api/method/healthcare.api.patient_indicators.get_overdue_clinical_actions?${qs.toString()}`
      )
      setRows(res?.message ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load overdue actions')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [costCenter])

  useEffect(() => {
    load()
  }, [load])

  const grouped = rows.reduce<Record<string, OverdueAction[]>>((acc, r) => {
    ;(acc[r.type] ||= []).push(r)
    return acc
  }, {})

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {Object.entries(grouped).map(([type, list]) => (
            <span
              key={type}
              className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                TONE[type] || 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {type}: {list.length}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Action</th>
              <th className="px-3 py-2 text-left font-medium">Patient</th>
              <th className="px-3 py-2 text-left font-medium">Detail</th>
              <th className="px-3 py-2 text-left font-medium">Reference</th>
              <th className="px-3 py-2 text-left font-medium">Since</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  Nothing overdue. All clinical actions are up to date.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={`${r.reference_doctype}-${r.reference}`} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${
                        TONE[r.type] || 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {r.type}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.patient_name || r.patient || '—'}</td>
                  <td className="px-3 py-2">{r.detail || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{r.reference}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {r.since ? String(r.since).slice(0, 10) : '—'}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
