import { useEffect, useMemo, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { PatientHistoryDetailPanel } from './PatientHistoryDetailPanel'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { useCardFilters, useDashboardCompactClinical, useInDashboardCard } from '../../contexts/CardFilterContext'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { DateFilterInput } from '../ui/DateFilterInput'
import {
  CardRowMetaHint,
  dashboardCardRowHoverClass,
  formatDashboardDate,
} from '../ui/dashboardCardListing'

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

export const PatientHistoryList = ({
  patient,
  inpatientAdmission,
  refreshKey,
  onPatientClick,
}: PatientHistoryListProps) => {
  const [items, setItems] = useState<HistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)

  const cardFilters = useCardFilters()
  const inDashboardCard = useInDashboardCard()
  const compactClinical = useDashboardCompactClinical()
  const showFilters = cardFilters === true

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [admissionFilter, setAdmissionFilter] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const filters: [string, string, string][] = []
        if (patient) filters.push(['patient', '=', patient])
        if (inpatientAdmission) filters.push(['inpatient_admission', '=', inpatientAdmission])
        const params = new URLSearchParams({
          doctype: 'Patient History',
          fields: JSON.stringify([
            'name',
            'patient',
            'inpatient_admission',
            'patient_visit',
            'date',
            'creation',
          ]),
          filters: JSON.stringify(filters),
          order_by: 'date desc, creation desc',
          limit: '50',
        })
        const res = await fetch(`/api/method/frappe.client.get_list?${params}`)
        const data = await res.json()
        setItems(Array.isArray(data?.message) ? data.message : [])
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load records'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [patient, inpatientAdmission, refreshKey])

  const admissionOptions = useMemo(() => {
    const s = new Set<string>()
    for (const it of items) {
      if (it.inpatient_admission) s.add(it.inpatient_admission)
    }
    return Array.from(s).sort()
  }, [items])

  const filteredItems = useMemo(() => {
    return items.filter((row) => {
      const day = historyDateDay(recordDate(row))
      if (fromDate && day && day < fromDate) return false
      if (toDate && day && day > toDate) return false
      if (admissionFilter && row.inpatient_admission !== admissionFilter) return false
      return true
    })
  }, [items, fromDate, toDate, admissionFilter])

  const hasActiveFilters = Boolean(fromDate || toDate || admissionFilter)

  const openDetail = (name: string) => setDetailName(name)

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-sm text-slate-500">
        <span className="w-4 h-4 border-2 border-slate-300 border-t-primary rounded-full animate-spin mr-2" />
        Loading Patient Histories...
      </div>
    )
  }
  if (error) {
    return <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">{error.message}</div>
  }

  return (
    <div className="flex flex-col gap-2 h-full flex-1 min-h-0">
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
          {!inpatientAdmission && admissionOptions.length > 0 && (
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
          {filteredItems.length} record{filteredItems.length !== 1 ? 's' : ''}
          {hasActiveFilters && items.length !== filteredItems.length ? ` (of ${items.length})` : ''}
        </p>
      )}

      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center flex-1">
          <BookOpen className="w-8 h-8 text-slate-300 mb-2" />
          <p className="text-sm text-slate-500 mb-1">NO PATIENT HISTORY RECORDS YET</p>
          <p className="text-xs text-slate-400">Use the + button to record a new history</p>
        </div>
      ) : compactClinical ? (
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

      {detailName && (
        <PatientHistoryDetailPanel name={detailName} onClose={() => setDetailName(null)} />
      )}
    </div>
  )
}
