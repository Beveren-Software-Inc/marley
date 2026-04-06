// components/ybocs/YBOCSAssessmentList.tsx
import { useEffect, useRef, useState } from 'react'
import { Brain } from 'lucide-react'
import {
  fetchYBOCSAssessments,
  type YBOCSAssessmentRow,
} from '../../services/ybocs'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'

interface YBOCSAssessmentListProps {
  patient?: string
  refreshKey?: number
  onCreateNew?: () => void
}

const statusBadge = (docstatus: number) => {
  if (docstatus === 1)
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-100 text-emerald-700">
        Submitted
      </span>
    )
  if (docstatus === 2)
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-red-100 text-red-700">
        Cancelled
      </span>
    )
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-700">
      Draft
    </span>
  )
}

const severityBadge = (score: number) => {
  let severity = ''
  let colorClass = ''
  
  if (score <= 7) {
    severity = 'Subclinical'
    colorClass = 'bg-green-100 text-green-700 border-green-200'
  } else if (score <= 15) {
    severity = 'Mild'
    colorClass = 'bg-blue-100 text-blue-700 border-blue-200'
  } else if (score <= 23) {
    severity = 'Moderate'
    colorClass = 'bg-yellow-100 text-yellow-700 border-yellow-200'
  } else if (score <= 31) {
    severity = 'Severe'
    colorClass = 'bg-orange-100 text-orange-700 border-orange-200'
  } else {
    severity = 'Extreme'
    colorClass = 'bg-red-100 text-red-700 border-red-200'
  }
  
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${colorClass}`}>
      {severity}
    </span>
  )
}

export const YBOCSAssessmentList = ({
  patient,
  refreshKey,
  onCreateNew,
}: YBOCSAssessmentListProps) => {
  const [records, setRecords] = useState<YBOCSAssessmentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<YBOCSAssessmentRow | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async (q?: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchYBOCSAssessments(patient, q)
      setRecords(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load YBOCS assessments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [patient, refreshKey])

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

  const fmt = (val: string | null | undefined) => {
    if (!val) return '—'
    try {
      return new Date(val).toLocaleDateString()
    } catch {
      return val
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Search Patient
          </label>
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
              title="New YBOCS Assessment"
            >
              <Brain className="w-4 h-4" />
              New YBOCS Assessment
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="text-sm text-slate-500 py-4 text-center">Loading…</div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && records.length === 0 && (
        <div className="p-4 text-sm text-slate-600 border border-dashed border-slate-300 rounded-md text-center">
          No YBOCS assessments found.
        </div>
      )}

      {!loading && records.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Patient</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Template</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Obsessions</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Compulsions</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Total</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Severity</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr
                  key={r.name}
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => setSelected(r)}
                >
                  <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap">
                    {fmt(r.assessment_date)}
                  </td>
                  <td className="px-3 py-2 text-slate-800">
                    {r.patient_name || r.patient}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{r.template || '—'}</td>
                  <td className="px-3 py-2 text-slate-700 font-medium">{r.total_obsessions}</td>
                  <td className="px-3 py-2 text-slate-700 font-medium">{r.total_compulsions}</td>
                  <td className="px-3 py-2">
                    <span className={`font-bold ${
                      r.total_score >= 32 ? 'text-red-600' :
                      r.total_score >= 24 ? 'text-orange-600' :
                      r.total_score >= 16 ? 'text-amber-600' :
                      r.total_score >= 8 ? 'text-blue-600' :
                      'text-green-600'
                    }`}>
                      {r.total_score}
                    </span>
                  </td>
                  <td className="px-3 py-2">{severityBadge(r.total_score)}</td>
                  <td className="px-3 py-2">{statusBadge(r.docstatus)}</td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <PrintFormatDropdown
                        doctype="YBOCS Assessment"
                        docName={r.name}
                        noLetterhead={0}
                        triggerPrint={1}
                        className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Slide-over */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" aria-modal="true">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelected(null)} />
          <div ref={panelRef} className="relative z-10 flex flex-col bg-white shadow-2xl w-full max-w-md h-full overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
              <div className="flex items-center gap-2.5">
                <Brain className="w-4 h-4 text-primary" />
                <div>
                  <div className="text-base font-semibold text-slate-900">YBOCS Assessment</div>
                  <div className="text-xs text-slate-500 mt-0.5">{selected.name}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`/app/ybocs-assessment/${encodeURIComponent(selected.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Open in Frappe ↗
                </a>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
              </div>
            </div>

            <div className="p-5 flex flex-col gap-5">
              <div className="flex items-center gap-2">
                {statusBadge(selected.docstatus)}
                {severityBadge(selected.total_score)}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Patient', value: selected.patient_name || selected.patient },
                  { label: 'Assessment Date', value: fmt(selected.assessment_date) },
                  { label: 'Template', value: selected.template || '—' },
                  { label: 'Total Score', value: selected.total_score.toString() },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
                    <div className="text-sm font-semibold text-slate-800 mt-1 truncate" title={value}>{value}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Obsessions</div>
                  <div className="text-lg font-bold text-slate-800">{selected.total_obsessions}</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Compulsions</div>
                  <div className="text-lg font-bold text-slate-800">{selected.total_compulsions}</div>
                </div>
              </div>

              {/* Severity interpretation */}
              <div className={`rounded-lg p-4 border ${
                selected.total_score >= 32 ? 'bg-red-50 border-red-200' :
                selected.total_score >= 24 ? 'bg-orange-50 border-orange-200' :
                selected.total_score >= 16 ? 'bg-amber-50 border-amber-200' :
                selected.total_score >= 8 ? 'bg-blue-50 border-blue-200' :
                'bg-green-50 border-green-200'
              }`}>
                <div className="text-sm font-semibold text-slate-800 mb-1">OCD Severity</div>
                <div className="text-lg font-bold mb-1">{severityBadge(selected.total_score)}</div>
                <div className="text-xs text-slate-600">
                  Score: {selected.total_score}/40
                </div>
              </div>

              {/* Notes */}
              {selected.notes && (
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-sm font-semibold text-slate-800 mb-2">Notes</div>
                  <p
                    className="text-xs text-slate-700 whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: selected.notes }}
                  />
                </div>
              )}

              <div className="pt-2">
                <a
                  href={`/app/ybocs-assessment/${encodeURIComponent(selected.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90"
                >
                  Open Full Record ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}