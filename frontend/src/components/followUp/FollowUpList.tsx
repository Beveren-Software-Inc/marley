import { useState, useEffect, useCallback } from 'react'
import {
  getFollowUps,
  sendFollowUpReminder,
  sendFollowUpRemindersBulk,
  getCostCenters,
  type PatientFollowUpRow,
} from '../../services/followUp'
import { toast } from '../../hooks/useToast'

const STATUS_OPTIONS = [
  { value: 'Open', label: 'Open' },
  { value: 'Contacted', label: 'Contacted' },
  { value: 'Completed', label: 'Completed' },
  { value: 'No Follow Up Required', label: 'No Follow Up Required' },
  { value: '', label: 'All' },
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

  const handleRemind = async (name: string) => {
    setSendingId(name)
    try {
      const result = await sendFollowUpReminder(name)
      if (result.sent) {
        toast.success('Reminder sent')
      } else {
        toast.error(result.message || 'Reminder not sent')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send reminder')
    } finally {
      setSendingId(null)
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
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading follow-ups…</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No follow-ups match the filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">Patient</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">Type</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">Follow Up Date</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">Status</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">Cost Center</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">Remarks</th>
                  <th className="px-4 py-2 text-right font-medium text-slate-700">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {list.map((row) => (
                  <tr key={row.name} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <span className="font-medium text-slate-900">{row.patient_name || row.patient}</span>
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
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemind(row.name)}
                        disabled={sendingId === row.name}
                        className="text-primary hover:underline text-sm font-medium disabled:opacity-50"
                      >
                        {sendingId === row.name ? 'Sending…' : 'Remind'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
