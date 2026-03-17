import { useEffect, useState, useMemo } from 'react'
import { fetchReceptionLongActingMedicineList } from '../../services/receptionLongActingMedicine'
import type { LongActingMedicineRow } from '../../services/longActingMedicine'
import { sendLongActingMedicineReminder } from '../../services/longActingMedicine'
import { LONG_ACTING_FREQUENCY_OPTIONS } from '../../services/prescriptions'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { DocDetailView } from '../ui/DocDetailView'
import { toast } from '../../hooks/useToast'
import { Mail } from 'lucide-react'

interface ReceptionLongActingMedicineListProps {
  patient?: string
  refreshKey?: string | number
}

export const ReceptionLongActingMedicineList = ({ patient, refreshKey }: ReceptionLongActingMedicineListProps) => {
  const [rows, setRows] = useState<LongActingMedicineRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [frequency, setFrequency] = useState<string>('')
  const [sortBy, setSortBy] = useState<'next_run_date' | 'start_date'>('next_run_date')
  const [detailName, setDetailName] = useState<string | null>(null)
  const [bulkSending, setBulkSending] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchReceptionLongActingMedicineList({
        start_date: startDate || undefined,
        frequency: frequency || undefined,
        patient: patient || undefined,
        limit: 100,
        offset: 0,
      })
      setRows(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load long acting medicines'
      setError(msg)
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient, refreshKey])

  const formattedRows = useMemo(() => {
    const sorted = [...rows]
    sorted.sort((a, b) => {
      const aVal = (sortBy === 'next_run_date' ? a.next_run_date : a.start_date) || ''
      const bVal = (sortBy === 'next_run_date' ? b.next_run_date : b.start_date) || ''
      if (!aVal && !bVal) return 0
      if (!aVal) return 1
      if (!bVal) return -1
      return aVal.localeCompare(bVal)
    })
    return sorted
  }, [rows, sortBy])

  const formatDate = (d?: string) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const handleRowClick = (name: string) => {
    // Only open the modal, don't trigger navigation
    setDetailName(name)
  }

  const handleApplyFilters = async () => {
    await load()
  }

  const handleBulkSendReminders = async () => {
    if (formattedRows.length === 0) {
      toast.error('No long acting medicines to send reminders for')
      return
    }
    
    if (!window.confirm(`Send reminders for all ${formattedRows.length} long acting medicine record(s) in the current view?`)) {
      return
    }
    
    setBulkSending(true)
    let successCount = 0
    let failCount = 0
    
    for (const row of formattedRows) {
      try {
        await sendLongActingMedicineReminder(row.name)
        successCount++
      } catch {
        failCount++
      }
    }
    
    setBulkSending(false)
    
    if (failCount === 0) {
      toast.success(`Reminders sent for ${successCount} record(s)`)
    } else {
      toast.error(`${successCount} sent, ${failCount} failed`)
    }
  }

  const handleSendReminder = async (e: React.MouseEvent, rowName: string, patientName: string) => {
    e.stopPropagation()
    
    try {
      await sendLongActingMedicineReminder(rowName)
      toast.success(`Reminder sent for ${patientName || rowName}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reminder')
    }
  }

  const handleCloseDetail = () => {
    setDetailName(null)
  }

  return (
    <div className="space-y-3">
      {/* Filters + Bulk Actions */}
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap items-end gap-3">
          {/* Start Date Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
            <input
              type="date"
              className="border border-slate-300 rounded px-2 py-1.5 text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          {/* Frequency Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Frequency</label>
            <select
              className="border border-slate-300 rounded px-2 py-1.5 text-sm bg-white min-w-[160px]"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            >
              <option value="">All</option>
              {LONG_ACTING_FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Sort By</label>
            <select
              className="border border-slate-300 rounded px-2 py-1.5 text-sm bg-white min-w-[160px]"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'next_run_date' | 'start_date')}
            >
              <option value="next_run_date">Next Run Date</option>
              <option value="start_date">Start Date</option>
            </select>
          </div>

          {/* Apply Filters Button */}
          <button
            type="button"
            onClick={handleApplyFilters}
            className="inline-flex items-center px-3 py-1.5 text-sm rounded bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            Apply Filters
          </button>
        </div>

        {/* Bulk Send Reminders Button */}
        <button
          type="button"
          disabled={bulkSending || formattedRows.length === 0}
          onClick={handleBulkSendReminders}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-primary bg-primary/5 text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Mail className="w-4 h-4" />
          {bulkSending ? 'Sending…' : `Bulk Send Reminders${formattedRows.length ? ` (${formattedRows.length})` : ''}`}
        </button>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="text-sm text-slate-600 py-4">Loading long acting medicines…</div>
      ) : error ? (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : formattedRows.length === 0 ? (
        <div className="text-sm text-slate-500 py-4">
          No long acting medicines found for the selected filters.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-auto max-h-[420px]">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                  Name
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                  Patient
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                  Frequency
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                  Start
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                  Next Run
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {formattedRows.map((row) => (
                <tr
                  key={row.name}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => handleRowClick(row.name)}
                >
                  <td className="px-3 py-2 text-primary font-medium">{row.name}</td>
                  <td className="px-3 py-2 text-slate-700">
                    <div className="flex flex-col">
                      <span>{row.patient_name || '—'}</span>
                      <span className="text-xs text-slate-500">{row.patient || ''}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{row.frequency || '—'}</td>
                  <td className="px-3 py-2 text-slate-700">{formatDate(row.start_date)}</td>
                  <td className="px-3 py-2 text-slate-700">{formatDate(row.next_run_date)}</td>
                  <td className="px-3 py-2 text-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <span>{row.status || 'Draft'}</span>
                      <button
                        type="button"
                        onClick={(e) =>
                          handleSendReminder(
                            e,
                            row.name,
                            row.patient_name || row.patient || row.name
                          )
                        }
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline transition-colors"
                      >
                        <Mail className="w-3 h-3" />
                        Send
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Slide Over Modal */}
      {detailName && (
        <DetailSlideOver
          title="Long Acting Medicine"
          subtitle={detailName}
          onClose={handleCloseDetail}
        >
          <DocDetailView doctype="Long Acting Medicine" name={detailName} />
        </DetailSlideOver>
      )}
    </div>
  )
}