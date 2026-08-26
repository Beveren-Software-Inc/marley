import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { fetchDischarges, type Discharge } from '../../services/discharges'
import { formatDateTimeDisplay } from '../../utils/admissionDateTime'
import { resolveDischargeDisplayDate } from '../../utils/dischargeDisplay'
import { fetchInpatientRecords } from '../../services/inpatientRecords'
import { StatusPill } from '../ui/StatusPill'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { DischargeDetailPanel } from './DischargeDetailPanel'
import { useCareContext } from '../../providers/CareContextProvider'
import { PaginationControls, LoadMoreControls, DEFAULT_PAGE_SIZE, type PageSize } from '../ui/PaginationControls'
import { useCardFilters, usePreferCardLoadMore } from '../../contexts/CardFilterContext'
import { navigateToDischarge } from '../../utils/dischargeNavigation'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { DateFilterInput } from '../ui/DateFilterInput'
import { useSlideOverListNav } from '../../hooks/useSlideOverListNav'
import {
  CHECKLIST_STATUS_COLORS,
  CHECKLIST_STATUS_LABELS,
  type DischargeChecklistStatus,
} from '../../utils/dischargeChecklistStatus'

const statusColors: Record<string, string> = {
  'Draft': 'warning',
  'Submitted': 'success',
  'Cancelled': 'danger'
}

interface DischargeListProps {
  patient?: string
  admission?: string
  onPatientClick?: (patient: string) => void
}

export const DischargeList = ({ patient, admission, onPatientClick }: DischargeListProps) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { mode, activeAdmission, selectedPatient: contextPatient, applyIpCareContext } = useCareContext()
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // When IP mode has a specific admission, scope discharges to that admission
  // unless a patient is in scope (dashboard patient view shows all discharges for that patient).
  const effectivePatient = patient ?? (contextPatient || undefined)
  const effectiveAdmission = (mode === 'IP' && activeAdmission && !effectivePatient) ? activeAdmission : admission

  const [discharges, setDischarges] = useState<Discharge[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const dischargesRef = useRef<Discharge[]>([])
  dischargesRef.current = discharges
  const [detailRow, setDetailRow] = useState<Discharge | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [admissionFilter, setAdmissionFilter] = useState<string>('')
  const [dischargeIdFilter, setDischargeIdFilter] = useState<string>('')
  const cardFilters = useCardFilters()
  const preferLoadMore = usePreferCardLoadMore()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const isInsideCard = cardFilters !== undefined
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  const [totalCount, setTotalCount] = useState(0)

  const excludeCancelled = Boolean(effectivePatient && !statusFilter && !effectiveAdmission)

  // Discharge ID — searchable dropdown (link to Discharge)
  const [dischargeIdQuery, setDischargeIdQuery] = useState('')
  const [dischargeIdOptions, setDischargeIdOptions] = useState<{ value: string; label: string }[]>([])
  const [dischargeIdOpen, setDischargeIdOpen] = useState(false)
  const [selectedDischargeIdOpt, setSelectedDischargeIdOpt] = useState<{ value: string; label: string } | null>(null)

  // IP Admission — searchable dropdown (like Admission list Case No)
  const [admissionNoQuery, setAdmissionNoQuery] = useState('')
  const [admissionOptions, setAdmissionOptions] = useState<{ value: string; label: string }[]>([])
  const [admissionOpen, setAdmissionOpen] = useState(false)
  const [selectedAdmissionOpt, setSelectedAdmissionOpt] = useState<{ value: string; label: string } | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadDischarges = async () => {
      try {
        if (dischargesRef.current.length === 0) {
          setLoading(true)
        } else {
          setRefreshing(true)
        }
        setError(null)
        const resolvedAdmission = dischargeIdFilter ? undefined : (admissionFilter || effectiveAdmission)
        const search = dischargeIdFilter || undefined
        const response = await fetchDischarges(
          pageSize,
          (page - 1) * pageSize,
          effectivePatient,
          resolvedAdmission,
          search,
          fromDate || undefined,
          toDate || undefined,
          statusFilter || undefined,
          typeFilter || undefined,
          excludeCancelled
        )
        if (cancelled) return
        setDischarges((prev) =>
          preferLoadMore && page > 1 ? [...prev, ...response.data] : response.data
        )
        setTotalCount(response.total_count)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to fetch discharges'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    loadDischarges()
    return () => {
      cancelled = true
    }
  }, [effectivePatient, effectiveAdmission, admissionFilter, dischargeIdFilter, fromDate, toDate, statusFilter, typeFilter, page, pageSize, excludeCancelled])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [effectivePatient, effectiveAdmission, admissionFilter, dischargeIdFilter, fromDate, toDate, statusFilter, typeFilter, excludeCancelled])

  const { hasPrev, hasNext, navLabel, goPrev, goNext } = useSlideOverListNav({
    items: discharges,
    loading,
    refreshing,
    getKey: (row) => row.name,
    selectedKey: detailRow?.name ?? null,
    onSelect: setDetailRow,
    page,
    setPage,
    pageSize,
    totalCount,
  })

  // Load discharge ID options when dropdown is open (searchable list of discharges)
  useEffect(() => {
    if (!dischargeIdOpen) return
    const t = setTimeout(async () => {
      try {
        const response = await fetchDischarges(30, 0, effectivePatient, undefined, dischargeIdQuery || undefined)
        setDischargeIdOptions(
          response.data.map((d) => ({
            value: d.name,
            label: `${d.name}${d.patient_name ? ` - ${d.patient_name}` : ''}`,
          }))
        )
      } catch (err) {
        setDischargeIdOptions([])
      }
    }, dischargeIdQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [dischargeIdQuery, dischargeIdOpen, effectivePatient])

  // Load admission options when dropdown is open (searchable list of inpatient admissions)
  useEffect(() => {
    if (!admissionOpen) return
    const t = setTimeout(async () => {
      try {
        const response = await fetchInpatientRecords(
          undefined,
          admissionNoQuery || undefined,
          effectivePatient,
          undefined,
          undefined,
          undefined,
          30,
          0
        )
        setAdmissionOptions(
          response.data.slice(0, 30).map((r) => ({
            value: r.name,
            label: `${r.name}${r.patient_name ? ` - ${r.patient_name}` : ''}`,
          }))
        )
      } catch (err) {
        setAdmissionOptions([])
      }
    }, admissionNoQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [admissionNoQuery, admissionOpen, effectivePatient])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-discharge-filter-dropdown]')) {
        setDischargeIdOpen(false)
        setAdmissionOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleDischargeIdSelect = (opt: { value: string; label: string }) => {
    setSelectedDischargeIdOpt(opt)
    setDischargeIdFilter(opt.value)
    setDischargeIdQuery('')
    setDischargeIdOpen(false)
    void fetchDischarges(1, 0, effectivePatient, undefined, opt.value)
      .then((response) => {
        if (response.data[0]) setDetailRow(response.data[0])
      })
      .catch(() => {})
  }

  const handleAdmissionLinkClick = (discharge: Discharge) => {
    if (!discharge.admission) return
    applyIpCareContext({
      patient: discharge.file_no || effectivePatient,
      admission: discharge.admission,
      admissionLabel: discharge.admission,
    })
  }

  const handleAdmissionSelect = (opt: { value: string; label: string }) => {
    setSelectedAdmissionOpt(opt)
    setAdmissionFilter(opt.value)
    setAdmissionNoQuery('')
    setAdmissionOpen(false)
  }

  const handleClearFilters = () => {
    setDischargeIdFilter('')
    setDischargeIdQuery('')
    setSelectedDischargeIdOpt(null)
    setDischargeIdOpen(false)
    setAdmissionFilter('')
    setAdmissionNoQuery('')
    setSelectedAdmissionOpt(null)
    setStatusFilter('')
    setTypeFilter('')
    setFromDate('')
    setToDate('')
    setAdmissionOpen(false)
  }

  const formatDate = (dateStr?: string) => formatDateTimeDisplay(dateStr, '-')

  const getDocStatus = (docstatus?: number): string => {
    if (docstatus === 0) return 'Draft'
    if (docstatus === 1) return 'Submitted'
    if (docstatus === 2) return 'Cancelled'
    return 'Draft'
  }

  const statusOptions = ['Draft', 'Submitted', 'Cancelled']
  const dischargeTypeOptions = ['Home', 'DAMA', 'Refer To Another Hospital']
  const inputClass = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white'

  const isDraftDischarge = (discharge: Discharge) => discharge.docstatus === 0

  const getChecklistRowClass = (discharge: Discharge) => {
    if (discharge.docstatus !== 1 || !discharge.checklist_status) return ''
    if (discharge.checklist_status === 'incomplete') return 'bg-red-50/80'
    if (discharge.checklist_status === 'finance_pending') return 'bg-yellow-50/80'
    return ''
  }

  const renderChecklistStatus = (discharge: Discharge) => {
    const status = discharge.checklist_status
    if (!status || status === 'none') return <span className="text-slate-400">—</span>
    if (status === 'complete') {
      return (
        <StatusPill
          status={`${discharge.checklist_completed ?? 0}/${discharge.checklist_total ?? 0}`}
          color="success"
        />
      )
    }
    const color = CHECKLIST_STATUS_COLORS[status as Exclude<DischargeChecklistStatus, 'none' | 'complete'>]
    const progress =
      discharge.checklist_total != null && discharge.checklist_completed != null
        ? ` (${discharge.checklist_completed}/${discharge.checklist_total})`
        : ''
    return (
      <StatusPill
        status={`${CHECKLIST_STATUS_LABELS[status]}${progress}`}
        color={color}
      />
    )
  }

  const handleContinueDraft = (discharge: Discharge) => {
    if (!discharge.admission) return
    navigateToDischarge(
      {
        name: discharge.admission,
        patient: discharge.file_no,
        patient_name: discharge.patient_name,
      },
      navigate,
      `${location.pathname}${location.search}`
    )
    setOpenActionRow(null)
  }

  if (loading && discharges.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading discharges...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Discharges</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col flex-1 min-h-0 h-full transition-opacity ${refreshing ? 'opacity-60 pointer-events-none' : ''} ${isInsideCard ? '' : 'bg-white border border-slate-200 rounded-lg'}`}>
      {/* Global-context active admission banner */}
      {effectiveAdmission && mode === 'IP' && activeAdmission && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-t-lg bg-blue-50 border-b border-blue-200 text-blue-800 text-xs">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          Filtered by active admission: <span className="font-semibold ml-1">{effectiveAdmission}</span>
        </div>
      )}

      {/* Header row — hidden when inside a DashboardCard (card provides its own header) */}
      {!isInsideCard && (
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <h2 className="text-xl font-semibold text-slate-900">Discharges</h2>
          <button
            type="button"
            onClick={() => setShowFiltersInternal(prev => !prev)}
            className={`p-1.5 rounded-md border transition-colors ${showFilters ? 'bg-primary/10 border-primary text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}
            title={showFilters ? 'Hide filters' : 'Show filters'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
          </button>
        </div>
      )}

      {!isInsideCard && discharges.some((d) => d.checklist_status === 'incomplete' || d.checklist_status === 'finance_pending') && (
        <div className="mx-4 mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            Checklist incomplete
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
            Finance items only pending (Billing Finalization / Final Financial Check)
          </span>
        </div>
      )}

      {/* Filters — hidden by default */}
      {showFilters && (
      <div className="card-filter-bar flex flex-wrap gap-3 mb-4 items-end px-4 pt-3 pb-2 border-b border-slate-200">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">From Date</label>
          <DateFilterInput
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">To Date</label>
          <DateFilterInput
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={inputClass}
          />
        </div>
        {/* Discharge ID — searchable dropdown (link to Discharge) */}
        <div data-discharge-filter-dropdown className="relative">
          <label className="block text-xs font-medium text-slate-600 mb-1">Discharge ID</label>
          <input
            type="text"
            value={selectedDischargeIdOpt ? selectedDischargeIdOpt.value : dischargeIdQuery}
            onChange={(e) => {
              setDischargeIdQuery(e.target.value)
              setSelectedDischargeIdOpt(null)
              setDischargeIdFilter('')
              setDischargeIdOpen(true)
            }}
            onFocus={() => setDischargeIdOpen(true)}
            placeholder="Search discharge..."
            className={`${inputClass} w-44`}
          />
          {dischargeIdOpen && dischargeIdOptions.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
              {dischargeIdOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleDischargeIdSelect(opt)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                >
                  <div className="font-medium text-slate-800">{opt.value}</div>
                  {opt.label !== opt.value && (
                    <div className="text-xs text-slate-500 truncate">{opt.label}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* IP Admission — searchable dropdown */}
        <div data-discharge-filter-dropdown className="relative">
          <label className="block text-xs font-medium text-slate-600 mb-1">IP Admission</label>
          <input
            type="text"
            value={selectedAdmissionOpt ? selectedAdmissionOpt.value : admissionNoQuery}
            onChange={(e) => {
              setAdmissionNoQuery(e.target.value)
              setSelectedAdmissionOpt(null)
              setAdmissionFilter('')
              setAdmissionOpen(true)
            }}
            onFocus={() => setAdmissionOpen(true)}
            placeholder="Search admission..."
            className={`${inputClass} w-44`}
          />
          {admissionOpen && admissionOptions.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
              {admissionOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleAdmissionSelect(opt)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                >
                  <div className="font-medium text-slate-800">{opt.value}</div>
                  {opt.label !== opt.value && (
                    <div className="text-xs text-slate-500 truncate">{opt.label}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>



        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={inputClass}
          >
            <option value="">Select All</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Discharge Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={inputClass}
          >
            <option value="">Select All</option>
            {dischargeTypeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {(dischargeIdFilter || admissionFilter || statusFilter || typeFilter || fromDate || toDate) && (
          <div className="flex items-end">
            <ClearFiltersButton onClick={handleClearFilters} />
          </div>
        )}
      </div>
      )}

      {/* Empty or Table Data */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-4 pb-3">
      {discharges.length === 0 ? (
        <div className="flex flex-1 min-h-0 items-center justify-center p-8">
          <div className="text-slate-500 text-center">
            <svg className="w-12 h-12 mx-auto mb-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-medium">NO DISCHARGES FOUND</p>
            <p className="text-xs mt-1">Try adjusting your filters to see more results</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-auto">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Discharge ID
                  </th>
                  {!patient && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                      Patient
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Admission No
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Admission Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Discharge Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Discharge Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Discharged By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Checklist
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[100px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {discharges.map((discharge) => (
                  <tr key={discharge.name} className={`hover:bg-slate-50 ${getChecklistRowClass(discharge)}`}>
                    <td className="px-4 py-3 text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => setDetailRow(discharge)}
                        className="text-primary hover:underline text-left focus:outline-none"
                        title="View discharge details"
                      >
                        {discharge.name}
                      </button>
                    </td>
                    {!patient && (
                      <td
                        className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                        onClick={() => discharge.file_no && onPatientClick?.(discharge.file_no)}
                      >
                        <span className="font-medium text-primary hover:underline">{discharge.patient_name || discharge.file_no || '-'}</span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm font-medium">
                      {discharge.admission ? (
                        <button
                          type="button"
                          onClick={() => handleAdmissionLinkClick(discharge)}
                          className="text-primary hover:underline text-left focus:outline-none"
                          title="Select this admission in header"
                        >
                          {discharge.admission}
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {formatDate(discharge.admission_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {formatDate(
                        discharge.display_discharge_date ||
                          resolveDischargeDisplayDate(discharge)
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {discharge.discharge_type || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {discharge.discharged_by_user_name || discharge.discharged_by_user || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill
                        status={getDocStatus(discharge.docstatus)}
                        color={statusColors[getDocStatus(discharge.docstatus)] || 'default'}
                      />
                    </td>
                    <td className="px-4 py-3">{renderChecklistStatus(discharge)}</td>
                    <td className="px-4 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <div
                          className="relative inline-block"
                          ref={openActionRow === discharge.name ? menuRef : undefined}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setOpenActionRow((prev) =>
                                prev === discharge.name ? null : discharge.name
                              )
                            }
                            className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                            aria-label="Discharge actions"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>
                          <PortalActionsMenu
                            open={openActionRow === discharge.name}
                            onClose={() => setOpenActionRow(null)}
                            triggerRef={menuRef}
                            minWidth={200}
                          >
                            {isDraftDischarge(discharge) && discharge.admission && (
                              <button
                                type="button"
                                onClick={() => handleContinueDraft(discharge)}
                                className="block w-full text-left px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50"
                              >
                                Continue discharge
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setDetailRow(discharge)
                                setOpenActionRow(null)
                              }}
                              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              View details
                            </button>
                          </PortalActionsMenu>
                        </div>
                        <PrintFormatDropdown
                          doctype="Discharge"
                          docName={discharge.name}
                          noLetterhead={0}
                          triggerPrint={1}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
          {preferLoadMore ? (
            <LoadMoreControls
              loadedCount={discharges.length}
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
              loading={loading}
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
            />
          )}
        </>
      )}
      </div>

      {detailRow ? (
        <DischargeDetailPanel
          key={detailRow.name}
          name={detailRow.name}
          preview={detailRow}
          onClose={() => setDetailRow(null)}
          onPatientClick={onPatientClick}
          onPrev={goPrev}
          onNext={goNext}
          hasPrev={hasPrev}
          hasNext={hasNext}
          navLabel={navLabel}
        />
      ) : null}
    </div>
  )
}