import { useEffect, useState } from 'react'
import {
  fetchConsolidatedECTDetails,
  type ConsolidatedECTDetail,
} from '../../services/ectDetails'

interface ConsolidatedECTDetailsListProps {
  patient?: string
  refreshKey?: number | string
  onPatientClick?: (patient: string) => void
}

function formatDate(value?: string) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-GB')
  } catch {
    return value
  }
}

export function ConsolidatedECTDetailsList({
  patient,
  refreshKey,
  onPatientClick,
}: ConsolidatedECTDetailsListProps) {
  const [rows, setRows] = useState<ConsolidatedECTDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchConsolidatedECTDetails(100, 0, patient, search.trim() || undefined)
        if (!cancelled) setRows(data)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load consolidated ECT details'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    const t = setTimeout(load, search ? 250 : 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [patient, refreshKey, search])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading consolidated ECT details…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Consolidated ECT Details</h3>
          <p className="text-red-700 text-sm">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Patients who have ECT Details records, with how many times they have appeared.
      </p>

      {!patient ? (
        <div className="max-w-sm">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patient…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="flex items-center justify-center p-8">
          <div className="text-slate-500">NO CONSOLIDATED ECT DETAILS FOUND</div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="min-w-full whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Patient
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  ECT Details count
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  First ECT
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Last ECT
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.patient} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {onPatientClick ? (
                      <button
                        type="button"
                        onClick={() => onPatientClick(row.patient)}
                        className="text-sm font-medium text-primary hover:underline text-left"
                      >
                        {row.patient_name || row.patient}
                      </button>
                    ) : (
                      <span className="text-sm font-medium text-slate-900">
                        {row.patient_name || row.patient}
                      </span>
                    )}
                    <div className="text-xs text-slate-500">{row.patient}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex min-w-[2.5rem] items-center justify-center rounded-full bg-blue-50 px-2.5 py-1 text-sm font-semibold text-blue-800 border border-blue-100">
                      {row.ect_count}
                    </span>
                    <span className="ml-2 text-xs text-slate-500">
                      {row.ect_count === 1 ? 'session' : 'sessions'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatDate(row.first_ect_date)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatDate(row.last_ect_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
