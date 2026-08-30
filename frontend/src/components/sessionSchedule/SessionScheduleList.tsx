import { useState, useEffect, useRef } from 'react'
import {
  createSessionScheduleSalesOrder,
  fetchSessionSchedules,
  updateSessionScheduleStatus,
  type SessionSchedule,
} from '../../services/sessionSchedule'
import { StatusPill } from '../ui/StatusPill'
import { toast } from '../../hooks/useToast'
import { useCardFilters } from '../../contexts/CardFilterContext'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { DateFilterInput } from '../ui/DateFilterInput'
import { PaginationControls, DEFAULT_PAGE_SIZE, type PageSize } from '../ui/PaginationControls'
import { fetchHealthcarePractitioners, getCurrentUserPractitionerOption, type LinkFieldOption } from '../../services/common'
import { SessionScheduleDetailPanel } from './SessionScheduleDetailPanel'
import { CreateSessionScheduleModal } from './CreateSessionScheduleModal'
import { useCareContext } from '../../providers/CareContextProvider'

interface SessionScheduleListProps {
  refreshKey?: string | number
  patient?: string
  admissionNumber?: string
  onAddSessionSchedule?: () => void
  embedded?: boolean
  /** Filter sessions to practitioners in this Medical Role group (plus unassigned). */
  roleGroup?: string
}

const statusColors: Record<string, string> = {
  Draft: 'warning',
  'In Progress': 'info',
  Completed: 'success',
  Submitted: 'success',
  Cancelled: 'danger',
}

const SESSION_STATUS_FILTER_OPTIONS = [
  'Draft',
  'In Progress',
  'Completed',
  'Submitted',
  'Cancelled',
] as const

function formatAmount(value?: number): string {
  if (value == null || Number.isNaN(value)) return '—'
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export const SessionScheduleList = ({ refreshKey, patient, admissionNumber, embedded, roleGroup }: SessionScheduleListProps) => {
  const { guardClinicalEdit } = useCareContext()
  const [schedules, setSchedules] = useState<SessionSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null)
  const [detailSchedule, setDetailSchedule] = useState<SessionSchedule | null>(null)
  const [editSchedule, setEditSchedule] = useState<SessionSchedule | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const cardFilters = useCardFilters()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const isInsideCard = cardFilters !== undefined
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  const [filterPractitioner, setFilterPractitioner] = useState('')
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerInitDone, setPractitionerInitDone] = useState(false)
  const defaultPractitionerRef = useRef<LinkFieldOption | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  const [totalCount, setTotalCount] = useState(0)

  const loadSchedules = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetchSessionSchedules(
        pageSize,
        (page - 1) * pageSize,
        patient,
        admissionNumber,
        roleGroup,
        filterPractitioner || undefined
      )
      setSchedules(response.data)
      setTotalCount(response.total_count)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch session schedules'))
      toast.error('Failed to load session schedules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    getCurrentUserPractitionerOption()
      .then((opt) => {
        if (cancelled || !opt) return
        defaultPractitionerRef.current = opt
        setPractitionerOptions((prev) => (prev.some((p) => p.name === opt.name) ? prev : [opt, ...prev]))
        setFilterPractitioner(opt.name)
        setPractitionerQuery(opt.label || opt.name)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPractitionerInitDone(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!practitionerInitDone) return
    loadSchedules()
  }, [refreshKey, patient, admissionNumber, refreshTrigger, roleGroup, filterPractitioner, page, pageSize, practitionerInitDone])

  useEffect(() => {
    setPage(1)
  }, [patient, admissionNumber, roleGroup, filterPractitioner, filterStatus, filterDateFrom, filterDateTo])

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
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-ss-practitioner-filter]')) return
      setPractitionerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-portal-actions-menu]')) return
      if (el.closest('button[aria-label="Actions"]')) return
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = schedules.filter((schedule) => {
    if (filterStatus && schedule.transaction_status !== filterStatus) return false
    if (filterDateFrom && schedule.date && schedule.date < filterDateFrom) return false
    if (filterDateTo && schedule.date && schedule.date > filterDateTo) return false
    return true
  })

  const getStatusColor = (status?: string): string => {
    if (!status) return 'default'
    return statusColors[status] || 'default'
  }

  const formatDateTime = (date?: string, time?: string): string => {
    if (!date) return '—'
    const dateStr = new Date(date).toLocaleDateString('en-GB')
    return time ? `${dateStr} ${time}` : dateStr
  }

  const formatTimeRange = (fromTime?: string, toTime?: string): string => {
    if (!fromTime && !toTime) return '—'
    if (fromTime && toTime) return `${fromTime} - ${toTime}`
    return fromTime || toTime || '—'
  }

  const canBill = (schedule: SessionSchedule): boolean =>
    Boolean(
      schedule.session_type &&
      (schedule.patient_num || schedule.admission_number || schedule.patient_visit) &&
      !schedule.sales_order &&
      schedule.transaction_status !== 'Cancelled',
    )

  const billDisabledReason = (schedule: SessionSchedule): string | undefined => {
    if (schedule.sales_order) return undefined
    if (schedule.transaction_status === 'Cancelled') return 'Cancelled sessions cannot be billed'
    if (!schedule.session_type) return 'Select a service template before billing'
    if (!schedule.patient_num && !schedule.admission_number && !schedule.patient_visit) {
      return 'Select a patient (visit/admission optional) before billing'
    }
    return undefined
  }

  const isRowBusy = (schedule: SessionSchedule) =>
    actionLoading === schedule.name || statusLoadingId === schedule.name

  const handleView = (schedule: SessionSchedule) => {
    setDetailSchedule(schedule)
    setOpenActionRow(null)
  }

  const canEditSchedule = (schedule: SessionSchedule) => {
    const status = schedule.transaction_status || ''
    return status !== 'Cancelled' && status !== 'Submitted'
  }

  const handleEdit = (schedule: SessionSchedule) => {
    guardClinicalEdit(() => {
      setDetailSchedule(null)
      setEditSchedule(schedule)
      setOpenActionRow(null)
    })
  }

  const handleOpenBill = (salesOrder: string) => {
    setOpenActionRow(null)
    window.open(`/app/sales-order/${encodeURIComponent(salesOrder)}`, '_blank')
  }

  const handleBill = async (schedule: SessionSchedule) => {
    setActionLoading(schedule.name)
    try {
      const res = await createSessionScheduleSalesOrder(schedule.name)
      toast.success(
        res.existing
          ? `Already billed — ${res.sales_order}`
          : `Billed — ${res.sales_order}`,
      )
      setOpenActionRow(null)
      setRefreshTrigger((k) => k + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to bill session')
    } finally {
      setActionLoading(null)
    }
  }

  const handleStatusUpdate = async (schedule: SessionSchedule, status: string) => {
    setStatusLoadingId(schedule.name)
    try {
      await updateSessionScheduleStatus(schedule.name, status)
      toast.success(`Status updated to ${status}`)
      setOpenActionRow(null)
      setRefreshTrigger((k) => k + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setStatusLoadingId(null)
    }
  }

  const clearFilters = () => {
    setFilterStatus('')
    setFilterDateFrom('')
    setFilterDateTo('')
    const def = defaultPractitionerRef.current
    if (def) {
      setFilterPractitioner(def.name)
      setPractitionerQuery(def.label || def.name)
    } else {
      setFilterPractitioner('')
      setPractitionerQuery('')
    }
    setPractitionerOpen(false)
  }

  const hasActiveFilters = filterStatus || filterDateFrom || filterDateTo || filterPractitioner

  const selectedPractitionerLabel =
    practitionerOptions.find((o) => o.name === filterPractitioner)?.label ||
    practitionerQuery ||
    filterPractitioner ||
    ''

  if (loading && schedules.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-slate-600">
        Loading session schedules...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Session Schedules</h3>
          <p className="text-red-700 text-sm">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      {!isInsideCard && !embedded && (
        <div className="flex items-center justify-between gap-2 mb-3 flex-shrink-0">
          <h2 className="text-xl font-semibold text-slate-900">Session Schedules</h2>
          <button
            type="button"
            onClick={() => setShowFiltersInternal((prev) => !prev)}
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
        <div className="card-filter-bar mb-3 space-y-2 flex-shrink-0">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">From Date</label>
              <DateFilterInput
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">To Date</label>
              <DateFilterInput
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex flex-col gap-1 relative" data-ss-practitioner-filter>
              <label className="text-xs font-medium text-slate-500">Practitioner</label>
              <input
                type="text"
                value={practitionerOpen ? practitionerQuery : selectedPractitionerLabel}
                onChange={(e) => {
                  setPractitionerQuery(e.target.value)
                  setFilterPractitioner('')
                  setPractitionerOpen(true)
                }}
                onFocus={() => setPractitionerOpen(true)}
                placeholder="Search practitioner…"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-[180px]"
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
                          setFilterPractitioner(opt.name)
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
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select All</option>
                {SESSION_STATUS_FILTER_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            {hasActiveFilters ? <ClearFiltersButton onClick={clearFilters} /> : null}
          </div>
          <p className="text-xs text-slate-500">
            Showing {filtered.length} of {totalCount} session schedule{totalCount !== 1 ? 's' : ''}
            {hasActiveFilters && ' (filtered)'}
          </p>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-slate-500">
          {schedules.length === 0 ? 'NO SESSION SCHEDULES FOUND' : 'NO SESSION SCHEDULES MATCH THE CURRENT FILTERS'}
        </div>
      ) : (
        <div className="flex-1 min-h-0 min-w-full overflow-auto">
          <table className="w-full min-w-[1100px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Session ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Session Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Service Template</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Time Range</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Branch</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Doctor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Practitioner</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[160px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((schedule) => (
                <tr
                  key={schedule.name}
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => handleView(schedule)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-primary hover:underline">
                    {schedule.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {schedule.session_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{schedule.session_type || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 text-right tabular-nums">
                    {formatAmount(schedule.amount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatDateTime(schedule.date)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {formatTimeRange(schedule.from_time, schedule.to_time)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{schedule.cost_center || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{schedule.doctor_name || schedule.doctor || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {schedule.practitioner_name || schedule.practitioner || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {schedule.transaction_status ? (
                      <StatusPill
                        status={schedule.transaction_status}
                        color={getStatusColor(schedule.transaction_status)}
                      />
                    ) : (
                      <span className="text-sm text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      {canEditSchedule(schedule) ? (
                        <button
                          type="button"
                          onClick={() => handleEdit(schedule)}
                          disabled={isRowBusy(schedule)}
                          className="inline-flex items-center rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        >
                          Edit
                        </button>
                      ) : null}
                      <div className="relative" ref={openActionRow === schedule.name ? menuRef : undefined}>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenActionRow((prev) => (prev === schedule.name ? null : schedule.name))
                          }
                          disabled={isRowBusy(schedule)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          aria-label="Actions"
                        >
                          {isRowBusy(schedule) ? (
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
                          open={openActionRow === schedule.name}
                          onClose={() => setOpenActionRow(null)}
                          triggerRef={menuRef}
                          minWidth={200}
                        >
                          <button
                            type="button"
                            onClick={() => handleView(schedule)}
                            className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            View
                          </button>
                          {canEditSchedule(schedule) ? (
                            <button
                              type="button"
                              onClick={() => handleEdit(schedule)}
                              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              Edit
                            </button>
                          ) : null}
                          {schedule.transaction_status === 'Draft' && (
                            <button
                              type="button"
                              disabled={isRowBusy(schedule)}
                              onClick={() => handleStatusUpdate(schedule, 'In Progress')}
                              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                            >
                              In Progress
                            </button>
                          )}
                          {(schedule.transaction_status === 'Draft' ||
                            schedule.transaction_status === 'In Progress') && (
                            <button
                              type="button"
                              disabled={isRowBusy(schedule)}
                              onClick={() => handleStatusUpdate(schedule, 'Completed')}
                              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                            >
                              Complete
                            </button>
                          )}
                          {schedule.sales_order ? (
                            <button
                              type="button"
                              onClick={() => handleOpenBill(schedule.sales_order!)}
                              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              View Bill
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={!canBill(schedule) || isRowBusy(schedule)}
                              title={billDisabledReason(schedule)}
                              onClick={() => handleBill(schedule)}
                              className="block w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Bill
                            </button>
                          )}
                          {schedule.transaction_status !== 'Cancelled' &&
                            schedule.transaction_status !== 'Submitted' && (
                              <button
                                type="button"
                                disabled={isRowBusy(schedule)}
                                onClick={() => handleStatusUpdate(schedule, 'Cancelled')}
                                className="block w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40"
                              >
                                Cancel
                              </button>
                            )}
                        </PortalActionsMenu>
                      </div>
                      <PrintFormatDropdown
                        doctype="Session Schedule"
                        docName={schedule.name}
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
      )}
      <PaginationControls
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        loading={loading}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
      />

      {detailSchedule ? (
        <SessionScheduleDetailPanel
          name={detailSchedule.name}
          preview={detailSchedule}
          onClose={() => setDetailSchedule(null)}
          onEdit={canEditSchedule(detailSchedule) ? () => handleEdit(detailSchedule) : undefined}
        />
      ) : null}

      {editSchedule ? (
        <CreateSessionScheduleModal
          editName={editSchedule.name}
          initialRecord={editSchedule}
          onClose={() => setEditSchedule(null)}
          onSuccess={() => {
            setEditSchedule(null)
            setRefreshTrigger((k) => k + 1)
          }}
        />
      ) : null}
    </div>
  )
}
