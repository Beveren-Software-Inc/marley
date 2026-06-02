import { useState, useEffect } from 'react'
import {
  fetchSessionSchedules,
  type SessionSchedule
} from '../../services/sessionSchedule'
import { StatusPill } from '../ui/StatusPill'
import { toast } from '../../hooks/useToast'
import { useCardFilters } from '../../contexts/CardFilterContext'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'

interface SessionScheduleListProps {
  refreshKey?: string | number
  patient?: string
  admissionNumber?: string
  onAddSessionSchedule?: () => void
}

const statusColors: Record<string, string> = {
  'Draft': 'warning',
  'Submitted': 'success',
  'Cancelled': 'danger',
}

export const SessionScheduleList = ({ refreshKey, patient, admissionNumber }: SessionScheduleListProps) => {
  const [schedules, setSchedules] = useState<SessionSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refreshTrigger, _setRefreshTrigger] = useState(0)

  // Filters
  const cardFilters = useCardFilters()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const isInsideCard = cardFilters !== undefined
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')

  useEffect(() => {
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
    loadSchedules()
  }, [refreshKey, patient, admissionNumber, refreshTrigger])

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
    if (!date) return '-'
    const dateStr = new Date(date).toLocaleDateString()
    return time ? `${dateStr} ${time}` : dateStr
  }

  const formatTimeRange = (fromTime?: string, toTime?: string): string => {
    if (!fromTime && !toTime) return '-'
    if (fromTime && toTime) return `${fromTime} - ${toTime}`
    return fromTime || toTime || '-'
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
      {/* Header row */}
      {!isInsideCard && (
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-xl font-semibold text-slate-900">Session Schedules</h2>
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

      {/* ── Filters bar ── */}
      {showFilters && (
      <div className="mb-3 space-y-2">
        {/* Top row: filters */}
        <div className="flex flex-wrap items-end gap-2">
          {/* Date From */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">From</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {/* Date To */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">To</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {/* Status */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All statuses</option>
              <option value="Draft">Draft</option>
              <option value="Submitted">Submitted</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          {/* Clear */}
          {hasActiveFilters ? <ClearFiltersButton onClick={clearFilters} /> : null}
        </div>

        {/* Result count */}
        <p className="text-xs text-slate-500">
          Showing {filtered.length} of {schedules.length} session schedule{schedules.length !== 1 ? 's' : ''}
          {hasActiveFilters && ' (filtered)'}
        </p>
      </div>
      )}

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center p-8 text-slate-500">
          {schedules.length === 0 ? 'No session schedules found' : 'No session schedules match the current filters'}
        </div>
      ) : (
        <div className="min-w-full">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Session ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Session Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Session Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Time Range</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Cost Center</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Doctor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((schedule) => (
                <tr key={schedule.name} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-primary cursor-pointer hover:underline">
                    {schedule.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{schedule.session_name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{schedule.session_type || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {formatDateTime(schedule.date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {formatTimeRange(schedule.from_time, schedule.to_time)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{schedule.cost_center || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{schedule.doctor_name || schedule.doctor || '-'}</td>
                  <td className="px-4 py-3">
                    {schedule.transaction_status
                      ? <StatusPill status={schedule.transaction_status} color={getStatusColor(schedule.transaction_status)} />
                      : <span className="text-sm text-slate-500">-</span>}
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
