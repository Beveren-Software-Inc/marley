import { useEffect, useMemo, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { PatientHistoryDetailPanel } from './PatientHistoryDetailPanel'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import {
  useCardFilters,
  useDashboardCompactClinical,
  useInDashboardCard,
  usePreferCardLoadMore,
} from '../../contexts/CardFilterContext'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { DateFilterInput } from '../ui/DateFilterInput'
import {
  CardRowMetaHint,
  dashboardCardRowHoverClass,
  formatDashboardDate,
} from '../ui/dashboardCardListing'
import {
  PaginationControls,
  LoadMoreControls,
  DEFAULT_PAGE_SIZE,
  type PageSize,
} from '../ui/PaginationControls'

interface HistoryRecord {
  name: string
  patient: string
  inpatient_admission?: string
  patient_visit?: string
  date?: string
  creation: string
}

interface PatientHistoryListProps {
  patient?: string
  inpatientAdmission?: string
  refreshKey?: number
  onPatientClick?: (patient: string) => void
}

function historyDateDay(val?: string) {
  const source = val || ''
  if (!source) return ''
  try {
    return new Date(source).toISOString().slice(0, 10)
  } catch {
    return String(source).slice(0, 10)
  }
}

function formatHistoryDateOnly(val?: string) {
  if (!val) return '—'
  return formatDashboardDate(val)
}

function formatHistoryDateTime(val?: string) {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleString('en-GB')
  } catch {
    return val
  }
}

function recordDate(row: HistoryRecord) {
  return row.date || row.creation
}

function buildHistoryFilters(opts: {
  patient?: string
  inpatientAdmission?: string
  admissionFilter?: string
  fromDate?: string
  toDate?: string
}): [string, string, string][] {
  const filters: [string, string, string][] = []
  if (opts.patient) filters.push(['patient', '=', opts.patient])
  if (opts.inpatientAdmission) {
    filters.push(['inpatient_admission', '=', opts.inpatientAdmission])
  } else if (opts.admissionFilter) {
    filters.push(['inpatient_admission', '=', opts.admissionFilter])
  }
  if (opts.fromDate) filters.push(['date', '>=', opts.fromDate])
  if (opts.toDate) filters.push(['date', '<=', opts.toDate])
  return filters
}

export const PatientHistoryList = ({
  patient,
  inpatientAdmission,
  refreshKey,
  onPatientClick,
}: PatientHistoryListProps) => {
  const [items, setItems] = useState<HistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  const [totalCount, setTotalCount] = useState(0)

  const cardFilters = useCardFilters()
  const inDashboardCard = useInDashboardCard()
  const preferLoadMore = usePreferCardLoadMore()
  const compactClinical = useDashboardCompactClinical()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [admissionFilter, setAdmissionFilter] = useState('')

  useEffect(() => {
    setPage(1)
  }, [patient, inpatientAdmission, refreshKey, fromDate, toDate, admissionFilter, pageSize])

  useEffect(() => {
    const load = async () => {
      if (items.length === 0) setLoading(true)
      else setRefreshing(true)
      setError(null)
      try {
        const filters = buildHistoryFilters({
          patient,
          inpatientAdmission,
          admissionFilter: inpatientAdmission ? undefined : admissionFilter,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        })
        const fields = JSON.stringify([
          'name',
          'patient',
          'inpatient_admission',
          'patient_visit',
          'date',
          'creation',
        ])
        const listParams = new URLSearchParams({
          doctype: 'Patient History',
          fields,
          filters: JSON.stringify(filters),
          order_by: 'date desc, creation desc',
          limit_page_length: String(pageSize),
          limit_start: String((page - 1) * pageSize),
        })
        const countParams = new URLSearchParams({
          doctype: 'Patient History',
          filters: JSON.stringify(filters),
        })
        const [listRes, countRes] = await Promise.all([
          fetch(`/api/method/frappe.client.get_list?${listParams}`),
          fetch(`/api/method/frappe.client.get_count?${countParams}`),
        ])
        const listData = await listRes.json()
        const countData = await countRes.json()
        const rows: HistoryRecord[] = Array.isArray(listData?.message) ? listData.message : []
        const count = typeof countData?.message === 'number' ? countData.message : rows.length
        setItems((prev) => (preferLoadMore && page > 1 ? [...prev, ...rows] : rows))
        setTotalCount(count)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load records'))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- items.length only gates loading spinner
  }, [
    patient,
    inpatientAdmission,
    refreshKey,
    fromDate,
    toDate,
    admissionFilter,
    page,
    pageSize,
    preferLoadMore,
  ])

  const admissionOptions = useMemo(() => {
    const s = new Set<string>()
    for (const it of items) {
      if (it.inpatient_admission) s.add(it.inpatient_admission)
    }
    return Array.from(s).sort()
  }, [items])

  /** Client safety net if date/creation display differs from server `date` filter. */
  const filteredItems = useMemo(() => {
    if (!fromDate && !toDate) return items
    return items.filter((row) => {
      const day = historyDateDay(recordDate(row))
      if (fromDate && day && day < fromDate) return false
      if (toDate && day && day > toDate) return false
      return true
    })
  }, [items, fromDate, toDate])

  const hasActiveFilters = Boolean(fromDate || toDate || admissionFilter)

  const openDetail = (name: string) => setDetailName(name)

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center p-6 text-sm text-slate-500">
        <span className="w-4 h-4 border-2 border-slate-300 border-t-primary rounded-full animate-spin mr-2" />
        Loading Patient Histories...
      </div>
    )
  }
  if (error && items.length === 0) {
    return <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">{error.message}</div>
  }

  return (
    <div className={`flex flex-col gap-2 h-full flex-1 min-h-0 transition-opacity ${refreshing ? 'opacity-60' : ''}`}>
      {cardFilters === undefined && (
        <div className="flex items-center justify-end flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowFiltersInternal((v) => !v)}
            className={`p-1.5 rounded-md border transition-colors ${
              showFilters
                ? 'bg-primary/10 border-primary text-primary'
                : 'border-slate-300 text-slate-500 hover:bg-slate-50'
            }`}
            title={showFilters ? 'Hide filters' : 'Show filters'}
          >
            Filters
          </button>
        </div>
      )}

      {showFilters && (
        <div className="card-filter-bar flex flex-wrap items-end gap-3 py-2 border-b border-slate-100 bg-slate-50/80 flex-shrink-0">
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-xs font-medium text-slate-500">From Date</label>
            <DateFilterInput
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-xs font-medium text-slate-500">To Date</label>
            <DateFilterInput
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          {!inpatientAdmission && (
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-xs font-medium text-slate-500">Admission</label>
              <select
                value={admissionFilter}
                onChange={(e) => setAdmissionFilter(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
              >
                <option value="">Select All</option>
                {admissionOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
                {admissionFilter && !admissionOptions.includes(admissionFilter) ? (
                  <option value={admissionFilter}>{admissionFilter}</option>
                ) : null}
              </select>
            </div>
          )}
          {hasActiveFilters && (
            <ClearFiltersButton
              onClick={() => {
                setFromDate('')
                setToDate('')
                setAdmissionFilter('')
              }}
            />
          )}
        </div>
      )}

      {patient && !inDashboardCard && (
        <p className="text-[11px] text-slate-500 flex-shrink-0">
          {totalCount} record{totalCount !== 1 ? 's' : ''}
        </p>
      )}

      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center flex-1">
          <BookOpen className="w-8 h-8 text-slate-300 mb-2" />
          <p className="text-sm text-slate-500 mb-1">NO PATIENT HISTORY RECORDS YET</p>
          <p className="text-xs text-slate-400">Use the + button to record a new history</p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {compactClinical ? (
            <div className="overflow-auto border border-slate-200 rounded-md flex-1 min-h-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Date</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Admission</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((row) => {
                    const metaFields = [
                      ['Record', row.name],
                      ['Visit', row.patient_visit],
                      ['Created', row.creation ? formatHistoryDateTime(row.creation) : ''],
                    ] as const
                    return (
                      <tr
                        key={row.name}
                        className={dashboardCardRowHoverClass}
                        onClick={() => openDetail(row.name)}
                      >
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              openDetail(row.name)
                            }}
                            className="text-primary hover:underline font-medium text-xs whitespace-nowrap"
                          >
                            {formatHistoryDateOnly(recordDate(row))}
                          </button>
                          <CardRowMetaHint fields={metaFields} />
                        </td>
                        <td className="px-3 py-2 text-slate-500 text-xs">{row.inpatient_admission || '—'}</td>
                        <td className="px-3 py-2 text-slate-500 text-xs" onClick={(e) => e.stopPropagation()}>
                          <PrintFormatDropdown
                            doctype="Patient History"
                            docName={row.name}
                            noLetterhead={0}
                            triggerPrint={1}
                            className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-auto border border-slate-200 rounded-md flex-1 min-h-0">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Date</th>
                    {!patient && (
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Patient</th>
                    )}
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Admission</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Visit</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((row) => (
                    <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => openDetail(row.name)}
                          className="text-primary hover:underline font-medium text-xs whitespace-nowrap"
                        >
                          {formatHistoryDateTime(recordDate(row))}
                        </button>
                      </td>
                      {!patient && (
                        <td
                          className="px-3 py-2 cursor-pointer"
                          onClick={() => row.patient && onPatientClick?.(row.patient)}
                        >
                          <span className="font-medium text-primary hover:underline">{row.patient || '—'}</span>
                        </td>
                      )}
                      <td className="px-3 py-2 text-slate-500 text-xs">{row.inpatient_admission || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 text-xs">{row.patient_visit || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 text-xs">
                        <PrintFormatDropdown
                          doctype="Patient History"
                          docName={row.name}
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

          {preferLoadMore ? (
            <LoadMoreControls
              loadedCount={items.length}
              totalCount={totalCount}
              pageSize={pageSize}
              loading={loading || refreshing}
              onLoadMore={() => setPage((p) => p + 1)}
            />
          ) : (
            <PaginationControls
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              loading={loading || refreshing}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
            />
          )}
        </div>
      )}

      {detailName && (
        <PatientHistoryDetailPanel name={detailName} onClose={() => setDetailName(null)} />
      )}
    </div>
  )
}
