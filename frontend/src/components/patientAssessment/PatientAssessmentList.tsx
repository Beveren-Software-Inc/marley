import { useEffect, useRef, useState } from 'react'
import {
  fetchPatientAssessments,
  type PatientAssessmentRow,
} from '../../services/patientAssessment'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'


interface PatientAssessmentListProps {
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

export const PatientAssessmentList = ({
  patient,
  refreshKey,
  onCreateNew,
}: PatientAssessmentListProps) => {
  const [records, setRecords] = useState<PatientAssessmentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<PatientAssessmentRow | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async (q?: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPatientAssessments(patient, q)
      setRecords(data)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to load patient assessments'
      )
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
      return new Date(val).toLocaleString()
    } catch {
      return val
    }
  }

  const scoreDisplay = (r: PatientAssessmentRow) => {
    if (r.total_score == null && r.total_score_obtained == null) return '—'
    const obtained = r.total_score_obtained ?? 0
    const total = r.total_score ?? 0
    if (total === 0) return `${obtained}`
    const pct = Math.round((obtained / total) * 100)
    return (
      <span className="flex items-center gap-1">
        <span className="font-semibold">{obtained}</span>
        <span className="text-slate-400">/ {total}</span>
        <span
          className={`text-[11px] font-medium ${
            pct >= 70
              ? 'text-emerald-600'
              : pct >= 40
              ? 'text-amber-600'
              : 'text-red-600'
          }`}
        >
          ({pct}%)
        </span>
      </span>
    )
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
              title="New Patient Assessment"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New Assessment
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="text-sm text-slate-500 py-4 text-center">
          Loading…
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && records.length === 0 && (
        <div className="p-4 text-sm text-slate-600 border border-dashed border-slate-300 rounded-md text-center">
          No patient assessments found.
        </div>
      )}

      {!loading && records.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">
                  Date / Time
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">
                  Patient
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">
                  Template
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">
                  Reference
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">
                  Practitioner
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">
                  Score
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">
                  Status
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">
                  Action
                </th>
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
                    {fmt(r.assessment_datetime)}
                  </td>
                  <td className="px-3 py-2 text-slate-800">
                    {r.patient_name || r.patient}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.assessment_template || '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.reference_type ? (
                      <span>
                        {r.reference_type}
                        {r.encounter && (
                          <span className="text-slate-400">
                            {' '}
                            · {r.encounter}
                          </span>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.healthcare_practitioner || '—'}
                  </td>
                  <td className="px-3 py-2">{scoreDisplay(r)}</td>
                  <td className="px-3 py-2">{statusBadge(r.docstatus)}</td>
                  {/* stopPropagation prevents the row click (detail modal) from firing when the print button is clicked */}
                  <td
                    className="px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      <PrintFormatDropdown
                        doctype="Patient Assessment"
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
            className="relative z-10 flex flex-col bg-white shadow-2xl w-full max-w-xl h-full overflow-y-auto"
            style={{ scrollbarWidth: 'thin' }}
          >
            {/* Panel Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
              <div>
                <div className="text-base font-semibold text-slate-900">
                  Patient Assessment
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {selected.name}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`/app/patient-assessment/${encodeURIComponent(selected.name)}`}
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
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    label: 'Patient',
                    value: selected.patient_name || selected.patient,
                  },
                  {
                    label: 'Assessment Date',
                    value: fmt(selected.assessment_datetime),
                  },
                  {
                    label: 'Template',
                    value: selected.assessment_template || '—',
                  },
                  {
                    label: 'Practitioner',
                    value: selected.healthcare_practitioner || '—',
                  },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="bg-slate-50 border border-slate-200 rounded-lg p-3"
                  >
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

              {/* Reference */}
              {selected.reference_type && (
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-sm font-semibold text-slate-800 mb-2">
                    Reference
                  </div>
                  <div className="text-xs text-slate-700 space-y-1">
                    <div>
                      <span className="font-medium">Type:</span>{' '}
                      {selected.reference_type}
                    </div>
                    {selected.encounter && (
                      <div>
                        <span className="font-medium">Encounter:</span>{' '}
                        {selected.encounter}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Score */}
              {(selected.total_score != null ||
                selected.total_score_obtained != null) && (
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-sm font-semibold text-slate-800 mb-3">
                    Score
                  </div>
                  <div className="flex items-end gap-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-primary">
                        {selected.total_score_obtained ?? 0}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Obtained
                      </div>
                    </div>
                    <div className="text-2xl text-slate-300 pb-1">/</div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-slate-400">
                        {selected.total_score ?? 0}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Total
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Description */}
              {selected.assessment_description && (
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-sm font-semibold text-slate-800 mb-2">
                    Description
                  </div>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap">
                    {selected.assessment_description}
                  </p>
                </div>
              )}

              <div className="pt-2">
                <a
                  href={`/app/patient-assessment/${encodeURIComponent(selected.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors"
                >
                  Open Full Form to Enter Scores ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}