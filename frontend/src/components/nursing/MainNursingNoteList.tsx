import { useEffect, useRef, useState } from 'react'
import { fetchMainNursingNotes, type MainNursingNoteRow } from '../../services/mainNursingNote'

interface MainNursingNoteListProps {
  patient?: string
  admission?: string
  refreshKey?: number
  onPatientClick?: (patient: string) => void
}

export const MainNursingNoteList = ({
  patient,
  admission,
  refreshKey,
  onPatientClick,
}: MainNursingNoteListProps) => {
  const [records, setRecords] = useState<MainNursingNoteRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<MainNursingNoteRow | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async (q?: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMainNursingNotes(patient, q, admission)
      setRecords(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load nursing notes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient, admission, refreshKey])

  const handleSearchChange = (q: string) => {
    setSearch(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(q), 350)
  }

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
    try {
      return new Date(val).toLocaleDateString()
    } catch {
      return val
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!patient && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Search patient</label>
          <input
            type="search"
            placeholder="Search by patient name…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      )}

      {loading && <div className="text-sm text-slate-500 py-4 text-center">Loading…</div>}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{error}</div>
      )}

      {!loading && !error && records.length === 0 && (
        <div className="p-4 text-sm text-slate-600 border border-dashed border-slate-300 rounded-md text-center">
          No nursing notes found.
        </div>
      )}

      {!loading && records.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[min(60vh,32rem)] overflow-y-auto [scrollbar-width:thin]">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-[1]">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Shift</th>
                {!patient && (
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Patient</th>
                )}
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Admission</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Notes</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((row) => (
                <tr
                  key={row.name}
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => setSelected(row)}
                >
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.shift || '—'}</td>
                  {!patient && (
                    <td className="px-3 py-2">
                      {row.file_no && onPatientClick ? (
                        <button
                          type="button"
                          className="text-primary hover:underline text-left"
                          onClick={(e) => {
                            e.stopPropagation()
                            onPatientClick(row.file_no!)
                          }}
                        >
                          {row.patient_name || row.file_no}
                        </button>
                      ) : (
                        row.patient_name || row.file_no || '—'
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap">{row.admission || '—'}</td>
                  <td className="px-3 py-2 max-w-xs truncate text-slate-700">
                    {row.nursing_notes || '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {row.user_name || row.user || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
          <div
            ref={panelRef}
            className="w-full max-w-md h-full bg-white shadow-xl flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-slate-900">Nursing Note</h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-slate-500 hover:text-slate-800 text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">Trans No</div>
                <div className="font-medium">{selected.trans_no || selected.name}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold">Date</div>
                  <div>{formatDate(selected.date)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold">Start time</div>
                  <div>{selected.data || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold">Shift</div>
                  <div>{selected.shift || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold">Cost center</div>
                  <div>{selected.cost_center || '—'}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">Patient</div>
                <div>{selected.patient_name || selected.file_no || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">Admission</div>
                <div>{selected.admission || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">Nursing notes</div>
                <p className="mt-1 whitespace-pre-wrap text-slate-800 rounded-md bg-slate-50 border border-slate-200 p-3">
                  {selected.nursing_notes || '—'}
                </p>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">Recorded by</div>
                <div>{selected.user_name || selected.user || '—'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
