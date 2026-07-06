import { useCallback, useEffect, useState } from 'react'
import { fetchSleepingPatterns, type SleepingPattern } from '../../services/sleepingPattern'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { useCardFilters } from '../../contexts/CardFilterContext'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { SleepingPatternDetailPanel } from './SleepingPatternDetailPanel'

interface SleepingPatternListProps {
  patient?: string
  refreshKey?: string | number
  onRowClick?: (name: string) => void
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

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value
  if (value == null || value === '') return 0
  const n = parseFloat(String(value))
  return Number.isFinite(n) ? n : 0
}

export const SleepingPatternList = ({
  patient,
  refreshKey,
  onRowClick,
  onPatientClick,
  title = 'Sleeping Pattern',
  onAdd,
  addButtonTitle = 'New Sleeping Pattern',
}: SleepingPatternListProps) => {
  const cardFilters = useCardFilters()
  const inDashboardCard = cardFilters !== undefined
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = inDashboardCard ? cardFilters : showFiltersInternal

  const [rows, setRows] = useState<SleepingPattern[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detailRow, setDetailRow] = useState<SleepingPattern | null>(null)

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
      const data = await fetchSleepingPatterns(50, 0, patient, {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        practitioner: practitionerFilter || undefined,
      })
      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sleeping pattern records')
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
      if (el.closest('[data-sp-practitioner-filter]')) return
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

  const openDetail = (row: SleepingPattern) => {
    if (onRowClick) {
      onRowClick(row.name)
    } else {
      setDetailRow(row)
    }
  }

  const selectedPractitionerLabel =
    practitionerOptions.find((o) => o.name === practitionerFilter)?.label || practitionerFilter || ''

  return (
    <>
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
          <div className="flex flex-shrink-0 flex-wrap items-end gap-3 rounded-md border-b border-slate-100 bg-slate-50/80 px-1 py-2">
            <div className="flex min-w-[130px] flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Date from</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex min-w-[130px] flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Date to</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              />
            </div>
            <div data-sp-practitioner-filter className="relative flex min-w-[200px] flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Practitioner</label>
              <input
                type="text"
                value={practitionerOpen ? practitionerQuery : selectedPractitionerLabel}
                onChange={(e) => {
                  setPractitionerQuery(e.target.value)
                  setPractitionerOpen(true)
                  if (!e.target.value) setPractitionerFilter('')
                }}
                onFocus={() => setPractitionerOpen(true)}
                placeholder="Search practitioner…"
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

        {!loading && !error && rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600">
            No sleeping pattern records found.
          </div>
        ) : null}

        {!loading && rows.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">Admission</th>
                  {!patient ? (
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">Patient</th>
                  ) : null}
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">Total Hours</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row) => (
                  <tr key={row.name} className="cursor-pointer hover:bg-slate-50" onClick={() => openDetail(row)}>
                    <td className="px-4 py-3 text-sm text-slate-800">
                      {row.date ? new Date(row.date).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.admission_no}</td>
                    {!patient ? (
                      <td
                        className="cursor-pointer px-4 py-3 text-sm text-slate-700"
                        onClick={(e) => {
                          e.stopPropagation()
                          row.file_no && onPatientClick?.(row.file_no)
                        }}
                      >
                        <span className="font-medium text-primary hover:underline">
                          {row.patient_name || row.file_no || '—'}
                        </span>
                      </td>
                    ) : null}
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {typeof row.total_hours === 'number' ? row.total_hours.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.user || '—'}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <PrintFormatDropdown
                        doctype="Sleeping Pattern"
                        docName={row.name}
                        noLetterhead={0}
                        triggerPrint={1}
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && rows.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Sleeping Pattern Overview
              </span>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-3 rounded-full bg-sky-400" /> Morning
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-3 rounded-full bg-emerald-400" /> Evening
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-3 rounded-full bg-indigo-500" /> Night
                </span>
              </div>
            </div>
            <div className="max-h-64 space-y-3 overflow-y-auto px-4 py-3">
              {rows.map((row) => {
                const m = toNumber(row.morning_total)
                const e = toNumber(row.evening_total)
                const n = toNumber(row.night_total)
                const total = m + e + n || 1
                return (
                  <div key={row.name} className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-600">
                      <span>
                        {row.date ? new Date(row.date).toLocaleDateString('en-GB') : '—'} —{' '}
                        {row.patient_name || row.file_no || '—'}
                      </span>
                      <span className="text-slate-500">
                        {row.admission_no} • {row.total_hours ? row.total_hours.toFixed(2) : '—'}h
                      </span>
                    </div>
                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                      {m > 0 ? (
                        <div className="h-full bg-sky-400" style={{ flex: m / total }} title={`Morning: ${m.toFixed(2)}h`} />
                      ) : null}
                      {e > 0 ? (
                        <div
                          className="h-full bg-emerald-400"
                          style={{ flex: e / total }}
                          title={`Evening: ${e.toFixed(2)}h`}
                        />
                      ) : null}
                      {n > 0 ? (
                        <div className="h-full bg-indigo-500" style={{ flex: n / total }} title={`Night: ${n.toFixed(2)}h`} />
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      {detailRow ? (
        <SleepingPatternDetailPanel
          name={detailRow.name}
          preview={detailRow}
          onClose={() => setDetailRow(null)}
          onPatientClick={onPatientClick}
        />
      ) : null}
    </>
  )
}
