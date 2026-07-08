import { useCallback, useEffect, useState } from 'react'
import {
  fetchGAD7Assessments,
  type GAD7AssessmentListFilters,
  type GAD7AssessmentRow,
} from '../../services/gad7'
import {
  fetchHealthcarePractitioners,
  type LinkFieldOption,
} from '../../services/common'
import { useCardFilters } from '../../contexts/CardFilterContext'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { GAD7AssessmentDetailPanel } from './GAD7AssessmentDetailPanel'
import { DateFilterInput } from '../ui/DateFilterInput'

interface GAD7AssessmentListProps {
  patient?: string
  refreshKey?: number
  onPatientClick?: (patient: string) => void
}

const FilterToggleButton = ({
  active,
  onClick,
}: {
  active: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`p-1.5 rounded-md border transition-colors ${
      active ? 'bg-primary/10 border-primary text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'
    }`}
    title={active ? 'Hide filters' : 'Show filters'}
  >
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
      />
    </svg>
  </button>
)

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

const severityBadge = (severity?: string) => {
  if (!severity) return <span className="text-slate-400">—</span>

  const severityColors: Record<string, string> = {
    'Minimal anxiety': 'bg-green-100 text-green-700 border-green-200',
    'Mild anxiety': 'bg-blue-100 text-blue-700 border-blue-200',
    'Moderate anxiety': 'bg-yellow-100 text-yellow-700 border-yellow-200',
    'Severe anxiety': 'bg-red-100 text-red-700 border-red-200',
  }

  const colorClass = severityColors[severity] || 'bg-slate-100 text-slate-700 border-slate-200'

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${colorClass}`}>
      {severity}
    </span>
  )
}

export const GAD7AssessmentList = ({
  patient,
  refreshKey,
  onPatientClick,
}: GAD7AssessmentListProps) => {
  const cardFilters = useCardFilters()
  const inDashboardCard = cardFilters !== undefined
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = inDashboardCard ? cardFilters : showFiltersInternal

  const [records, setRecords] = useState<GAD7AssessmentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [detailRow, setDetailRow] = useState<GAD7AssessmentRow | undefined>(undefined)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [practitionerFilter, setPractitionerFilter] = useState('')
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')

  const listFilters: GAD7AssessmentListFilters = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    practitioner: practitionerFilter || undefined,
  }

  const hasActiveFilters = Boolean(dateFrom || dateTo || practitionerFilter)

  const load = useCallback(async () => {
    if (!patient) {
      setRecords([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchGAD7Assessments(patient, listFilters)
      setRecords(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load GAD7 assessments')
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [patient, dateFrom, dateTo, practitionerFilter])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  useEffect(() => {
    if (!practitionerOpen) return
    const t = setTimeout(async () => {
      try {
        const opts = await fetchHealthcarePractitioners(practitionerQuery || undefined)
        setPractitionerOptions(opts)
      } catch {
        setPractitionerOptions([])
      }
    }, practitionerQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [practitionerQuery, practitionerOpen])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-gad7-practitioner-filter]')) return
      setPractitionerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleView = (row: GAD7AssessmentRow) => {
    setDetailRow(row)
    setDetailName(row.name)
  }

  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
    setPractitionerFilter('')
    setPractitionerQuery('')
    setPractitionerOpen(false)
  }

  const fmt = (val: string | null | undefined) => {
    if (!val) return '—'
    try {
      return new Date(val).toLocaleDateString('en-GB')
    } catch {
      return val
    }
  }

  if (!patient) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md px-4 py-3 text-sm">
        Select a patient to view GAD7 assessments.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {!inDashboardCard && (
        <div className="flex items-center justify-end">
          <FilterToggleButton
            active={Boolean(showFilters)}
            onClick={() => setShowFiltersInternal((prev) => !prev)}
          />
        </div>
      )}

      {showFilters && (
        <div className="card-filter-bar flex flex-wrap items-end gap-3 mb-1 px-1 py-2 border-b border-slate-100 bg-slate-50/80 rounded-md">
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs font-medium text-slate-500">From Date</label>
            <DateFilterInput
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs font-medium text-slate-500">To Date</label>
            <DateFilterInput
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <div data-gad7-practitioner-filter className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs font-medium text-slate-500">Doctor</label>
            <div className="relative">
              <input
                type="text"
                value={
                  practitionerFilter
                    ? practitionerOptions.find((p) => p.name === practitionerFilter)?.label ||
                      practitionerQuery ||
                      practitionerFilter
                    : practitionerQuery
                }
                onChange={(e) => {
                  setPractitionerQuery(e.target.value)
                  setPractitionerFilter('')
                  setPractitionerOpen(true)
                }}
                onFocus={() => setPractitionerOpen(true)}
                placeholder="Search doctor…"
                className={`w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary ${
                  practitionerFilter ? 'pr-8' : ''
                }`}
              />
              {practitionerFilter && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Clear practitioner filter"
                  onClick={() => {
                    setPractitionerFilter('')
                    setPractitionerQuery('')
                    setPractitionerOpen(false)
                  }}
                >
                  ×
                </button>
              )}
              {practitionerOpen && practitionerOptions.length > 0 && (
                <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-auto">
                  {practitionerOptions.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setPractitionerFilter(p.name)
                        setPractitionerQuery(p.label || p.name)
                        setPractitionerOpen(false)
                      }}
                    >
                      {p.label || p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <ClearFiltersButton onClick={clearFilters} disabled={!hasActiveFilters} />
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 py-4 text-center">Loading GAD7 assessments…</div>
      ) : error ? (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{error}</div>
      ) : records.length === 0 ? (
        <div className="p-4 text-sm text-slate-600 border border-dashed border-slate-300 rounded-md text-center">
          No GAD7 assessments found{hasActiveFilters ? ' for the selected filters' : ''}.
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">ID</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Doctor</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Template</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Total Score</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Severity</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.name} className="hover:bg-slate-50">
                  <td
                    className="px-3 py-2 text-sm font-medium text-primary hover:underline cursor-pointer whitespace-nowrap"
                    onClick={() => handleView(r)}
                  >
                    {r.name}
                  </td>
                  <td
                    className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap cursor-pointer"
                    onClick={() => handleView(r)}
                  >
                    {fmt(r.assessment_date)}
                  </td>
                  <td className="px-3 py-2 text-slate-700 cursor-pointer" onClick={() => handleView(r)}>
                    {r.practitioner_name || r.practitioner || '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-700 cursor-pointer" onClick={() => handleView(r)}>
                    {r.template || '—'}
                  </td>
                  <td className="px-3 py-2 cursor-pointer" onClick={() => handleView(r)}>
                    <span
                      className={`font-semibold ${
                        r.total_score >= 15
                          ? 'text-red-600'
                          : r.total_score >= 10
                            ? 'text-amber-600'
                            : r.total_score >= 5
                              ? 'text-blue-600'
                              : 'text-green-600'
                      }`}
                    >
                      {r.total_score}
                    </span>
                  </td>
                  <td className="px-3 py-2 cursor-pointer" onClick={() => handleView(r)}>
                    {severityBadge(r.severity)}
                  </td>
                  <td className="px-3 py-2 cursor-pointer" onClick={() => handleView(r)}>
                    {statusBadge(r.docstatus)}
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <PrintFormatDropdown
                      doctype="GAD7 Assessment"
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

      {detailName && (
        <GAD7AssessmentDetailPanel
          name={detailName}
          preview={detailRow}
          onClose={() => {
            setDetailName(null)
            setDetailRow(undefined)
          }}
          onPatientClick={onPatientClick}
        />
      )}
    </div>
  )
}
