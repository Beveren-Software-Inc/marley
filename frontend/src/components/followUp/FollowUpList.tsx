import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getFollowUps,
  sendFollowUpReminder,
  sendFollowUpRemindersBulk,
  updateFollowUpStatus,
  getCostCenters,
  type PatientFollowUpRow,
  type ReminderChannel,
} from '../../services/followUp'
import { toast } from '../../hooks/useToast'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { DocDetailView } from '../ui/DocDetailView'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { PaginationControls, DEFAULT_PAGE_SIZE, type PageSize } from '../ui/PaginationControls'
import { useCardFilters } from '../../contexts/CardFilterContext'

const CHANNEL_OPTIONS: { value: ReminderChannel; label: string; icon: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { value: 'sms', label: 'SMS', icon: '📱' },
  { value: 'email', label: 'Email', icon: '📧' },
]

const STATUS_OPTIONS = [
  { value: 'Open', label: 'Open' },
  { value: 'Contacted', label: 'Contacted' },
  { value: 'Completed', label: 'Completed' },
  { value: 'No Follow Up Required', label: 'No Follow Up Required' },
  { value: '', label: 'All' },
]

// Status options available as actions in the dropdown
const STATUS_ACTIONS: { value: string; label: string }[] = [
  { value: 'Open', label: 'Mark as Open' },
  { value: 'Contacted', label: 'Mark as Contacted' },
  { value: 'Completed', label: 'Mark as Completed' },
  { value: 'No Follow Up Required', label: 'No Follow Up Required' },
]

interface FollowUpListProps {
  refreshKey?: number | string
  patient?: string
  onPatientClick?: (patient: string) => void
}

export const FollowUpList = ({ refreshKey, patient, onPatientClick }: FollowUpListProps) => {
  const [list, setList] = useState<PatientFollowUpRow[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string>('Open')
  const [costCenter, setCostCenter] = useState<string>('')
  const [costCenterOptions, setCostCenterOptions] = useState<{ name: string }[]>([])
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sendingBulk, setSendingBulk] = useState(false)
  const [bulkChannelMenuOpen, setBulkChannelMenuOpen] = useState(false)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const cardFilters = useCardFilters()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const isInsideCard = cardFilters !== undefined
  const menuRef = useRef<HTMLDivElement>(null)
  const bulkMenuRef = useRef<HTMLDivElement>(null)

  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  const [totalCount, setTotalCount] = useState(0)

  const loadList = useCallback(async (overridePage?: number) => {
    const currentPage = overridePage ?? page
    setLoading(true)
    try {
      const result = await getFollowUps({
        status: status || undefined,
        cost_center: costCenter || undefined,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
      })
      setList(result.data)
      setTotalCount(result.total_count)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load follow-ups')
      setList([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [status, costCenter, page, pageSize])

  useEffect(() => {
    loadList()
  }, [loadList, refreshKey])

  useEffect(() => {
    getCostCenters().then(setCostCenterOptions).catch(() => setCostCenterOptions([]))
  }, [])

  // Close dropdown when clicking outside (ignore portaled menu and trigger button)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-portal-actions-menu]')) return
      if (el.closest('button[aria-label="Actions"]')) return
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleRemind = async (name: string, channel: ReminderChannel) => {
    setOpenActionRow(null)
    setSendingId(name)
    const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'Email'
    try {
      const result = await sendFollowUpReminder(name, channel)
      if (result.sent) {
        toast.success(`${channelLabel} reminder sent`)
      } else {
        toast.error(result.message || 'Reminder not sent')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to send ${channelLabel} reminder`)
    } finally {
      setSendingId(null)
    }
  }

  const handleStatusChange = async (name: string, newStatus: string) => {
    setOpenActionRow(null)
    setActionLoading(name)
    try {
      await updateFollowUpStatus(name, newStatus)
      toast.success(`Status updated to "${newStatus}"`)
      loadList()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSendAllReminders = async (channel: ReminderChannel) => {
    const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'Email'
    setSendingBulk(true)
    try {
      const result = await sendFollowUpRemindersBulk(status || 'Open', costCenter || undefined, channel)
      toast.success(`${channelLabel} reminders sent: ${result.sent} of ${result.total}`)
      if (result.sent > 0) loadList()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to send ${channelLabel} reminders`)
    } finally {
      setSendingBulk(false)
    }
  }

  const remarksPreview = (r?: string) => {
    if (!r) return '—'
    const plain = r.replace(/<[^>]+>/g, '').trim()
    return plain.length > 50 ? plain.slice(0, 50) + '…' : plain
  }

  return (
    <div className="flex flex-col gap-4 min-h-[400px]">
      {/* Header row */}
      {!isInsideCard && (
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900">Follow Ups</h2>
        <div className="flex items-center gap-2">
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
      </div>
      )}

      {/* Filters + Send all reminders */}
      {showFilters && (
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Status</label>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Cost Center</label>
          <select
            value={costCenter}
            onChange={(e) => { setCostCenter(e.target.value); setPage(1) }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-[160px]"
          >
            <option value="">All</option>
            {costCenterOptions.map((cc) => (
              <option key={cc.name} value={cc.name}>{cc.name}</option>
            ))}
          </select>
        </div>
        <div className="relative" ref={bulkMenuRef}>
          <button
            type="button"
            onClick={() => setBulkChannelMenuOpen((p) => !p)}
            disabled={sendingBulk || list.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {sendingBulk ? 'Sending…' : 'Send all reminders'}
            {!sendingBulk && (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            )}
          </button>
          {bulkChannelMenuOpen && (
            <div className="absolute right-0 z-30 mt-1 w-48 bg-white border border-slate-200 rounded-md shadow-lg py-1">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                Choose Channel
              </div>
              {CHANNEL_OPTIONS.map((ch) => (
                <button
                  key={ch.value}
                  type="button"
                  onClick={() => { setBulkChannelMenuOpen(false); handleSendAllReminders(ch.value) }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <span>{ch.icon}</span> {ch.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* List */}
      <div className="border border-slate-200 rounded-lg bg-white">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading follow-ups…</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No follow-ups match the filters.</div>
        ) : (
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full divide-y divide-slate-200 text-sm min-h-[300px]">
              <thead className="bg-slate-50">
                <tr>
                  {!patient && (
                    <th className="px-4 py-2 text-left font-medium text-slate-700">Patient</th>
                  )}
                  <th className="px-4 py-2 text-left font-medium text-slate-700">Type</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">Follow Up Date</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">Status</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">Cost Center</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">Remarks</th>
                  <th className="px-4 py-2 text-right font-medium text-slate-700 w-[80px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {list.map((row) => (
                  <tr key={row.name} className="hover:bg-slate-50">
                    {!patient && (
                      <td
                        className="px-4 py-2 cursor-pointer"
                        onClick={() => row.patient && onPatientClick?.(row.patient)}
                      >
                        <span className="font-medium text-primary hover:underline">{row.patient_name || row.patient}</span>
                      </td>
                    )}
                    <td className="px-4 py-2 text-slate-600">{row.follow_up_type}</td>
                    <td className="px-4 py-2 text-slate-600">{row.follow_up_date}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        row.status === 'Open' ? 'bg-amber-100 text-amber-800' :
                        row.status === 'Contacted' ? 'bg-blue-100 text-blue-800' :
                        row.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{row.cost_center || '—'}</td>
                    <td className="px-4 py-2 text-slate-600 max-w-[200px] truncate" title={row.remarks || ''}>
                      {remarksPreview(row.remarks)}
                    </td>

                    {/* ── Actions dropdown ── */}
                    <td className="px-4 py-2 text-right">
                      <div
                        className="relative inline-block"
                        ref={openActionRow === row.name ? menuRef : undefined}
                      >
                        <button
                          type="button"
                          onClick={() => setOpenActionRow((prev) => (prev === row.name ? null : row.name))}
                          disabled={actionLoading === row.name || sendingId === row.name}
                          className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          aria-label="Actions"
                        >
                          {actionLoading === row.name || sendingId === row.name ? (
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
                          open={openActionRow === row.name}
                          onClose={() => setOpenActionRow(null)}
                          triggerRef={menuRef}
                          placement="above-right"
                          minWidth={200}
                        >
                          {/* Send Reminder channel options */}
                          <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                            Send Reminder
                          </div>
                          {CHANNEL_OPTIONS.map((ch) => (
                            <button
                              key={ch.value}
                              type="button"
                              onClick={() => handleRemind(row.name, ch.value)}
                              disabled={sendingId === row.name}
                              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2"
                            >
                              <span>{ch.icon}</span> {ch.label}
                            </button>
                          ))}
                          <div className="border-t border-slate-100 my-1" />
                          {STATUS_ACTIONS.filter((a) => a.value !== row.status).map((action) => (
                            <button
                              key={action.value}
                              type="button"
                              onClick={() => handleStatusChange(row.name, action.value)}
                              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              {action.label}
                            </button>
                          ))}
                        </PortalActionsMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PaginationControls
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        loading={loading}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
      />

      {detailName && (
        <DetailSlideOver
          title="Patient Follow Up"
          subtitle={detailName}
          onClose={() => setDetailName(null)}
        >
          <DocDetailView doctype="Patient Follow Up" name={detailName} />
        </DetailSlideOver>
      )}
    </div>
  )
}