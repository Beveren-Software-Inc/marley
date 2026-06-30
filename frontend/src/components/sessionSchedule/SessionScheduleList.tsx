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

interface SessionScheduleListProps {
  refreshKey?: string | number
  patient?: string
  admissionNumber?: string
  onAddSessionSchedule?: () => void
  embedded?: boolean
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

export const SessionScheduleList = ({ refreshKey, patient, admissionNumber, embedded }: SessionScheduleListProps) => {
  const [schedules, setSchedules] = useState<SessionSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const cardFilters = useCardFilters()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const isInsideCard = cardFilters !== undefined
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')

  const loadSchedules = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetchSessionSchedules(50, 0, patient, admissionNumber)
      setSchedules(response)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch session schedules'))
      toast.error('Failed to load session schedules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSchedules()
  }, [refreshKey, patient, admissionNumber, refreshTrigger])

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
    const dateStr = new Date(date).toLocaleDateString()
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
      schedule.admission_number &&
      !schedule.sales_order &&
      schedule.transaction_status !== 'Cancelled',
    )

  const isRowBusy = (schedule: SessionSchedule) =>
    actionLoading === schedule.name || statusLoadingId === schedule.name

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
  }

  const hasActiveFilters = filterStatus || filterDateFrom || filterDateTo

  if (loading) {
    return <div className="flex items-center justify-center p-8 text-slate-600">Loading session schedules...</div>
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Session Schedules</h3>
          <p className="text-red-700 text-sm">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {!isInsideCard && !embedded && (
        <div className="flex items-center justify-between gap-2 mb-3">
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
        <div className="mb-3 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">From</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">To</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">All statuses</option>
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
            Showing {filtered.length} of {schedules.length} session schedule{schedules.length !== 1 ? 's' : ''}
            {hasActiveFilters && ' (filtered)'}
          </p>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex items-center justify-center p-8 text-slate-500">
          {schedules.length === 0 ? 'No session schedules found' : 'No session schedules match the current filters'}
        </div>
      ) : (
        <div className="min-w-full overflow-x-auto">
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((schedule) => (
                <tr key={schedule.name} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-primary">{schedule.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{schedule.session_name || '—'}</td>
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
                  <td className="px-4 py-2 align-middle">
                    <div className="flex items-center gap-1.5">
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
                              title={
                                !canBill(schedule)
                                  ? 'Link an admission and service template before billing'
                                  : undefined
                              }
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
    </>
  )
}
