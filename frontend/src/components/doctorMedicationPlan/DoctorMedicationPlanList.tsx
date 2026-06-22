import { useEffect, useState } from 'react'
import {
  fetchDoctorMedicationPlans,
  type DoctorMedicationPlanRow,
} from '../../services/doctorMedicationPlan'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { DocDetailView } from '../ui/DocDetailView'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { useCareContext } from '../../providers/CareContextProvider'
import { useCardFilters, useDashboardCompactClinical } from '../../contexts/CardFilterContext'
import { CardRowMetaHint, dashboardCardRowHoverClass, stripHtmlToText } from '../ui/dashboardCardListing'
import { EditDoctorMedicationPlanModal } from './EditDoctorMedicationPlanModal'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'

interface DoctorMedicationPlanListProps {
  patient?: string
  onPatientClick?: (patient: string) => void
}

export const DoctorMedicationPlanList = ({ patient, onPatientClick }: DoctorMedicationPlanListProps) => {
  const { mode, activeVisit } = useCareContext()
  const cardFilters = useCardFilters()
  const compactClinical = useDashboardCompactClinical()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const isInsideCard = cardFilters !== undefined

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [practitionerFilter, setPractitionerFilter] = useState('')
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])

  const [rows, setRows] = useState<DoctorMedicationPlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [editPlanName, setEditPlanName] = useState<string | null>(null)
  const [listRefreshTick, setListRefreshTick] = useState(0)

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
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        let referenceDoctype: string | undefined
        let referenceDocument: string | undefined
        if (mode === 'OP' && activeVisit) {
          referenceDoctype = 'Patient Visit'
          referenceDocument = activeVisit
        }
        const data = await fetchDoctorMedicationPlans(50, 0, patient, referenceDoctype, referenceDocument, {
          practitioner: practitionerFilter || undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        })
        setRows(data)
      } catch (err) {
        console.error("Error loading doctor's plans:", err)
        setError(err instanceof Error ? err : new Error("Failed to fetch doctors' plans"))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [patient, mode, activeVisit, listRefreshTick, practitionerFilter, fromDate, toDate])

  const contextLabel =
    mode === 'OP' && activeVisit ? `Doctor's Plan for OP visit: ${activeVisit}` : null

  const hasActiveFilters = Boolean(practitionerFilter || fromDate || toDate)

  const planPreview = (row: DoctorMedicationPlanRow, maxLen: number) => {
    if (!row.plan) return '—'
    const plain = stripHtmlToText(row.plan)
    return plain.length > maxLen ? `${plain.substring(0, maxLen)}…` : plain
  }

  const clearFilters = () => {
    setFromDate('')
    setToDate('')
    setPractitionerFilter('')
    setPractitionerQuery('')
  }

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading doctors' plans...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Could not load doctors' plans</h3>
          <p className="text-red-700 text-sm">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-full flex flex-col flex-1 min-h-0 h-full">
      {!isInsideCard && (
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

      {contextLabel && !compactClinical && (
        <div className="mb-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700 flex-shrink-0">
          {contextLabel}
        </div>
      )}

      {showFilters && !compactClinical && (
        <div className="flex flex-wrap items-end gap-3 mb-3 px-1 flex-shrink-0">
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-xs font-medium text-slate-500">From date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-xs font-medium text-slate-500">To date</label>
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
                  ? practitionerOptions.find((p) => p.name === practitionerFilter)?.label ||
                    practitionerFilter
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
              <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-auto">
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
          {hasActiveFilters && (
            <ClearFiltersButton onClick={clearFilters} />
          )}
        </div>
      )}

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8">
              <div className="text-slate-500 text-center">
                {contextLabel && <p className="text-sm text-slate-600 mb-2">{contextLabel}</p>}
                <p>{hasActiveFilters ? 'No plans match the filters.' : "No doctors' plans found yet"}</p>
              </div>
            </div>
          ) : compactClinical ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap w-[28%]">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Plan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map((row) => {
                    const metaFields = [
                      ['Plan ID', row.name],
                      ['Patient', row.patient],
                      ['Practitioner', row.practitioner],
                      [
                        'Visit',
                        row.reference_document
                          ? `${row.reference_doctype || 'Patient Visit'}: ${row.reference_document}`
                          : '',
                      ],
                      ['Recommendation', row.recommendation ? stripHtmlToText(row.recommendation) : ''],
                      ['Reception note', row.reception_note ? stripHtmlToText(row.reception_note) : ''],
                    ] as const
                    const planPlain = row.plan ? stripHtmlToText(row.plan) : ''
                    return (
                      <tr
                        key={row.name}
                        className={dashboardCardRowHoverClass}
                        onClick={() => setDetailName(row.name)}
                      >
                        <td className="px-3 py-2.5 text-xs text-slate-700 whitespace-nowrap align-top">
                          <span className="text-primary font-medium">
                            {row.posting_date ? new Date(row.posting_date).toLocaleString() : '—'}
                          </span>
                          <CardRowMetaHint fields={metaFields} />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-700 align-top">
                          <div className="line-clamp-4" title={planPlain || undefined}>
                            {planPreview(row, 280)}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase min-w-[260px]">
                      Plan
                    </th>
                    {!patient && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Patient</th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Practitioner</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Visit</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map((row) => (
                    <tr key={row.name} className="hover:bg-slate-50">
                      <td
                        className="px-4 py-3 text-sm text-slate-700 cursor-pointer whitespace-nowrap"
                        onClick={() => setDetailName(row.name)}
                      >
                        <span className="text-primary hover:underline">
                          {row.posting_date ? new Date(row.posting_date).toLocaleString() : '—'}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 text-sm text-slate-700 align-top max-w-xl cursor-pointer"
                        onClick={() => setDetailName(row.name)}
                      >
                        <div className="line-clamp-4" title={row.plan ? stripHtmlToText(row.plan) : ''}>
                          {planPreview(row, 220)}
                        </div>
                      </td>
                      {!patient && (
                        <td
                          className="px-4 py-3 text-sm cursor-pointer"
                          onClick={() => row.patient && onPatientClick?.(row.patient)}
                        >
                          <span className="font-medium text-primary hover:underline">{row.patient || '—'}</span>
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm text-slate-700">{row.practitioner || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 max-w-[140px] truncate">
                        {row.reference_document || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-center whitespace-nowrap">
                        <div className="inline-flex items-center justify-center gap-2">
                          <button
                            type="button"
                            title="Edit plan"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditPlanName(row.name)
                            }}
                            className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <PrintFormatDropdown
                            doctype="Doctor Medication Plan"
                            docName={row.name}
                            noLetterhead={0}
                            triggerPrint={1}
                            className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editPlanName && (
        <EditDoctorMedicationPlanModal
          planName={editPlanName}
          onClose={() => setEditPlanName(null)}
          onSuccess={() => {
            setListRefreshTick((t) => t + 1)
          }}
        />
      )}

      {detailName && (
        <DetailSlideOver
          title="Doctor's Plan"
          subtitle={detailName}
          onClose={() => setDetailName(null)}
        >
          <DocDetailView doctype="Doctor Medication Plan" name={detailName} />
        </DetailSlideOver>
      )}
    </div>
  )
}
