import { useEffect, useMemo, useState } from 'react'
import { Stethoscope } from 'lucide-react'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { PhysicalExaminationDetailPanel } from './PhysicalExaminationDetailPanel'
import { useCareContext } from '../../providers/CareContextProvider'
import { useCardFilters, useInDashboardCard } from '../../contexts/CardFilterContext'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { DateFilterInput } from '../ui/DateFilterInput'

interface ExamRecord {
  name: string
  trans_no?: string
  patient: string
  patient_name?: string
  inpatient_admission?: string
  patient_visit?: string
  creation: string
}

interface PhysicalExaminationListProps {
  patient?: string
  refreshKey?: number
  onPatientClick?: (patient: string) => void
  /** When IP + active admission in header, scope list to that admission (default true). */
  scopeToActiveAdmission?: boolean
}

function recordDateDay(val?: string) {
  if (!val) return ''
  try {
    return new Date(val).toISOString().slice(0, 10)
  } catch {
    return String(val).slice(0, 10)
  }
}

export const PhysicalExaminationList = ({
  patient,
  refreshKey,
  onPatientClick,
  scopeToActiveAdmission = true,
}: PhysicalExaminationListProps) => {
  const { mode, activeAdmission } = useCareContext()
  const scopedAdmission =
    scopeToActiveAdmission && mode === 'IP' && activeAdmission ? activeAdmission : undefined
  const cardFilters = useCardFilters()
  const inDashboardCard = useInDashboardCard()
  const showFilters = cardFilters === true

  const [items, setItems] = useState<ExamRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [detailSubtitle, setDetailSubtitle] = useState<string | undefined>()

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
        if (scopedAdmission) filters.push(['inpatient_admission', '=', scopedAdmission])
        const params = new URLSearchParams({
          doctype: 'Physical Examination',
          fields: JSON.stringify(['name', 'trans_no', 'patient', 'patient_name', 'inpatient_admission', 'patient_visit', 'creation']),
          filters: JSON.stringify(filters),
          order_by: 'creation desc',
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
  }, [patient, refreshKey, scopedAdmission])

  const admissionOptions = useMemo(() => {
    const s = new Set<string>()
    for (const row of items) {
      if (row.inpatient_admission) s.add(row.inpatient_admission)
    }
    return Array.from(s).sort()
  }, [items])

  const filteredItems = useMemo(() => {
    return items.filter((row) => {
      const day = recordDateDay(row.creation)
      if (fromDate && day && day < fromDate) return false
      if (toDate && day && day > toDate) return false
      if (admissionFilter && row.inpatient_admission !== admissionFilter) return false
      return true
    })
  }, [items, fromDate, toDate, admissionFilter])

  const hasActiveFilters = Boolean(fromDate || toDate || admissionFilter)

  const openDetail = (row: ExamRecord) => {
    setDetailName(row.name)
    const parts = [row.patient_name || row.patient]
    if (row.inpatient_admission) {
      parts.push(row.inpatient_admission)
    } else if (row.patient_visit) {
      parts.push(row.patient_visit)
    }
    setDetailSubtitle(parts.filter(Boolean).join(' · ') || row.name)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-sm text-slate-500">
        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-primary" />
        Loading Physical Examinations...
      </div>
    )
  }

  if (error) {
    return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error.message}</div>
  }

  return (
    <>
      <div className="flex flex-col gap-2 h-full flex-1 min-h-0">
        {showFilters && (
          <div className="card-filter-bar flex flex-wrap items-end gap-3 border-b border-slate-100 bg-slate-50/80 py-2 flex-shrink-0">
            <div className="flex min-w-[120px] flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">From Date</label>
              <DateFilterInput
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex min-w-[120px] flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">To Date</label>
              <DateFilterInput
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              />
            </div>
            {!scopedAdmission && admissionOptions.length > 0 && (
              <div className="flex min-w-[160px] flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">Admission</label>
                <select
                  value={admissionFilter}
                  onChange={(e) => setAdmissionFilter(e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
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
          <p className="flex-shrink-0 text-[11px] text-slate-500">
            {filteredItems.length} record{filteredItems.length !== 1 ? 's' : ''}
            {hasActiveFilters && items.length !== filteredItems.length ? ` (of ${items.length})` : ''}
          </p>
        )}

        {filteredItems.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <Stethoscope className="mb-2 h-8 w-8 text-slate-300" />
            <p className="mb-1 text-sm text-slate-500">
              {items.length > 0 ? 'NO EXAMINATIONS MATCH YOUR FILTERS' : 'NO PHYSICAL EXAMINATIONS RECORDED YET'}
            </p>
            <p className="text-xs text-slate-400">
              {items.length > 0 ? 'Adjust or clear filters above' : 'Use the + button above to record a new examination'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-600">Record #</th>
                  {!patient && (
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-600">Patient</th>
                  )}
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-600">Admission</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-600">Date</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((row) => (
                  <tr key={row.name} className="transition-colors hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => openDetail(row)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {row.trans_no || row.name}
                      </button>
                    </td>
                    {!patient && (
                      <td
                        className="cursor-pointer px-3 py-2"
                        onClick={() => row.patient && onPatientClick?.(row.patient)}
                      >
                        <span className="font-medium text-primary hover:underline">
                          {row.patient_name || row.patient || '—'}
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-2 text-xs text-slate-500">{row.inpatient_admission || '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {row.creation ? new Date(row.creation).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      <PrintFormatDropdown
                        doctype="Physical Examination"
                        docName={row.name}
                        noLetterhead={0}
                        triggerPrint={1}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailName ? (
        <PhysicalExaminationDetailPanel
          name={detailName}
          subtitle={detailSubtitle}
          onClose={() => {
            setDetailName(null)
            setDetailSubtitle(undefined)
          }}
        />
      ) : null}
    </>
  )
}
