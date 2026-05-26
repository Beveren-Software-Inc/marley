// components/suicideRisk/SuicideRiskAssessmentList.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Shield, AlertTriangle } from 'lucide-react'
import {
  fetchSuicideRiskAssessments,
  type SuicideRiskAssessmentRow,
} from '../../services/suicideRisk'
import { useCardFilters } from '../../contexts/CardFilterContext'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { DetailSlideOver } from '../ui/DetailSlideOver'

interface SuicideRiskAssessmentListProps {
  patient?: string
  inpatientAdmission?: string
  refreshKey?: number
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

const riskLevelBadge = (level?: string) => {
  if (!level) return <span className="text-slate-400">—</span>

  const levelColors: Record<string, string> = {
    Low: 'bg-green-100 text-green-700 border-green-200',
    Medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    High: 'bg-orange-100 text-orange-700 border-orange-200',
    Emergency: 'bg-red-100 text-red-700 border-red-200',
  }

  const colorClass = levelColors[level] || 'bg-slate-100 text-slate-700 border-slate-200'

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${colorClass}`}>
      {level}
    </span>
  )
}

const assessmentDay = (val?: string | null) => {
  if (!val) return ''
  try {
    return new Date(val).toISOString().slice(0, 10)
  } catch {
    return String(val).slice(0, 10)
  }
}

export const SuicideRiskAssessmentList = ({
  patient,
  inpatientAdmission,
  refreshKey,
  onPatientClick,
}: SuicideRiskAssessmentListProps) => {
  const [records, setRecords] = useState<SuicideRiskAssessmentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SuicideRiskAssessmentRow | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cardFilters = useCardFilters()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const isInsideCard = cardFilters !== undefined

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [riskLevelFilter, setRiskLevelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = async (q?: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSuicideRiskAssessments(patient, q, inpatientAdmission)
      setRecords(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load suicide risk assessments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [patient, inpatientAdmission, refreshKey])

  const handleSearchChange = (q: string) => {
    setSearch(q)
    if (patient) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(q), 350)
  }

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const day = assessmentDay(r.assessment_date)
      if (fromDate && day && day < fromDate) return false
      if (toDate && day && day > toDate) return false
      if (riskLevelFilter && r.risk_level !== riskLevelFilter) return false
      if (statusFilter !== '' && String(r.docstatus) !== statusFilter) return false
      return true
    })
  }, [records, fromDate, toDate, riskLevelFilter, statusFilter])

  const riskLevelOptions = useMemo(() => {
    const s = new Set<string>()
    for (const r of records) {
      if (r.risk_level) s.add(r.risk_level)
    }
    return Array.from(s).sort()
  }, [records])

  const hasActiveFilters = Boolean(fromDate || toDate || riskLevelFilter || statusFilter)

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
    <div className="flex flex-col gap-2 h-full flex-1 min-h-0">
      {!isInsideCard && (
        <div className="flex items-center gap-3 flex-wrap justify-between flex-shrink-0">
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
          <button
            type="button"
            onClick={() => setShowFiltersInternal((p) => !p)}
            className={`p-1.5 rounded-md border transition-colors ${showFilters ? 'bg-primary/10 border-primary text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}
            title={showFilters ? 'Hide filters' : 'Show filters'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
          </button>
        </div>
      )}

      {showFilters && (
        <div className="flex flex-wrap items-end gap-3 px-0 py-2 border-b border-slate-100 bg-slate-50/80 flex-shrink-0">
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-xs font-medium text-slate-500">Date from</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-xs font-medium text-slate-500">Date to</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-xs font-medium text-slate-500">Risk level</label>
            <select
              value={riskLevelFilter}
              onChange={(e) => setRiskLevelFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            >
              <option value="">All levels</option>
              {riskLevelOptions.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-xs font-medium text-slate-500">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            >
              <option value="">All</option>
              <option value="0">Draft</option>
              <option value="1">Submitted</option>
              <option value="2">Cancelled</option>
            </select>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setFromDate('')
                setToDate('')
                setRiskLevelFilter('')
                setStatusFilter('')
              }}
              className="text-xs text-primary hover:underline pb-1.5"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {patient && (
        <p className="text-[11px] text-slate-500 flex-shrink-0">
          {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}
          {hasActiveFilters && records.length !== filteredRecords.length ? ` (of ${records.length})` : ''}
        </p>
      )}

      {loading && <div className="text-sm text-slate-500 py-4 text-center flex-shrink-0">Loading…</div>}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex-shrink-0">{error}</div>
      )}

      {!loading && !error && filteredRecords.length === 0 && (
        <div className="p-4 text-sm text-slate-600 border border-dashed border-slate-300 rounded-md text-center flex-1">
          No suicide risk assessments found.
        </div>
      )}

      {!loading && filteredRecords.length > 0 && (
        <div className="overflow-auto border border-slate-200 rounded-lg flex-1 min-h-0">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                {!patient && (
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Patient</th>
                )}
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Clinician</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Risk Score</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Risk Level</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.map((r) => (
                <tr key={r.name} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(r)}>
                  <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap">{fmt(r.assessment_date)}</td>
                  {!patient && (
                    <td
                      className="px-3 py-2 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        r.patient && onPatientClick?.(r.patient)
                      }}
                    >
                      <span className="font-medium text-primary hover:underline">
                        {r.patient_name || r.patient}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-2 text-slate-700">{r.clinician_name || r.clinician || '—'}</td>
                  <td className="px-3 py-2 text-slate-700">
                    <span
                      className={`font-semibold ${
                        r.risk_score >= 75
                          ? 'text-red-600'
                          : r.risk_score >= 50
                            ? 'text-orange-600'
                            : r.risk_score >= 25
                              ? 'text-yellow-600'
                              : 'text-green-600'
                      }`}
                    >
                      {r.risk_score}
                    </span>
                  </td>
                  <td className="px-3 py-2">{riskLevelBadge(r.risk_level)}</td>
                  <td className="px-3 py-2">{statusBadge(r.docstatus)}</td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <PrintFormatDropdown
                      doctype="Clinical Suicide Risk Assessment"
                      docName={r.name}
                      noLetterhead={0}
                      triggerPrint={1}
                      className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <DetailSlideOver
          title="Suicide Risk Assessment"
          subtitle={selected.name}
          icon={<Shield className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          maxWidthClass="max-w-md"
          onClose={() => setSelected(null)}
          headerActions={
            <a
              href={`/app/clinical-suicide-risk-assessment/${encodeURIComponent(selected.name)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-200/50"
            >
              Open in Desk ↗
            </a>
          }
        >
            <div ref={panelRef} className="flex flex-col gap-5 p-1">
              <div className="flex items-center gap-2">
                {statusBadge(selected.docstatus)}
                {riskLevelBadge(selected.risk_level)}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Patient', value: selected.patient_name || selected.patient },
                  { label: 'Assessment Date', value: fmt(selected.assessment_date) },
                  { label: 'Clinician', value: selected.clinician_name || selected.clinician || '—' },
                  { label: 'Risk Score', value: selected.risk_score != null ? String(selected.risk_score) : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
                    <div className="text-sm font-semibold text-slate-800 mt-1 truncate" title={value}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              {selected.risk_level && (
                <div
                  className={`rounded-lg p-4 border ${
                    selected.risk_level === 'Emergency'
                      ? 'bg-red-50 border-red-200'
                      : selected.risk_level === 'High'
                        ? 'bg-orange-50 border-orange-200'
                        : selected.risk_level === 'Medium'
                          ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-green-50 border-green-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    <div>
                      <div className="text-sm font-semibold">Risk Level: {selected.risk_level}</div>
                      <div className="text-xs mt-1">Score: {selected.risk_score}/100</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
        </DetailSlideOver>
      )}
    </div>
  )
}
