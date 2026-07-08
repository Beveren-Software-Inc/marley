import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eye } from 'lucide-react'
import {
  fetchSuicidalAssessments,
  type SuicidalAssessment,
  type SuicidalAssessmentListFilters,
} from '../../services/suicidalAssessment'
import { useCareContext } from '../../providers/CareContextProvider'
import {
  fetchDoctorPractitioners,
  type LinkFieldOption,
} from '../../services/common'
import { useCardFilters } from '../../contexts/CardFilterContext'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { StatusPill } from '../ui/StatusPill'
import { SuicidalPatientAssessmentDetailPanel } from './SuicidalPatientAssessmentDetailPanel'
import { DateFilterInput } from '../ui/DateFilterInput'

interface SuicidalAssessmentListProps {
  patient?: string
  admission?: string
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

export const SuicidalAssessmentList = ({
  patient,
  admission,
  refreshKey,
  onPatientClick,
}: SuicidalAssessmentListProps) => {
  const { selectedPatient: contextPatient, mode, activeAdmission } = useCareContext()
  const cardFilters = useCardFilters()
  const inDashboardCard = cardFilters !== undefined
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = inDashboardCard ? cardFilters : showFiltersInternal

  const effectivePatient = patient ?? contextPatient
  const effectiveAdmission = mode === 'IP' && activeAdmission ? activeAdmission : admission

  const [assessments, setAssessments] = useState<SuicidalAssessment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [detailRow, setDetailRow] = useState<SuicidalAssessment | undefined>(undefined)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [practitionerFilter, setPractitionerFilter] = useState('')
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')

  const listFilters: SuicidalAssessmentListFilters = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    practitioner: practitionerFilter || undefined,
  }

  const hasActiveFilters = Boolean(dateFrom || dateTo || practitionerFilter)

  const load = useCallback(async () => {
    if (!effectivePatient && !effectiveAdmission) {
      setAssessments([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSuicidalAssessments(effectivePatient, effectiveAdmission, listFilters)
      setAssessments(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch assessments')
      setAssessments([])
    } finally {
      setLoading(false)
    }
  }, [effectivePatient, effectiveAdmission, dateFrom, dateTo, practitionerFilter])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  useEffect(() => {
    if (!practitionerOpen) return
    const t = setTimeout(async () => {
      try {
        const opts = await fetchDoctorPractitioners(practitionerQuery || undefined)
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
      if (el.closest('[data-suicidal-practitioner-filter]')) return
      setPractitionerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleView = (assessment: SuicidalAssessment) => {
    setDetailRow(assessment)
    setDetailName(assessment.name)
  }

  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
    setPractitionerFilter('')
    setPractitionerQuery('')
    setPractitionerOpen(false)
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleDateString('en-GB')
    } catch {
      return dateStr
    }
  }

  const getRiskIndicator = (assessment: SuicidalAssessment) => {
    if (assessment.active_suicidal_thoughts_plans === 'Yes') {
      return { color: 'danger' as const, text: 'Active Suicidal Thoughts' }
    }
    if (assessment.overwhelmed_thoughts_harming === 'Yes') {
      return { color: 'warning' as const, text: 'Has Thoughts' }
    }
    return { color: 'success' as const, text: 'No Active Thoughts' }
  }

  const practitionerLabel = (assessment: SuicidalAssessment) =>
    assessment.practitioner_name ||
    assessment.assessed_by_name ||
    assessment.practitioner ||
    assessment.assessed_by ||
    '—'

  if (!effectivePatient && !effectiveAdmission) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md px-4 py-3 text-sm">
        Select a patient to view suicidal patient assessments.
      </div>
    )
  }

  return (
    <>
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
            <div data-suicidal-practitioner-filter className="flex flex-col gap-1 min-w-[200px]">
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
                    aria-label="Clear doctor filter"
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
          <div className="text-sm text-slate-500 py-4 text-center">Loading assessments…</div>
        ) : error ? (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{error}</div>
        ) : assessments.length === 0 ? (
          <div className="p-4 text-sm text-slate-600 border border-dashed border-slate-300 rounded-md text-center">
            No suicidal patient assessments found{hasActiveFilters ? ' for the selected filters' : ''}.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">ID</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                  {!patient && (
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Patient</th>
                  )}
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Admission</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Doctor</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Thoughts</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Current Plan</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Prev. Attempts</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Risk</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 w-[60px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assessments.map((assessment) => {
                  const risk = getRiskIndicator(assessment)
                  return (
                    <tr
                      key={assessment.name}
                      className="hover:bg-slate-50/80 cursor-pointer"
                      onClick={() => handleView(assessment)}
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleView(assessment)
                          }}
                          className="font-medium text-primary hover:underline whitespace-nowrap"
                        >
                          {assessment.name}
                        </button>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleView(assessment)
                          }}
                          className="font-medium text-primary hover:underline"
                        >
                          {formatDate(assessment.assessment_date)}
                        </button>
                      </td>
                      {!patient && (
                        <td
                          className="px-3 py-2"
                          onClick={(e) => {
                            e.stopPropagation()
                            assessment.patient && onPatientClick?.(assessment.patient)
                          }}
                        >
                          <span className="font-medium text-primary hover:underline">
                            {assessment.patient_name || assessment.patient}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-2 text-slate-700">{assessment.admission_no || '—'}</td>
                      <td className="px-3 py-2 text-slate-700">{practitionerLabel(assessment)}</td>
                      <td className="px-3 py-2">
                        {assessment.overwhelmed_thoughts_harming === 'Yes' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-700">
                            Yes
                          </span>
                        ) : assessment.overwhelmed_thoughts_harming === 'No' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-green-100 text-green-700">
                            No
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {assessment.made_current_plans === 'Yes' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-red-100 text-red-700">
                            Has Plan
                          </span>
                        ) : assessment.made_current_plans === 'No' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-green-100 text-green-700">
                            No Plan
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {assessment.previous_attempts === 'Yes' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-100 text-purple-700">
                            Yes
                          </span>
                        ) : assessment.previous_attempts === 'No' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-green-100 text-green-700">
                            No
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill status={risk.text} color={risk.color} />
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleView(assessment)}
                          className="p-1.5 text-slate-500 hover:text-primary hover:bg-slate-100 rounded-md transition-colors"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailName &&
        typeof document !== 'undefined' &&
        createPortal(
          <SuicidalPatientAssessmentDetailPanel
            name={detailName}
            preview={detailRow}
            onClose={() => {
              setDetailName(null)
              setDetailRow(undefined)
            }}
            onPatientClick={onPatientClick}
          />,
          document.body
        )}
    </>
  )
}
