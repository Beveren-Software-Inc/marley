import { useState, useEffect, useCallback } from 'react'
import { Search, Droplet, Calendar, User, FlaskConical, RefreshCw, X, ExternalLink } from 'lucide-react'
import { fetchSampleCollections, type SampleCollectionRow } from '../../services/common'

interface SampleCollectionListProps {
  patient?: string
  refreshKey?: number
}

const STATUS_STYLES: Record<string, string> = {
  'Collected':       'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Partly Collected':'bg-amber-50 text-amber-700 border-amber-200',
  'Pending':         'bg-slate-100 text-slate-600 border-slate-200',
}

function formatDateTime(dt: string | null) {
  if (!dt) return '—'
  try {
    return new Date(dt).toLocaleString('en-GB')
  } catch { return dt }
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value || '—'}</p>
    </div>
  )
}

export const SampleCollectionList = ({ patient, refreshKey = 0 }: SampleCollectionListProps) => {
  const [rows, setRows]       = useState<SampleCollectionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState<SampleCollectionRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchSampleCollections(search || undefined, patient)
      setRows(data)
    } finally {
      setLoading(false)
    }
  }, [search, patient, refreshKey])

  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0)
    return () => clearTimeout(t)
  }, [load])

  return (
    <div className="flex flex-col gap-3">

      {/* Search + refresh */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sample collections…"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button type="button" onClick={load} title="Refresh"
          className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Table */}
      {loading && rows.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Droplet className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No sample collections found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
                  <div className="flex items-center gap-1.5"><Droplet className="w-3 h-3" /> Sample / Type</div>
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
                  <div className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Collection Date & Time</div>
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
                  <div className="flex items-center gap-1.5"><User className="w-3 h-3" /> Collector</div>
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
                  <div className="flex items-center gap-1.5"><FlaskConical className="w-3 h-3" /> Tagged Lab Test(s)</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(row => (
                <tr
                  key={row.name}
                  onClick={() => setSelected(row)}
                  className="cursor-pointer transition-colors hover:bg-slate-50"
                >
                  {/* Sample / Type */}
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-800">{row.sample || row.name}</div>
                    {row.sample_type && (
                      <div className="text-xs text-slate-500 mt-0.5">{row.sample_type}</div>
                    )}
                    {row.patient_name && (
                      <div className="text-xs text-primary mt-0.5">{row.patient_name}</div>
                    )}
                  </td>

                  {/* Date & Time */}
                  <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">
                    {formatDateTime(row.collected_time)}
                  </td>

                  {/* Collector */}
                  <td className="px-3 py-2.5 text-slate-700">
                    {row.collector_name || row.collected_by || <span className="text-slate-400">—</span>}
                  </td>

                  {/* Tagged Lab Tests */}
                  <td className="px-3 py-2.5">
                    {row.lab_tests && row.lab_tests.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {row.lab_tests.map(lt => (
                          <span key={lt.name}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                            <FlaskConical className="w-2.5 h-2.5" />
                            {lt.lab_test_name || lt.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">No lab tests linked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Right-side detail slide-over */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end"
          onClick={() => setSelected(null)}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative z-10 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="shrink-0 flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-800">{selected.name}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[selected.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                    {selected.status || 'Pending'}
                  </span>
                  <a
                    href={`/app/sample-collection/${encodeURIComponent(selected.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline flex-shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open in Frappe
                  </a>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selected.patient_name || selected.patient || 'No patient linked'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-lg bg-cyan-50 border border-cyan-100 px-3 py-3 text-center">
                  <p className="text-base font-bold text-cyan-800">{selected.sample || '—'}</p>
                  <p className="text-xs text-cyan-500 mt-0.5">Sample</p>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-3 text-center">
                  <p className="text-base font-bold text-blue-800">{selected.sample_type || '—'}</p>
                  <p className="text-xs text-blue-500 mt-0.5">Sample Type</p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-3 text-center">
                  <p className="text-base font-bold text-slate-700">{selected.lab_tests?.length ?? 0}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Linked Lab Tests</p>
                </div>
              </div>

              {/* Collection details */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Collection Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Patient"               value={selected.patient_name || selected.patient} />
                  <Field label="Patient Age"           value={selected.patient_age} />
                  <Field label="Sample"                value={selected.sample} />
                  <Field label="Sample Type"           value={selected.sample_type} />
                  <Field label="UOM"                   value={selected.sample_uom} />
                  <Field label="Collection Date & Time" value={formatDateTime(selected.collected_time)} />
                  <Field label="Collected By"          value={selected.collector_name || selected.collected_by} />
                </div>
              </div>

              {/* Linked lab tests */}
              {selected.lab_tests && selected.lab_tests.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Linked Lab Tests</h3>
                  <div className="flex flex-col gap-2">
                    {selected.lab_tests.map(lt => (
                      <div key={lt.name}
                        className="flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200">
                        <FlaskConical className="w-4 h-4 text-blue-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-blue-800 truncate">
                            {lt.lab_test_name || lt.name}
                          </p>
                          {lt.patient_name && (
                            <p className="text-xs text-blue-600">{lt.patient_name}</p>
                          )}
                        </div>
                        <a
                          href={`/app/lab-test/${encodeURIComponent(lt.name)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
                        >
                          <ExternalLink className="w-3 h-3" /> Open
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 px-6 py-4 border-t border-slate-200 bg-slate-50 flex gap-3">
              <a
                href={`/app/sample-collection/${encodeURIComponent(selected.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition"
              >
                <ExternalLink className="w-4 h-4" /> Open in Frappe
              </a>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-100 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
