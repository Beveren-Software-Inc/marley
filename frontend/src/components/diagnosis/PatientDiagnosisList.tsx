import { useState, useEffect, useMemo } from 'react'
import { getAllPatientDiagnoses, fetchHealthcarePractitioners, type PatientDiagnosisAggRow, type LinkFieldOption } from '../../services/common'
import { useCardFilters, useDashboardCompactClinical } from '../../contexts/CardFilterContext'
import { CardRowMetaHint, dashboardCardRowHoverClass } from '../ui/dashboardCardListing'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'

interface PatientDiagnosisListProps {
  patient?: string
  refreshKey?: number | string
}

function formatDate(val?: string): string {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return val
  }
}

function diagnosisPractitionerLabel(row: PatientDiagnosisAggRow): string {
  return row.practitioner_name || row.practitioner || '—'
}

function dateOnly(iso?: string): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function inDateRange(posting?: string, from?: string, to?: string): boolean {
  const d = dateOnly(posting)
  if (!d) return !from && !to
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

export function PatientDiagnosisList({ patient, refreshKey }: PatientDiagnosisListProps) {
  const [rows, setRows] = useState<PatientDiagnosisAggRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cardFilters = useCardFilters()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const inDashboardCard = cardFilters !== undefined
  const compactClinical = useDashboardCompactClinical()

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [practitionerFilter, setPractitionerFilter] = useState('')
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])

  useEffect(() => {
    if (!practitionerOpen) return
    const t = setTimeout(() => {
      fetchHealthcarePractitioners(practitionerQuery || undefined)
        .then(setPractitionerOptions)
        .catch(() => setPractitionerOptions([]))
    }, practitionerQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [practitionerOpen, practitionerQuery])

  useEffect(() => {
    if (!patient) {
      setRows([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getAllPatientDiagnoses(patient)
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [patient, refreshKey])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!inDateRange(row.posting_date, fromDate || undefined, toDate || undefined)) return false
      if (practitionerFilter && row.practitioner !== practitionerFilter) return false
      return true
    })
  }, [rows, fromDate, toDate, practitionerFilter])

  const hasActiveFilters = Boolean(fromDate || toDate || practitionerFilter)

  if (!patient) {
    return <p className="text-sm text-slate-400 italic px-1">No patient selected.</p>
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-slate-400 text-sm">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading…
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-500 px-1">{error}</p>
  }

  return (
    <div className="min-w-full flex flex-col flex-1 min-h-0">
      {!inDashboardCard && (
        <div className="flex justify-end mb-2">
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
        <div className="flex flex-wrap items-end gap-3 mb-3 px-1">
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-xs font-medium text-slate-500">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-xs font-medium text-slate-500">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[180px] relative">
            <label className="text-xs font-medium text-slate-500">Practitioner</label>
            <input
              type="text"
              value={
                practitionerFilter
                  ? practitionerOptions.find((p) => p.name === practitionerFilter)?.label || practitionerQuery
                  : practitionerQuery
              }
              onChange={(e) => {
                setPractitionerQuery(e.target.value)
                setPractitionerFilter('')
                setPractitionerOpen(true)
              }}
              onFocus={() => setPractitionerOpen(true)}
              placeholder="Search practitioner…"
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm w-full"
            />
            {practitionerOpen && practitionerOptions.length > 0 && (
              <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                {practitionerOptions.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
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
          {hasActiveFilters ? (
            <ClearFiltersButton
              onClick={() => {
                setFromDate('')
                setToDate('')
                setPractitionerFilter('')
                setPractitionerQuery('')
              }}
            />
          ) : null}
        </div>
      )}

      {filteredRows.length === 0 ? (
        <p className="text-sm text-slate-400 italic px-1">
          {hasActiveFilters ? 'No diagnoses match the filters.' : 'No diagnoses recorded yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto flex-1 min-h-0">
          <table className={`w-full text-sm ${compactClinical ? '' : 'min-w-[720px]'}`}>
            <thead>
              <tr className="border-b border-slate-100">
                {!compactClinical && (
                  <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">No.</th>
                )}
                <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Name</th>
                {!compactClinical && (
                  <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Group</th>
                )}
                <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Remarks</th>
                <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">
                  Practitioner
                </th>
                <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">Date</th>
                {!compactClinical && (
                  <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Source</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, idx) => {
                const practitionerLabel = diagnosisPractitionerLabel(row)
                const dateLabel = formatDate(row.posting_date)
                const metaFields = [
                  ['No.', row.disease_no || row.diagnosis],
                  ['Group', row.diagnosis_group_name],
                  ['Practitioner', practitionerLabel],
                  ['Date', dateLabel],
                  ['Source', row.parent ? `${row.parent_type === 'Patient Visit' ? 'OP' : 'IP'} ${row.parent}` : ''],
                  ['Record', row.name],
                ] as const
                const secondaryDetails = [practitionerLabel !== '—' ? practitionerLabel : null, dateLabel !== '—' ? dateLabel : null]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <tr
                    key={row.name || idx}
                    className={`border-b border-slate-50 transition-colors ${compactClinical ? dashboardCardRowHoverClass : 'hover:bg-slate-50'}`}
                  >
                    {!compactClinical && (
                      <td className="px-2 py-2 font-mono text-sm text-slate-800 whitespace-nowrap">
                        {row.disease_no || row.diagnosis || '—'}
                      </td>
                    )}
                    <td className="px-2 py-2 font-medium text-slate-800">
                      <span className="flex items-start gap-1">
                        <span>{row.diagnosis_name?.trim() || row.diagnosis || '—'}</span>
                        {compactClinical ? <CardRowMetaHint fields={metaFields} /> : null}
                      </span>
                      {compactClinical && row.diagnosis_group_name ? (
                        <span className="block text-xs font-normal text-slate-500 mt-0.5">{row.diagnosis_group_name}</span>
                      ) : null}
                      {compactClinical && secondaryDetails ? (
                        <span className="block text-xs font-normal text-slate-500 mt-0.5">{secondaryDetails}</span>
                      ) : null}
                    </td>
                    {!compactClinical && (
                      <td className="px-2 py-2 text-sm text-slate-600">{row.diagnosis_group_name || '—'}</td>
                    )}
                    <td className="px-2 py-2 text-slate-600 max-w-[180px] truncate" title={row.details || ''}>
                      {row.details || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-2 py-2 text-slate-600 text-sm whitespace-nowrap">{practitionerLabel}</td>
                    <td className="px-2 py-2 text-slate-500 whitespace-nowrap">{dateLabel}</td>
                    {!compactClinical && (
                      <td className="px-2 py-2">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 ${
                            row.parent_type === 'Patient Visit'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {row.parent_type === 'Patient Visit' ? 'OP' : 'IP'}
                          <span className="opacity-70">{row.parent}</span>
                        </span>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
