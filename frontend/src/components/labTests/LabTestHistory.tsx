import { useState, useEffect, useCallback } from 'react'
import {
  fetchLabTestHistoryMatrix,
  type LabHistoryMatrixColumn,
  type LabHistoryMatrixRow,
} from '../../services/labTests'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { Search, User } from 'lucide-react'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'

interface LabTestHistoryProps {
  patientId?: string
  patientName?: string
  onPatientChange?: (patientId: string) => void
  className?: string
}

interface Filters {
  fromDate: string
  toDate: string
  testName: string
}

function localDateISO(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultDateRange(): { fromDate: string; toDate: string } {
  const toDate = localDateISO()
  const from = new Date()
  from.setMonth(from.getMonth() - 6)
  return { fromDate: localDateISO(from), toDate }
}

const makeDefaultFilters = (): Filters => ({
  ...defaultDateRange(),
  testName: '',
})

function formatColumnHeader(col: LabHistoryMatrixColumn): { dateLine: string; timeLine: string } {
  let dateLine = col.date || '—'
  try {
    if (col.date) {
      dateLine = new Date(col.date + 'T00:00:00').toLocaleDateString('en-GB')
    }
  } catch {
    dateLine = col.date || '—'
  }
  const timeLine = col.time || ''
  return { dateLine, timeLine }
}

const MIN_DATE_COLUMNS = 20
const TEST_COLUMN_WIDTH_PX = 220

function padHistoryColumns(columns: LabHistoryMatrixColumn[]): LabHistoryMatrixColumn[] {
  if (columns.length >= MIN_DATE_COLUMNS) return columns
  const padded = [...columns]
  while (padded.length < MIN_DATE_COLUMNS) {
    const i = padded.length
    padded.push({
      key: `__pad_${i}`,
      date: '',
      time: '',
      lab_test: '',
    })
  }
  return padded
}

function cellClass(flag?: string) {
  switch (flag) {
    case 'normal':
      return 'bg-green-100 text-green-900'
    case 'abnormal':
      return 'bg-red-100 text-red-900 font-medium'
    default:
      return 'bg-white text-slate-800'
  }
}

function cellDirectionArrow(direction?: 'high' | 'low' | null) {
  if (direction === 'high') {
    return <span className="shrink-0 text-[10px] font-bold leading-none text-red-800" aria-label="High">↑</span>
  }
  if (direction === 'low') {
    return <span className="shrink-0 text-[10px] font-bold leading-none text-red-800" aria-label="Low">↓</span>
  }
  return null
}

const FilterBar = ({
  filters,
  onChange,
  onClear,
  activeCount,
  patientId,
  patientName,
  patientQuery,
  onPatientQueryChange,
  onPatientSelect,
  patientOptions,
  patientOpen,
  setPatientOpen,
  patientLoading,
  showPatientPicker,
}: {
  filters: Filters
  onChange: (f: Filters) => void
  onClear: () => void
  activeCount: number
  patientId?: string
  patientName?: string
  patientQuery: string
  onPatientQueryChange: (q: string) => void
  onPatientSelect: (p: PatientListItem) => void
  patientOptions: PatientListItem[]
  patientOpen: boolean
  setPatientOpen: (v: boolean) => void
  patientLoading: boolean
  showPatientPicker: boolean
}) => {
  const set = (key: keyof Filters, value: string) => onChange({ ...filters, [key]: value })

  return (
    <div className="card-filter-bar flex flex-wrap items-end gap-3 px-4 py-3 bg-white border-b border-slate-200">
      {showPatientPicker ? (
        <div className="flex flex-col gap-1 min-w-[220px] relative">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Patient</label>
          <div className="relative">
            <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={patientQuery}
              onChange={(e) => {
                onPatientQueryChange(e.target.value)
                setPatientOpen(true)
              }}
              onFocus={() => setPatientOpen(true)}
              placeholder="Search patient…"
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {patientOpen && (patientOptions.length > 0 || patientLoading) && (
              <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {patientLoading ? (
                  <p className="px-3 py-2 text-xs text-slate-500">Searching…</p>
                ) : (
                  patientOptions.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => {
                        onPatientSelect(p)
                        setPatientOpen(false)
                      }}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      <span className="font-medium text-slate-800">{p.patient_name || p.name}</span>
                      <span className="text-xs text-slate-400 ml-2">{p.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      ) : patientId ? (
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Patient</label>
          <div className="px-3 py-1.5 text-sm rounded-md border border-slate-200 bg-slate-50 text-slate-800 font-medium truncate">
            {patientName || patientId}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1 min-w-[150px]">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">From Date</label>
        <input
          type="date"
          value={filters.fromDate}
          onChange={(e) => set('fromDate', e.target.value)}
          className="w-full px-3 py-1.5 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="flex flex-col gap-1 min-w-[150px]">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">To Date</label>
        <input
          type="date"
          value={filters.toDate}
          onChange={(e) => set('toDate', e.target.value)}
          className="w-full px-3 py-1.5 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="flex flex-col gap-1 min-w-[200px]">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Test Name</label>
        <input
          type="text"
          value={filters.testName}
          onChange={(e) => set('testName', e.target.value)}
          placeholder="Filter test rows…"
          className="w-full px-3 py-1.5 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide invisible">Quick</label>
        <div className="flex gap-1">
          {[
            { label: '3M', months: 3 },
            { label: '6M', months: 6 },
            { label: '1Y', months: 12 },
          ].map(({ label, months }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                const toDate = localDateISO()
                const from = new Date()
                from.setMonth(from.getMonth() - months)
                onChange({ ...filters, fromDate: localDateISO(from), toDate })
              }}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-600"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeCount > 0 ? (
        <ClearFiltersButton onClick={onClear} activeCount={activeCount} />
      ) : null}
    </div>
  )
}

export const LabTestHistory = ({
  patientId,
  patientName,
  onPatientChange,
  className = '',
}: LabTestHistoryProps) => {
  const defaults = defaultDateRange()
  const [filters, setFilters] = useState<Filters>({ ...defaults, testName: '' })
  const [columns, setColumns] = useState<LabHistoryMatrixColumn[]>([])
  const [rows, setRows] = useState<LabHistoryMatrixRow[]>([])
  const [displayPatientName, setDisplayPatientName] = useState(patientName || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [patientQuery, setPatientQuery] = useState(patientName || patientId || '')
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientLoading, setPatientLoading] = useState(false)

  useEffect(() => {
    setPatientQuery(patientName || patientId || '')
    setDisplayPatientName(patientName || '')
  }, [patientId, patientName])

  useEffect(() => {
    if (!patientOpen) return
    const timer = setTimeout(async () => {
      setPatientLoading(true)
      try {
        const results = patientQuery.trim()
          ? await searchPatients(patientQuery, 20)
          : await fetchPatients(20, 0)
        setPatientOptions(results)
      } catch {
        setPatientOptions([])
      } finally {
        setPatientLoading(false)
      }
    }, patientQuery.trim() ? 300 : 0)
    return () => clearTimeout(timer)
  }, [patientQuery, patientOpen])

  const loadMatrix = useCallback(async () => {
    if (!patientId) {
      setColumns([])
      setRows([])
      return
    }
    try {
      setLoading(true)
      setError(null)
      const data = await fetchLabTestHistoryMatrix({
        patient: patientId,
        from_date: filters.fromDate || undefined,
        to_date: filters.toDate || undefined,
        test_search: filters.testName.trim() || undefined,
      })
      setColumns(data.columns || [])
      setRows(data.rows || [])
      if (data.patient_name) setDisplayPatientName(data.patient_name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lab history')
      setColumns([])
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [patientId, filters.fromDate, filters.toDate, filters.testName])

  useEffect(() => {
    loadMatrix()
  }, [loadMatrix])

  const defaultFilters = makeDefaultFilters()
  const activeCount = [
    filters.fromDate !== defaultFilters.fromDate ? filters.fromDate : '',
    filters.toDate !== defaultFilters.toDate ? filters.toDate : '',
    filters.testName,
  ].filter(Boolean).length

  const handleClearFilters = () => setFilters(makeDefaultFilters())

  if (!patientId) {
    return (
      <div className={`flex flex-col min-w-full ${className}`}>
        <FilterBar
          filters={filters}
          onChange={setFilters}
          onClear={handleClearFilters}
          activeCount={0}
          patientQuery={patientQuery}
          onPatientQueryChange={setPatientQuery}
          onPatientSelect={(p) => onPatientChange?.(p.name)}
          patientOptions={patientOptions}
          patientOpen={patientOpen}
          setPatientOpen={setPatientOpen}
          patientLoading={patientLoading}
          showPatientPicker={!!onPatientChange}
        />
        <div className="text-center py-12 text-slate-400">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Select a patient to view lab test history</p>
          <p className="text-xs mt-1 text-slate-400">Results appear in a date matrix — one column per test date</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col min-w-full ${className}`}>
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onClear={handleClearFilters}
        activeCount={activeCount}
        patientId={patientId}
        patientName={displayPatientName}
        patientQuery={patientQuery}
        onPatientQueryChange={setPatientQuery}
        onPatientSelect={(p) => onPatientChange?.(p.name)}
        patientOptions={patientOptions}
        patientOpen={patientOpen}
        setPatientOpen={setPatientOpen}
        patientLoading={patientLoading}
        showPatientPicker={!!onPatientChange}
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-500">Loading lab history…</span>
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 m-4">
          <p className="text-red-700 text-sm">{error}</p>
          <button
            type="button"
            onClick={loadMatrix}
            className="mt-3 text-xs text-red-600 hover:text-red-800 font-medium"
          >
            Retry
          </button>
        </div>
      ) : columns.length === 0 && rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <Search className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">
            {activeCount > 0
              ? 'No lab results match the current filters.'
              : 'No lab results found for this patient in the selected date range.'}
          </p>
          {activeCount > 0 ? (
            <ClearFiltersButton className="mt-3 self-center" onClick={handleClearFilters} />
          ) : null}
        </div>
      ) : (
        <>
          {(() => {
            const displayColumns = padHistoryColumns(columns)
            return (
              <>
          <div className="px-4 py-2 text-xs text-slate-500 border-b border-slate-100 flex items-center justify-between gap-2">
            <span>
              {rows.length} test{rows.length !== 1 ? 's' : ''} × {columns.length} date
              {columns.length !== 1 ? 's' : ''}
              {filters.fromDate && filters.toDate ? ` (${filters.fromDate} → ${filters.toDate})` : ''}
            </span>
            <span className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-green-100 border border-green-200" /> Normal
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-100 border border-red-200" /> Abnormal
              </span>
              <span className="inline-flex items-center gap-1 text-slate-500">
                <span className="text-red-800 font-bold">↑</span> High
                <span className="text-red-800 font-bold ml-2">↓</span> Low
              </span>
            </span>
          </div>

          <div className="overflow-auto max-h-[520px]" style={{ scrollbarWidth: 'thin' }}>
            <table className="border-collapse w-auto table-fixed">
              <colgroup>
                <col style={{ width: `${TEST_COLUMN_WIDTH_PX}px` }} />
                {displayColumns.map((col) => (
                  <col key={col.key} className="w-[58px]" />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr>
                  <th
                    className="sticky left-0 z-20 bg-slate-50 border-b border-r border-slate-200 px-2 py-1.5 text-left text-xs font-semibold text-slate-600 uppercase truncate"
                    style={{ width: `${TEST_COLUMN_WIDTH_PX}px`, maxWidth: `${TEST_COLUMN_WIDTH_PX}px` }}
                  >
                    Test
                  </th>
                  {displayColumns.map((col) => {
                    const { dateLine, timeLine } = formatColumnHeader(col)
                    const isPad = col.key.startsWith('__pad_')
                    return (
                      <th
                        key={col.key}
                        className={`border-b border-slate-200 px-1.5 py-1.5 text-center text-[10px] font-semibold w-[58px] min-w-[58px] max-w-[72px] ${
                          isPad ? 'text-slate-300 border-slate-100' : 'text-slate-600'
                        }`}
                        title={isPad ? undefined : col.lab_test_name || col.lab_test}
                      >
                        {isPad ? (
                          <div className="leading-tight">—</div>
                        ) : (
                          <>
                            <div className="leading-tight">{dateLine}</div>
                            {timeLine ? (
                              <div className="text-[9px] font-normal text-slate-400 mt-0.5 truncate">{timeLine}</div>
                            ) : null}
                          </>
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={displayColumns.length + 1}
                      className="px-4 py-8 text-center text-sm text-slate-400"
                    >
                      No test rows match the current filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                  <tr key={row.key} className="hover:bg-slate-50/50">
                    <td
                      className="sticky left-0 z-[5] bg-white border-r border-slate-200 px-2 py-1.5 text-xs text-slate-800 font-medium truncate"
                      style={{ width: `${TEST_COLUMN_WIDTH_PX}px`, maxWidth: `${TEST_COLUMN_WIDTH_PX}px` }}
                      title={row.label}
                    >
                      {row.label}
                    </td>
                    {displayColumns.map((col) => {
                      const cell = row.cells[col.key]
                      const isPad = col.key.startsWith('__pad_')
                      return (
                        <td
                          key={col.key}
                          className={`px-1.5 py-1 text-center text-xs border-l w-[58px] min-w-[58px] max-w-[72px] ${
                            isPad ? 'border-slate-50 bg-slate-50/30' : `border-slate-100 ${cellClass(cell?.flag)}`
                          }`}
                          title={
                            cell?.value
                              ? `${cell.value}${cell.direction === 'high' ? ' (High)' : cell.direction === 'low' ? ' (Low)' : ''}`
                              : cell?.lab_test
                                ? `Lab Test: ${cell.lab_test}`
                                : undefined
                          }
                        >
                          <span className="inline-flex items-center justify-center gap-0.5 max-w-full">
                            <span className="truncate">{cell?.value ?? ''}</span>
                            {cellDirectionArrow(cell?.direction)}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
              </>
            )
          })()}
        </>
      )}
    </div>
  )
}
