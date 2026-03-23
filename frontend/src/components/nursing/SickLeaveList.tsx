import { useEffect, useRef, useState } from 'react'
import { fetchSickLeaves, type SickLeaveRow } from '../../services/sickLeave'

interface SickLeaveListProps {
  patient?: string
  refreshKey?: number
  onCreateNew?: () => void
}

export const SickLeaveList = ({ patient, refreshKey, onCreateNew }: SickLeaveListProps) => {
  const [records, setRecords] = useState<SickLeaveRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SickLeaveRow | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async (q?: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSickLeaves(patient, q)
      setRecords(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sick leave records')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient, refreshKey])

  const handleSearchChange = (q: string) => {
    setSearch(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(q), 350)
  }

  useEffect(() => {
    if (!selected) return
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setSelected(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [selected])

  const formatDate = (val: string | null | undefined) => {
    if (!val) return '—'
    try { return new Date(val).toLocaleDateString() } catch { return val }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Search Patient</label>
          <input
            type="search"
            placeholder="Search by patient name…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {onCreateNew && (
          <div className="flex items-end">
            <button
              onClick={onCreateNew}
              className="px-3 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors flex items-center gap-2"
              title="New Sick Leave"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Sick Leave
            </button>
          </div>
        )}
      </div>

      {loading && <div className="text-sm text-slate-500 py-4 text-center">Loading…</div>}
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{error}</div>}

      {!loading && !error && records.length === 0 && (
        <div className="p-4 text-sm text-slate-600 border border-dashed border-slate-300 rounded-md text-center">
          No sick leave records found.
        </div>
      )}

      {!loading && records.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Patient</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Admission No</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">From Date</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">To Date</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-600">Days</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Doctor</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Diagnosis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.name} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(r)}>
                  <td className="px-3 py-2 text-slate-900 font-medium">{r.patient_name || r.patient || '—'}</td>
                  <td className="px-3 py-2 text-slate-700">{r.admission_no || '—'}</td>
                  <td className="px-3 py-2 text-slate-800">{r.from_date || '—'}</td>
                  <td className="px-3 py-2 text-slate-800">{r.to_date || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    {r.days ? (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-blue-100 text-blue-700">
                        {r.days}d
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{r.doctor || '—'}</td>
                  <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate" title={r.diagnosis || ''}>
                    {r.diagnosis || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Right-side detail slide-over */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" aria-modal="true">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelected(null)} />
          <div
            ref={panelRef}
            className="relative z-10 flex flex-col bg-white shadow-2xl w-full max-w-2xl h-full overflow-y-auto"
            style={{ scrollbarWidth: 'thin' }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
              <div>
                <div className="text-base font-semibold text-slate-900">Sick Leave</div>
                <div className="text-xs text-slate-500 mt-0.5">{selected.name}</div>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`/app/sick-leave/${encodeURIComponent(selected.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Open in Frappe ↗
                </a>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700 text-xl leading-none" aria-label="Close">×</button>
              </div>
            </div>

            <div className="p-5 flex flex-col gap-5">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Patient', value: selected.patient_name || selected.patient || '—' },
                  { label: 'Admission', value: selected.admission_no || '—' },
                  { label: 'Days', value: selected.days ? `${selected.days} day(s)` : '—' },
                  { label: 'Source', value: selected.source || '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
                    <div className="text-sm font-semibold text-slate-800 mt-1 truncate" title={value}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Leave Period */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-sm font-semibold text-slate-800 mb-3">Leave Period</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold mb-0.5">From Date</div>
                    <div className="text-sm font-semibold text-slate-800">{selected.from_date || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold mb-0.5">To Date</div>
                    <div className="text-sm font-semibold text-slate-800">{selected.to_date || '—'}</div>
                  </div>
                </div>
              </div>

              {/* Clinical Details */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-sm font-semibold text-slate-800 mb-3">Clinical Details</div>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <div className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold mb-0.5">Doctor</div>
                    <div className="text-sm font-semibold text-slate-800">{selected.doctor || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold mb-0.5">Created</div>
                    <div className="text-sm font-semibold text-slate-800">{formatDate(selected.creation)}</div>
                  </div>
                </div>
                {selected.diagnosis && (
                  <div>
                    <div className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold mb-1">Diagnosis</div>
                    <div className="text-sm text-slate-800 bg-slate-50 rounded-md p-3 leading-relaxed">{selected.diagnosis}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
