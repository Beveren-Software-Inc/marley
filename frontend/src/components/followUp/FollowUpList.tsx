import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getFollowUps,
  sendFollowUpReminder,
  sendFollowUpRemindersBulk,
  updateFollowUpStatus,
  getCostCenters,
  type PatientFollowUpRow,
} from '../../services/followUp'
import { toast } from '../../hooks/useToast'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { DocDetailView } from '../ui/DocDetailView'

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
}

export const FollowUpList = ({ refreshKey }: FollowUpListProps) => {
  const [list, setList] = useState<PatientFollowUpRow[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string>('Open')
  const [costCenter, setCostCenter] = useState<string>('')
  const [costCenterOptions, setCostCenterOptions] = useState<{ name: string }[]>([])
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sendingBulk, setSendingBulk] = useState(false)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getFollowUps({
        status: status || undefined,
        cost_center: costCenter || undefined,
        limit: 200,
      })
      setList(rows)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load follow-ups')
      setList([])
    } finally {
      setLoading(false)
    }
  }, [status, costCenter])

  useEffect(() => {
    loadList()
  }, [loadList, refreshKey])

  useEffect(() => {
    getCostCenters().then(setCostCenterOptions).catch(() => setCostCenterOptions([]))
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleRemind = async (name: string) => {
    setOpenActionRow(null)
    setSendingId(name)
    try {
      const result = await sendFollowUpReminder(name)
      if (result.sent) {
        toast.success('WhatsApp reminder sent')
      } else {
        toast.error(result.message || 'Reminder not sent')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send reminder')
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

  const handleSendAllReminders = async () => {
    setSendingBulk(true)
    try {
      const result = await sendFollowUpRemindersBulk(status || 'Open', costCenter || undefined)
      toast.success(`Reminders sent: ${result.sent} of ${result.total}`)
      if (result.sent > 0) loadList()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send reminders')
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
    <div className="flex flex-col gap-4">
      {/* Filters + Send all reminders */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
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
            onChange={(e) => setCostCenter(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-[160px]"
          >
            <option value="">All</option>
            {costCenterOptions.map((cc) => (
              <option key={cc.name} value={cc.name}>{cc.name}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleSendAllReminders}
          disabled={sendingBulk || list.length === 0}
          className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {sendingBulk ? 'Sending…' : 'Send all reminders'}
        </button>
      </div>

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
                  <th className="px-4 py-2 text-left font-medium text-slate-700">Patient</th>
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
                    <td
                      className="px-4 py-2 cursor-pointer"
                      onClick={() => setDetailName(row.name)}
                    >
                      <span className="font-medium text-primary hover:underline">{row.patient_name || row.patient}</span>
                    </td>
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

                        {openActionRow === row.name && (
                          <div className="absolute right-0 bottom-full mb-1 z-10 min-w-[200px] rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                            {/* Remind via WhatsApp */}
                            <button
                              type="button"
                              onClick={() => handleRemind(row.name)}
                              disabled={sendingId === row.name}
                              className="block w-full text-left px-3 py-2 text-sm text-primary font-medium hover:bg-primary/5 disabled:opacity-50"
                            >
                              <span className="flex items-center gap-2">
                                {/* WhatsApp icon */}
                                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                                Remind via WhatsApp
                              </span>
                            </button>

                            {/* Divider */}
                            <div className="border-t border-slate-100 my-1" />

                            {/* Status change actions — hide current status */}
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
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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