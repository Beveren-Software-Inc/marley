import { useCallback, useEffect, useState } from 'react'
import { fetchMentalStates, type MentalStateRow } from '../../services/mentalState'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { useCardFilters } from '../../contexts/CardFilterContext'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { MentalStateDetailPanel } from './MentalStateDetailPanel'
import { DateFilterInput } from '../ui/DateFilterInput'

interface MentalStateListProps {
  patient?: string
  refreshKey?: number
  onPatientClick?: (patient: string) => void
  title?: string
  onAdd?: () => void
  addButtonTitle?: string
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
    className={`rounded-md border p-1.5 transition-colors ${
      active ? 'border-primary bg-primary/10 text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'
    }`}
    title={active ? 'Hide filters' : 'Show filters'}
    aria-label={active ? 'Hide filters' : 'Show filters'}
  >
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
      />
    </svg>
  </button>
)

export const MentalStateList = ({
  patient,
  refreshKey,
  onPatientClick,
  title = 'Mental Status',
  onAdd,
  addButtonTitle = 'New Mental Status',
}: MentalStateListProps) => {
  const cardFilters = useCardFilters()
  const inDashboardCard = cardFilters !== undefined
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = inDashboardCard ? cardFilters : showFiltersInternal

  const [records, setRecords] = useState<MentalStateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailRow, setDetailRow] = useState<MentalStateRow | null>(null)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [practitionerFilter, setPractitionerFilter] = useState('')
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])

  const hasActiveFilters = Boolean(dateFrom || dateTo || practitionerFilter)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMentalStates(patient, 1, 50, {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        practitioner: practitionerFilter || undefined,
      })
      setRecords(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load mental state records')
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
      if (el.closest('[data-ms-practitioner-filter]')) return
      setPractitionerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
    setPractitionerFilter('')
    setPractitionerQuery('')
    setPractitionerOpen(false)
  }

  const formatDate = (val: string | null | undefined) => {
    if (!val) return '—'
    try {
      return new Date(val).toLocaleString('en-GB')
    } catch {
      return val
    }
  }

  const countChecks = (row: MentalStateRow, keys: (keyof MentalStateRow)[]) =>
    keys.filter((k) => !!row[k]).length

  const selectedPractitionerLabel =
    practitionerOptions.find((o) => o.name === practitionerFilter)?.label || practitionerFilter || ''

  return (
    <div className="flex flex-col gap-4">
      {!inDashboardCard && (
        <div className="flex flex-shrink-0 items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            <FilterToggleButton
              active={Boolean(showFilters)}
              onClick={() => setShowFiltersInternal((prev) => !prev)}
            />
            {onAdd ? (
              <button
                type="button"
                onClick={onAdd}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-white transition-colors hover:bg-primary/90"
                title={addButtonTitle}
              >
                +
              </button>
            ) : null}
          </div>
        </div>
      )}

      {showFilters ? (
        <div className="card-filter-bar flex flex-shrink-0 flex-wrap items-end gap-3 rounded-md border-b border-slate-100 bg-slate-50/80 px-1 py-2">
          <div className="flex min-w-[130px] flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">From Date</label>
            <DateFilterInput
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex min-w-[130px] flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">To Date</label>
            <DateFilterInput
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div data-ms-practitioner-filter className="relative flex min-w-[200px] flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Doctor</label>
            <input
              type="text"
              value={practitionerOpen ? practitionerQuery : selectedPractitionerLabel}
              onChange={(e) => {
                setPractitionerQuery(e.target.value)
                setPractitionerOpen(true)
                if (!e.target.value) setPractitionerFilter('')
              }}
              onFocus={() => setPractitionerOpen(true)}
              placeholder="Search doctor…"
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
            {practitionerOpen && practitionerOptions.length > 0 ? (
              <ul className="absolute top-full left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg">
                {practitionerOptions.map((opt) => (
                  <li key={opt.name}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-slate-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setPractitionerFilter(opt.name)
                        setPractitionerQuery(opt.label || opt.name)
                        setPractitionerOpen(false)
                      }}
                    >
                      {opt.label || opt.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {hasActiveFilters ? <ClearFiltersButton onClick={clearFilters} /> : null}
        </div>
      ) : null}

      {loading ? <div className="py-4 text-center text-sm text-slate-500">Loading…</div> : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
      ) : null}

      {!loading && !error && records.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600">
          NO MENTAL STATE RECORDS FOUND.
        </div>
      ) : null}

      {!loading && records.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-xs">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                {!patient ? <th className="px-3 py-2 text-left font-semibold text-slate-600">Patient</th> : null}
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Admission No</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Branch</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-600">Trans Shift</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-600">Behaviour</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-600">Sleep</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => {
                const behaviourCount = countChecks(r, [
                  'cooperative',
                  'aggressive',
                  'paranoid',
                  'demanding',
                  'preoccupied',
                  'defence',
                  'impulsive',
                  'sedative',
                ])
                const sleepCount = countChecks(r, [
                  'normal_sleep',
                  'disturbed',
                  'intermittent',
                  'excessive',
                  'a_little',
                ])
                return (
                  <tr key={r.name} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetailRow(r)}>
                    <td className="px-3 py-2 font-medium text-slate-900">{formatDate(r.creation)}</td>
                    {!patient ? (
                      <td
                        className="cursor-pointer px-3 py-2 text-slate-800"
                        onClick={(e) => {
                          e.stopPropagation()
                          r.file_no && onPatientClick?.(r.file_no)
                        }}
                      >
                        <span className="font-medium text-primary hover:underline">
                          {r.patient_name || r.file_no || '—'}
                        </span>
                      </td>
                    ) : null}
                    <td className="px-3 py-2 text-slate-700">{r.admission_no || '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{r.branch || '—'}</td>
                    <td className="px-3 py-2 text-center text-slate-700">{r.trans_shift ?? '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          behaviourCount >= 5
                            ? 'bg-emerald-100 text-emerald-700'
                            : behaviourCount >= 2
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {behaviourCount}/8
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          sleepCount >= 3
                            ? 'bg-emerald-100 text-emerald-700'
                            : sleepCount >= 1
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {sleepCount}/5
                      </span>
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <PrintFormatDropdown
                        doctype="Mental State"
                        docName={r.name}
                        noLetterhead={0}
                        triggerPrint={1}
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {detailRow ? (
        <MentalStateDetailPanel
          name={detailRow.name}
          preview={detailRow}
          onClose={() => setDetailRow(null)}
          onPatientClick={onPatientClick}
        />
      ) : null}
    </div>
  )
}
