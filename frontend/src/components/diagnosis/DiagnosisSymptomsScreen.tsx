import { useState, useEffect, useCallback, useMemo } from 'react'
import { getAllMedicalDiagnosisEntries, type PatientDiagnosisAggRow } from '../../services/common'
import { Plus } from 'lucide-react'
import { PatientDiagnosisModal } from './PatientDiagnosisModal'

function formatDate(val?: string): string {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return val
  }
}

/** Preview Text Editor HTML as plain text */
function stripHtml(html: string): string {
  if (!html || typeof document === 'undefined') return html || ''
  const d = document.createElement('div')
  d.innerHTML = html
  return (d.textContent || d.innerText || '').trim() || '—'
}

function contextLabel(row: PatientDiagnosisAggRow): string {
  if (row.visit_num) return `OP · ${row.visit_num}`
  if (row.inpatient_admission) return `IP · ${row.inpatient_admission}`
  return '—'
}

export function DiagnosisSymptomsScreen() {
  const [rows, setRows] = useState<PatientDiagnosisAggRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showAddModal, setShowAddModal] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getAllMedicalDiagnosisEntries({ limit: 500 })
      setRows(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load diagnoses'
      setError(msg)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => {
      const haystack = [
        row.name,
        row.patient,
        row.patient_name,
        row.visit_num,
        row.inpatient_admission,
        row.diagnosis,
        row.diagnosis_name,
        row.disease_no,
        row.diagnosis_group_name,
        row.practitioner,
        row.practitioner_name,
        row.cost_center,
        stripHtml(row.details || ''),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [rows, search])

  return (
    <div className="flex flex-col">
      <div className="p-4 space-y-4">
        <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50/80">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Medical Diagnosis Entry</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                All diagnosis records · newest first
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search patient, visit, diagnosis…"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm min-w-[200px] max-w-xs shadow-sm placeholder:text-slate-400 hover:border-emerald-300/80 focus:border-emerald-400/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
              />
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white text-lg font-bold leading-none hover:bg-primary/90 transition-colors"
                title="Add diagnosis"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="p-4">
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-slate-500 text-sm justify-center">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Loading…
              </div>
            ) : filteredRows.length === 0 ? (
              <p className="text-sm text-slate-500 italic py-6 text-center">
                {search.trim() ? 'No diagnoses match your search.' : 'No Medical Diagnosis Entry records yet.'}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-slate-100">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">
                        Entry
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">
                        Patient
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">
                        Visit / Admission
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">
                        Diagnosis no.
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Name
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Group
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Details
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">
                        Practitioner
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">
                        Cost center
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">
                        Posting date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row, idx) => (
                      <tr key={row.name || `${row.diagnosis}-${idx}`} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2.5 align-top font-mono text-xs text-slate-600 whitespace-nowrap">
                          {row.name || '—'}
                        </td>
                        <td className="px-3 py-2.5 align-top text-slate-800 whitespace-nowrap">
                          <div className="font-medium">{row.patient_name?.trim() || row.patient || '—'}</div>
                          {row.patient && row.patient_name ? (
                            <div className="text-xs text-slate-500 font-mono">{row.patient}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 align-top font-mono text-xs text-slate-700 whitespace-nowrap">
                          {contextLabel(row)}
                        </td>
                        <td className="px-3 py-2.5 align-top font-mono text-sm text-slate-800 whitespace-nowrap">
                          {row.disease_no || row.diagnosis || '—'}
                        </td>
                        <td className="px-3 py-2.5 align-top font-medium text-slate-900">
                          {row.diagnosis_name?.trim() || row.diagnosis || '—'}
                        </td>
                        <td className="px-3 py-2.5 align-top text-sm text-slate-600">
                          {row.diagnosis_group_name || '—'}
                        </td>
                        <td
                          className="px-3 py-2.5 text-slate-600 max-w-md align-top"
                          title={stripHtml(row.details || '')}
                        >
                          <span className="line-clamp-3">{stripHtml(row.details || '')}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap align-top">
                          {row.practitioner_name || row.practitioner || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap align-top">
                          {row.cost_center || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap align-top">
                          {formatDate(row.posting_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && rows.length >= 500 ? (
              <p className="text-xs text-slate-500 mt-3 text-center">
                Showing the 500 most recent entries. Use search to narrow results.
              </p>
            ) : null}
          </div>
        </section>
      </div>

      {showAddModal && (
        <PatientDiagnosisModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false)
            setRefreshKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}
