// components/adhdAssessment/ADHDAssessmentList.tsx
import { useEffect, useRef, useState } from 'react'
import { Brain } from 'lucide-react'
import {
  fetchADHDAssessments,
  type ADHDAssessmentRow,
} from '../../services/adhd'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'

interface ADHDAssessmentListProps {
  patient?: string
  refreshKey?: number
  onCreateNew?: () => void
  onPatientClick?: (patient: string) => void
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

const resultBadge = (result?: string) => {
  if (!result) return <span className="text-slate-400">—</span>
  return result === 'Positive' ? (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
      Positive
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
      Negative
    </span>
  )
}

export const ADHDAssessmentList = ({
  patient,
  refreshKey,
  onCreateNew,
  onPatientClick,
}: ADHDAssessmentListProps) => {
  const [records, setRecords] = useState<ADHDAssessmentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ADHDAssessmentRow | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async (q?: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchADHDAssessments(patient, q)
      setRecords(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ADHD assessments')
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

  // Close slide-over on outside click
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
              title="New ADHD Assessment"
            >
              <Brain className="w-4 h-4" />
              New ADHD Assessment
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
          No ADHD assessments found.
        </div>
      )}

      {!loading && records.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                {!patient && (
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Patient</th>
                )}
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Template</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Part A Positives</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Result</th>
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
                  {!patient && (
                    <td
                      className="px-3 py-2 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); r.patient && onPatientClick?.(r.patient) }}
                    >
                      <span className="font-medium text-primary hover:underline">{r.patient_name || r.patient}</span>
                    </td>
                  )}
                  <td className="px-3 py-2 text-slate-700">{r.template || '—'}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.positive_count != null ? (
                      <span className={`font-semibold ${
                        r.positive_count >= 4 ? 'text-amber-600' : 'text-slate-700'
                      }`}>
                        {r.positive_count}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2">{resultBadge(r.result)}</td>
                  <td className="px-3 py-2">{statusBadge(r.docstatus)}</td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <PrintFormatDropdown
                        doctype="ADHD Assessment"
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

      {/* Right-side detail slide-over */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setSelected(null)}
          />
          <div
            ref={panelRef}
            className="relative z-10 flex flex-col bg-white shadow-2xl w-full max-w-md h-full overflow-y-auto"
            style={{ scrollbarWidth: 'thin' }}
          >
            {/* Panel Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
              <div className="flex items-center gap-2.5">
                <Brain className="w-4 h-4 text-primary" />
                <div>
                  <div className="text-base font-semibold text-slate-900">ADHD Assessment</div>
                  <div className="text-xs text-slate-500 mt-0.5">{selected.name}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`/app/adhd-assessment/${encodeURIComponent(selected.name)}`}
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

            <div className="p-5 flex flex-col gap-5">
              {/* Status */}
              <div className="flex items-center gap-2">
                {statusBadge(selected.docstatus)}
                {resultBadge(selected.result)}
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Patient', value: selected.patient_name || selected.patient },
                  { label: 'Assessment Date', value: fmt(selected.assessment_date) },
                  { label: 'Template', value: selected.template || '—' },
                  {
                    label: 'Part A Positives',
                    value: selected.positive_count != null ? String(selected.positive_count) : '—',
                  },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                      {label}
                    </div>
                    <div
                      className="text-sm font-semibold text-slate-800 mt-1 truncate"
                      title={value}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Result highlight */}
              {selected.result && (
                <div className={`rounded-lg p-4 border ${
                  selected.result === 'Positive'
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-emerald-50 border-emerald-200'
                }`}>
                  <div className="text-sm font-semibold text-slate-800 mb-1">Screening Result</div>
                  <div className={`text-2xl font-bold ${
                    selected.result === 'Positive' ? 'text-amber-600' : 'text-emerald-600'
                  }`}>
                    {selected.result}
                  </div>
                  {selected.result === 'Positive' && (
                    <div className="text-xs text-amber-700 mt-1">
                      {selected.positive_count} of Part A responses marked positive (≥4 threshold met)
                    </div>
                  )}
                </div>
              )}

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
                  href={`/app/adhd-assessment/${encodeURIComponent(selected.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors"
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