import { useState, useEffect, useRef, useCallback } from 'react'
import {
  fetchObservations,
  createObservationSalesOrder,
  type Observation,
} from '../../services/observations'
import { fetchObservationLevels, fetchHealthcarePractitioners, getCurrentUserPractitionerOption, type LinkFieldOption } from '../../services/common'
import { useCareContext } from '../../providers/CareContextProvider'
import { isDoctorRole } from '../../config/permissions'
import { toast } from '../../hooks/useToast'
import { useCardFilters, usePreferCardLoadMore } from '../../contexts/CardFilterContext'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { LoadMoreControls, DEFAULT_PAGE_SIZE } from '../ui/PaginationControls'
import { ObservationDetailPanel } from './ObservationDetailPanel'
import { ScheduleObservationDischargeModal } from './ScheduleObservationDischargeModal'
import { isObservationActive } from './observationDisplayUtils'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { DateFilterInput } from '../ui/DateFilterInput'

interface ObservationListProps {
  patient?: string
  refreshKey?: number | string
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
    aria-label={active ? 'Hide filters' : 'Show filters'}
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

export const ObservationList = ({ patient, refreshKey, onPatientClick }: ObservationListProps) => {
  const cardFilters = useCardFilters()
  const preferLoadMore = usePreferCardLoadMore()
  const inDashboardCard = cardFilters !== undefined
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = inDashboardCard ? cardFilters : showFiltersInternal

  const [observations, setObservations] = useState<Observation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [detailPreview, setDetailPreview] = useState<Observation | undefined>(undefined)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [dischargeTarget, setDischargeTarget] = useState<Observation | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)
  const levelFilterRef = useRef<HTMLDivElement>(null)

  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = DEFAULT_PAGE_SIZE

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [observationLevelFilter, setObservationLevelFilter] = useState('')
  const [observationLevelOptions, setObservationLevelOptions] = useState<LinkFieldOption[]>([])
  const [observationLevelOpen, setObservationLevelOpen] = useState(false)
  const [observationLevelQuery, setObservationLevelQuery] = useState('')

  const [doctorFilter, setDoctorFilter] = useState('')
  const [doctorOptions, setDoctorOptions] = useState<LinkFieldOption[]>([])
  const [doctorOpen, setDoctorOpen] = useState(false)
  const [doctorQuery, setDoctorQuery] = useState('')
  const doctorFilterRef = useRef<HTMLDivElement>(null)

  // Doctors get the filter pre-applied to their own records; other roles start unfiltered.
  const { userRole } = useCareContext()
  const doctorDefaultApplied = useRef(false)
  useEffect(() => {
    if (doctorDefaultApplied.current) return
    if (!isDoctorRole(userRole)) return
    doctorDefaultApplied.current = true
    let cancelled = false
    getCurrentUserPractitionerOption()
      .then((opt) => {
        if (cancelled || !opt) return
        setDoctorOptions((prev) => (prev.some((p) => p.name === opt.name) ? prev : [opt, ...prev]))
        setDoctorFilter(opt.name)
        setDoctorQuery(opt.label || opt.name)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [userRole])

  const hasActiveFilters = Boolean(dateFrom || dateTo || observationLevelFilter || doctorFilter)

  useEffect(() => {
    setPage(1)
  }, [patient, observationLevelFilter, doctorFilter, dateFrom, dateTo, refreshKey])

  const loadObservations = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      // One From/To range filters on both Start Date and DC Date (backend ORs the two).
      const offset = (page - 1) * pageSize
      const response = await fetchObservations(pageSize, offset, patient, {
        observationLevel: observationLevelFilter || undefined,
        practitioner: doctorFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })
      setObservations((prev) => (page > 1 ? [...prev, ...response] : response))
      const loadedCount = offset + response.length
      // API returns an array only (no total_count) — treat a full page as "has more".
      const hasMore = response.length === pageSize
      setTotalCount(hasMore ? loadedCount + pageSize : loadedCount)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch observations'))
      if (page <= 1) setObservations([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [patient, observationLevelFilter, doctorFilter, dateFrom, dateTo, page, pageSize, refreshKey])

  useEffect(() => {
    loadObservations()
  }, [loadObservations])

  const showLoadMore = preferLoadMore || observations.length < totalCount

  const reloadObservations = () => {
    if (page === 1) {
      void loadObservations()
    } else {
      setPage(1)
    }
  }

  useEffect(() => {
    if (!observationLevelOpen) return
    const t = setTimeout(async () => {
      try {
        const opts = await fetchObservationLevels(observationLevelQuery || undefined)
        setObservationLevelOptions(opts)
      } catch {
        setObservationLevelOptions([])
      }
    }, observationLevelQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [observationLevelQuery, observationLevelOpen])

  // Doctor filter — debounced practitioner search when the dropdown is open
  useEffect(() => {
    if (!doctorOpen) return
    const t = setTimeout(async () => {
      try {
        const opts = await fetchHealthcarePractitioners(doctorQuery || undefined)
        setDoctorOptions(opts)
      } catch {
        setDoctorOptions([])
      }
    }, doctorQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [doctorQuery, doctorOpen])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-portal-actions-menu]')) return
      if (el.closest('button[aria-label="Actions"]')) return
      if (levelFilterRef.current?.contains(el)) return
      if (doctorFilterRef.current?.contains(el)) return
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
      setObservationLevelOpen(false)
      setDoctorOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
    setObservationLevelFilter('')
    setObservationLevelQuery('')
    setObservationLevelOpen(false)
    setDoctorFilter('')
    setDoctorQuery('')
    setDoctorOpen(false)
  }

  const handleOpenSalesOrder = (soName: string) => {
    setOpenActionRow(null)
    window.open(`/app/sales-order/${encodeURIComponent(soName)}`, '_blank')
  }

  const handleCreateSalesOrder = async (row: Observation) => {
    setActionLoading(row.name)
    try {
      const res = await createObservationSalesOrder(row.name)
      toast.success(
        res.existing
          ? `Sales Order ${res.sales_order} already linked`
          : `Sales Order ${res.sales_order} created (Draft)`,
      )
      setOpenActionRow(null)
      reloadObservations()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create Service Bill')
    } finally {
      setActionLoading(null)
    }
  }

  const canBillObservation = (obs: Observation): boolean =>
    !!(
      obs.observation_level &&
      (obs.admission_no || (obs.reference_doctype === 'Patient Visit' && obs.reference_docname))
    )

  const getResultDisplay = (obs: Observation): string => {
    if (obs.result_text) return obs.result_text
    if (obs.result_float !== undefined && obs.result_float !== null) return obs.result_float.toString()
    if (obs.result_select) return obs.result_select
    if (obs.result_boolean !== undefined && obs.result_boolean !== null) return obs.result_boolean ? 'Yes' : 'No'
    if (obs.result_datetime) return new Date(obs.result_datetime).toLocaleString('en-GB')
    if (obs.result_time) return obs.result_time
    if (obs.result_data) return obs.result_data
    return '-'
  }

  const selectedLevelLabel =
    observationLevelOptions.find((o) => o.name === observationLevelFilter)?.label ||
    observationLevelQuery ||
    observationLevelFilter

  const filterBar = showFilters ? (
    <div className="card-filter-bar flex flex-wrap items-end gap-3 mb-3 px-1 py-2 border-b border-slate-100 bg-slate-50/80 rounded-md shrink-0">
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
      <div ref={levelFilterRef} className="flex flex-col gap-1 min-w-[200px]">
        <label className="text-xs font-medium text-slate-500">Observation level</label>
        <div className="relative">
          <input
            type="text"
            value={observationLevelFilter ? selectedLevelLabel : observationLevelQuery}
            onChange={(e) => {
              setObservationLevelQuery(e.target.value)
              setObservationLevelFilter('')
              setObservationLevelOpen(true)
            }}
            onFocus={() => setObservationLevelOpen(true)}
            placeholder="Search level…"
            className={`w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary ${
              observationLevelFilter ? 'pr-8' : ''
            }`}
          />
          {observationLevelFilter && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Clear observation level filter"
              onClick={() => {
                setObservationLevelFilter('')
                setObservationLevelQuery('')
                setObservationLevelOpen(false)
              }}
            >
              ×
            </button>
          )}
          {observationLevelOpen && observationLevelOptions.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto top-full">
              {observationLevelOptions.map((level) => (
                <button
                  key={level.name}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                  onClick={() => {
                    setObservationLevelFilter(level.name)
                    setObservationLevelQuery(level.label || level.name)
                    setObservationLevelOpen(false)
                  }}
                >
                  {level.label || level.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div ref={doctorFilterRef} className="flex flex-col gap-1 min-w-[200px]">
        <label className="text-xs font-medium text-slate-500">Doctor</label>
        <div className="relative">
          <input
            type="text"
            value={
              doctorFilter
                ? doctorOptions.find((p) => p.name === doctorFilter)?.label || doctorQuery || doctorFilter
                : doctorQuery
            }
            onChange={(e) => {
              setDoctorQuery(e.target.value)
              setDoctorFilter('')
              setDoctorOpen(true)
            }}
            onFocus={() => setDoctorOpen(true)}
            placeholder="Search doctor…"
            className={`w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary ${
              doctorFilter ? 'pr-8' : ''
            }`}
          />
          {doctorFilter && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Clear doctor filter"
              onClick={() => {
                setDoctorFilter('')
                setDoctorQuery('')
                setDoctorOpen(false)
              }}
            >
              ×
            </button>
          )}
          {doctorOpen && doctorOptions.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto top-full">
              {doctorOptions.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                  onClick={() => {
                    setDoctorFilter(p.name)
                    setDoctorQuery(p.label || p.name)
                    setDoctorOpen(false)
                  }}
                >
                  {p.label || p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <ClearFiltersButton onClick={clearFilters} disabled={!hasActiveFilters} className="!ml-0" />
    </div>
  ) : null

  const tableBlock =
    loading && observations.length === 0 ? (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading observations...</div>
      </div>
    ) : error && observations.length === 0 ? (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Observations</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    ) : observations.length === 0 ? (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">NO OBSERVATION FOUND</div>
      </div>
    ) : (
      <div className={inDashboardCard ? '' : 'bg-white border border-slate-200 rounded-lg overflow-hidden'}>
        {!inDashboardCard && (
          <p className="sm:hidden border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
            Swipe horizontally to see all columns
          </p>
        )}
        <div
          className={inDashboardCard ? '' : 'overflow-x-auto overscroll-x-contain'}
          style={inDashboardCard ? undefined : { WebkitOverflowScrolling: 'touch' }}
        >
          <table className="w-full min-w-[72rem]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Observation Level
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Start Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  DC Date
                </th>
                {!patient && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Patient Name
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Care Context
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Frequency
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Result
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Doctor Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[140px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {observations.map((obs) => {
                const active = isObservationActive(obs)
                return (
                  <tr
                    key={obs.name}
                    onClick={() => {
                      setDetailPreview(obs)
                      setDetailName(obs.name)
                    }}
                    className={`cursor-pointer ${
                      active
                        ? 'bg-green-100 hover:bg-green-200 ring-2 ring-inset ring-emerald-500/80'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {obs.observation_level || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {obs.start_date ? new Date(obs.start_date).toLocaleDateString('en-GB') : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {obs.dc_date ? (
                        new Date(obs.dc_date).toLocaleDateString('en-GB')
                      ) : isObservationActive(obs) ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-600 bg-white px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                          Active
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    {!patient && (
                      <td
                        className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (obs.patient) onPatientClick?.(obs.patient)
                        }}
                      >
                        <span className="font-medium text-primary hover:underline">
                          {obs.patient_name || obs.patient || '-'}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                      {obs.admission_no
                        ? `IP · ${obs.admission_no}`
                        : obs.reference_doctype === 'Patient Visit' && obs.reference_docname
                          ? `OP · ${obs.reference_docname}`
                          : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {obs.duration || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {getResultDisplay(obs)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {obs.practitioner_name || obs.healthcare_practitioner || '-'}
                    </td>
                    <td className="px-4 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <div className="relative inline-block" ref={openActionRow === obs.name ? actionMenuRef : undefined}>
                          <button
                            type="button"
                            onClick={() => setOpenActionRow((prev) => (prev === obs.name ? null : obs.name))}
                            disabled={actionLoading === obs.name}
                            className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            aria-label="Actions"
                          >
                            {actionLoading === obs.name ? (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                              </svg>
                            )}
                          </button>
                          <PortalActionsMenu
                            open={openActionRow === obs.name}
                            onClose={() => setOpenActionRow(null)}
                            triggerRef={actionMenuRef}
                            minWidth={200}
                          >
                            {isObservationActive(obs) ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionRow(null)
                                  setDischargeTarget(obs)
                                }}
                                className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                              >
                                Schedule discharge
                              </button>
                            ) : null}
                            {obs.order_created ? (
                              <button
                                type="button"
                                onClick={() => handleOpenSalesOrder(obs.order_created!)}
                                className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                              >
                                Open Sales Order
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={!canBillObservation(obs)}
                                title={
                                  !canBillObservation(obs)
                                    ? !obs.observation_level
                                      ? 'Select an Observation Level (billable) on the observation before creating a Service Bill'
                                      : 'Link an admission (IP) or visit (OP) before creating a Service Bill'
                                    : undefined
                                }
                                onClick={() => handleCreateSalesOrder(obs)}
                                className="block w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Create Service Bill
                              </button>
                            )}
                          </PortalActionsMenu>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )

  const loadMoreBlock =
    showLoadMore && !error ? (
      <LoadMoreControls
        loadedCount={observations.length}
        totalCount={totalCount}
        pageSize={pageSize}
        loading={loading}
        onLoadMore={() => setPage((p) => p + 1)}
      />
    ) : null

  const modals = (
    <>
      {detailName ? (
        <ObservationDetailPanel
          name={detailName}
          preview={detailPreview}
          onClose={() => {
            setDetailName(null)
            setDetailPreview(undefined)
          }}
          onPatientClick={onPatientClick}
        />
      ) : null}

      {dischargeTarget ? (
        <ScheduleObservationDischargeModal
          observation={dischargeTarget}
          onClose={() => setDischargeTarget(null)}
          onSuccess={reloadObservations}
        />
      ) : null}
    </>
  )

  if (inDashboardCard) {
    return (
      <>
        <div className="flex h-full min-h-0 flex-col">
          {filterBar}
          <div
            className="min-h-0 flex-1 overflow-auto"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {tableBlock}
          </div>
          {loadMoreBlock}
        </div>
        {modals}
      </>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-xl font-semibold text-slate-900">Observation Level</h2>
        <FilterToggleButton
          active={Boolean(showFilters)}
          onClick={() => setShowFiltersInternal((prev) => !prev)}
        />
      </div>

      {filterBar}
      {tableBlock}
      {loadMoreBlock}
      {modals}
    </>
  )
}
