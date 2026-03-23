import { useEffect, useRef, useState } from 'react'
import { fetchGroomingCharts, type GroomingChartRow } from '../../services/groomingCharts'

interface GroomingChartListProps {
  patient?: string
  refreshKey?: number
  onCreateNew?: () => void
}

const CheckIcon = ({ checked }: { checked: boolean }) =>
  checked ? (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">✓</span>
  ) : (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-400 text-xs">—</span>
  )

const SectionLabel = ({ label }: { label: string }) => (
  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1 mt-3">{label}</div>
)

const CheckRow = ({ label, value }: { label: string; value: 0 | 1 | undefined | null }) => (
  <div className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
    <span className="text-xs text-slate-600">{label}</span>
    <CheckIcon checked={!!value} />
  </div>
)

export const GroomingChartList = ({ patient, refreshKey, onCreateNew }: GroomingChartListProps) => {
  const [charts, setCharts] = useState<GroomingChartRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<GroomingChartRow | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async (q?: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchGroomingCharts(patient, q)
      setCharts(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load grooming charts')
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

  // close panel on outside click
  useEffect(() => {
    if (!selected) return
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setSelected(null)
      }
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
              title="New Grooming Chart"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Chart
            </button>
          </div>
        )}
      </div>

      {loading && <div className="text-sm text-slate-500 py-4 text-center">Loading…</div>}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{error}</div>
      )}

      {!loading && !error && charts.length === 0 && (
        <div className="p-4 text-sm text-slate-600 border border-dashed border-slate-300 rounded-md text-center">
          No grooming charts found.
        </div>
      )}

      {!loading && charts.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Patient</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Admission No</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Cost Centre</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-600">Hygiene</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-600">Meals</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {charts.map((c) => {
                const hygieneCount = [
                  c.brush_teeth_morning, c.change_clothes_morning, c.brush_teeth_noon,
                  c.change_clothes_noon, c.shower, c.bowel, c.bed_wetting,
                ].filter(Boolean).length
                const mealCount = [
                  c.breakfast, c.snack_1, c.lunch, c.snack_2, c.dinner, c.snack_3,
                ].filter(Boolean).length
                return (
                  <tr
                    key={c.name}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => setSelected(c)}
                  >
                    <td className="px-3 py-2 text-slate-900 font-medium">{c.date || formatDate(c.creation)}</td>
                    <td className="px-3 py-2 text-slate-800">{c.patient_name || c.file_no || '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{c.admission_no || '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{c.cost_center || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${hygieneCount >= 5 ? 'bg-emerald-100 text-emerald-700' : hygieneCount >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                        {hygieneCount}/7
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${mealCount >= 5 ? 'bg-emerald-100 text-emerald-700' : mealCount >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                        {mealCount}/6
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{c.weight != null ? `${c.weight} kg` : '—'}</td>
                  </tr>
                )
              })}
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
            {/* Panel Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
              <div>
                <div className="text-base font-semibold text-slate-900">Grooming Chart</div>
                <div className="text-xs text-slate-500 mt-0.5">{selected.name}</div>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`/app/ip-grooming-chart/${encodeURIComponent(selected.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Open in Frappe ↗
                </a>
                <button
                  onClick={() => setSelected(null)}
                  className="text-slate-400 hover:text-slate-700 text-xl leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-5 flex flex-col gap-6">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Date', value: selected.date || formatDate(selected.creation) },
                  { label: 'Patient', value: selected.patient_name || selected.file_no || '—' },
                  { label: 'Admission', value: selected.admission_no || '—' },
                  { label: 'Cost Centre', value: selected.cost_center || '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
                    <div className="text-sm font-semibold text-slate-800 mt-1 truncate" title={value}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Hygiene */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-sm font-semibold text-slate-800 mb-3">Hygiene & Care</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                  <div>
                    <SectionLabel label="Morning" />
                    <CheckRow label="Brush Teeth" value={selected.brush_teeth_morning} />
                    <CheckRow label="Change Clothes" value={selected.change_clothes_morning} />
                  </div>
                  <div>
                    <SectionLabel label="Noon" />
                    <CheckRow label="Brush Teeth" value={selected.brush_teeth_noon} />
                    <CheckRow label="Change Clothes" value={selected.change_clothes_noon} />
                  </div>
                  <div className="sm:col-span-2 mt-1">
                    <SectionLabel label="General" />
                    <div className="grid grid-cols-3 gap-x-4">
                      <CheckRow label="Shower" value={selected.shower} />
                      <CheckRow label="Bowel" value={selected.bowel} />
                      <CheckRow label="Bed Wetting" value={selected.bed_wetting} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Meals */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-sm font-semibold text-slate-800 mb-3">Meals</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6">
                  <CheckRow label="Breakfast" value={selected.breakfast} />
                  <CheckRow label="Snack 1" value={selected.snack_1} />
                  <CheckRow label="Lunch" value={selected.lunch} />
                  <CheckRow label="Snack 2" value={selected.snack_2} />
                  <CheckRow label="Dinner" value={selected.dinner} />
                  <CheckRow label="Snack 3" value={selected.snack_3} />
                </div>
              </div>

              {/* Measurements */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-sm font-semibold text-slate-800 mb-3">Measurements</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold mb-1">Weight</div>
                    <div className="text-sm font-semibold text-slate-800">
                      {selected.weight != null ? `${selected.weight} kg` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold mb-1">LMP</div>
                    <div className="text-sm font-semibold text-slate-800">
                      {selected.lmp ? formatDate(selected.lmp) : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}