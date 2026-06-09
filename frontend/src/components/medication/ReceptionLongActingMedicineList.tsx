import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { fetchReceptionLongActingMedicineList } from '../../services/receptionLongActingMedicine'
import type { LongActingMedicineRow, ReminderChannel } from '../../services/longActingMedicine'
import { sendLongActingMedicineReminder, updateLongActingMedicineRemarks } from '../../services/longActingMedicine'
import { LONG_ACTING_FREQUENCY_OPTIONS } from '../../services/prescriptions'
import { LongActingMedicineDetailPanel } from './LongActingMedicineDetailPanel'
import { toast } from '../../hooks/useToast'
import { Mail, MoreHorizontal } from 'lucide-react'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'

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

interface ReceptionLongActingMedicineListProps {
  patient?: string
  refreshKey?: string | number
  onPatientClick?: (patient: string) => void
}

export const ReceptionLongActingMedicineList = ({ patient, refreshKey, onPatientClick }: ReceptionLongActingMedicineListProps) => {
  const [rows, setRows] = useState<LongActingMedicineRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [frequency, setFrequency] = useState<string>('')
  const [sortBy, setSortBy] = useState<'next_run_date' | 'start_date'>('next_run_date')
  const hasActiveFilters = Boolean(startDate || frequency)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [detailPreview, setDetailPreview] = useState<LongActingMedicineRow | undefined>(undefined)
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkChannelMenuOpen, setBulkChannelMenuOpen] = useState(false)
  const bulkMenuRef = useRef<HTMLDivElement>(null)

  // Three-dot action menu
  const [openMenuRow, setOpenMenuRow] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Remarks modal
  const [remarksModal, setRemarksModal] = useState<{ name: string; current: string } | null>(null)
  const [remarksText, setRemarksText] = useState('')
  const [remarksSaving, setRemarksSaving] = useState(false)

  const load = useCallback(async () => {
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
  }, [startDate, frequency, patient])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const clearFilters = () => {
    setStartDate('')
    setFrequency('')
  }

  // Close action menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuRow(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openRemarksModal = (e: React.MouseEvent, row: LongActingMedicineRow) => {
    e.stopPropagation()
    setOpenMenuRow(null)
    setRemarksText(row.remarks || '')
    setRemarksModal({ name: row.name, current: row.remarks || '' })
  }

  const handleSaveRemarks = async () => {
    if (!remarksModal) return
    setRemarksSaving(true)
    try {
      await updateLongActingMedicineRemarks(remarksModal.name, remarksText)
      toast.success('Remarks updated')
      setRows((prev) =>
        prev.map((r) => r.name === remarksModal.name ? { ...r, remarks: remarksText } : r)
      )
      setRemarksModal(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update remarks')
    } finally {
      setRemarksSaving(false)
    }
  }

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

  const getRowColorClass = (nextRunDate?: string) => {
    if (!nextRunDate) return ''
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const next = new Date(nextRunDate)
    next.setHours(0, 0, 0, 0)
    const diffDays = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return 'bg-red-100 hover:bg-red-200'    // past due
    if (diffDays <= 2) return 'bg-green-100 hover:bg-green-200' // due today, tomorrow, or in 2 days
    return 'hover:bg-slate-50'
  }

  const handleRowClick = (row: LongActingMedicineRow) => {
    setDetailPreview(row)
    setDetailName(row.name)
  }

  const handleBulkSendReminders = async (channel: ReminderChannel) => {
    if (formattedRows.length === 0) {
      toast.error('No long acting medicines to send reminders for')
      return
    }
    const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'Email'
    if (!window.confirm(`Send ${channelLabel} reminders for all ${formattedRows.length} long acting medicine record(s) in the current view?`)) {
      return
    }
    
    setBulkSending(true)
    let successCount = 0
    let failCount = 0
    
    for (const row of formattedRows) {
      try {
        await sendLongActingMedicineReminder(row.name, channel)
        successCount++
      } catch {
        failCount++
      }
    }
    
    setBulkSending(false)
    
    if (failCount === 0) {
      toast.success(`${channelLabel} reminders sent for ${successCount} record(s)`)
    } else {
      toast.error(`${successCount} sent, ${failCount} failed`)
    }
  }

  const handleSendReminder = async (e: React.MouseEvent, rowName: string, patientName: string, channel: ReminderChannel) => {
    e.stopPropagation()
    setOpenMenuRow(null)
    const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'Email'
    try {
      await sendLongActingMedicineReminder(rowName, channel)
      toast.success(`${channelLabel} reminder sent for ${patientName || rowName}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to send ${channelLabel} reminder`)
    }
  }

  const handleCloseDetail = () => {
    setDetailName(null)
    setDetailPreview(undefined)
  }

  return (
    <div className="space-y-3">
      {/* Toolbar: bulk actions left, filter toggle far right */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="relative" ref={bulkMenuRef}>
          <button
            type="button"
            disabled={bulkSending || formattedRows.length === 0}
            onClick={() => setBulkChannelMenuOpen((p) => !p)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-primary bg-primary/5 text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Mail className="w-4 h-4" />
            {bulkSending ? 'Sending…' : `Bulk Send Reminders${formattedRows.length ? ` (${formattedRows.length})` : ''}`}
            {!bulkSending && (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            )}
          </button>
          {bulkChannelMenuOpen && (
            <div className="absolute right-0 z-30 mt-1 w-48 bg-white border border-slate-200 rounded-md shadow-lg py-1">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                Choose Channel
              </div>
              <button type="button" onClick={() => { setBulkChannelMenuOpen(false); handleBulkSendReminders('email') }}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-blue-500" /> Email
              </button>
              <button type="button" onClick={() => { setBulkChannelMenuOpen(false); handleBulkSendReminders('whatsapp') }}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                <span className="text-green-500 text-base leading-none">💬</span> WhatsApp
              </button>
              <button type="button" onClick={() => { setBulkChannelMenuOpen(false); handleBulkSendReminders('sms') }}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                <span className="text-purple-500 text-base leading-none">📱</span> SMS
              </button>
            </div>
          )}
        </div>

        <FilterToggleButton active={showFilters} onClick={() => setShowFilters((v) => !v)} />
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-end gap-3 px-1 py-2 border-b border-slate-100 bg-slate-50/80 rounded-md">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
            <input
              type="date"
              className="border border-slate-300 rounded px-2 py-1.5 text-sm bg-white"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

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

          <ClearFiltersButton onClick={clearFilters} disabled={!hasActiveFilters} />
        </div>
      )}

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
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Name</th>
                {!patient && (
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Patient</th>
                )}
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Frequency</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Start</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Next Run</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Remarks</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {formattedRows.map((row) => (
                <tr
                  key={row.name}
                  className={`cursor-pointer transition-colors ${getRowColorClass(row.next_run_date)}`}
                  onClick={() => handleRowClick(row)}
                >
                  <td className="px-3 py-2 text-primary font-medium">{row.name}</td>
                  {!patient && (
                    <td
                      className="px-3 py-2 text-slate-700 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); row.patient && onPatientClick?.(row.patient) }}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-primary hover:underline">{row.patient_name || '—'}</span>
                        <span className="text-xs text-slate-500">{row.patient || ''}</span>
                      </div>
                    </td>
                  )}
                  <td className="px-3 py-2 text-slate-700">{row.frequency || '—'}</td>
                  <td className="px-3 py-2 text-slate-700">{formatDate(row.start_date)}</td>
                  <td className="px-3 py-2 text-slate-700">{formatDate(row.next_run_date)}</td>
                  <td className="px-3 py-2 text-slate-700">
                    <span>{row.status || 'Draft'}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    <span className='text-gray-500'>{row.remarks || 'No remarks'}</span>
                  </td>
                  {/* Actions column */}
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      {/* Three-dot menu */}
                      <div className="relative" ref={openMenuRow === row.name ? menuRef : undefined}>
                        <button
                          type="button"
                          aria-label="Actions"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuRow(openMenuRow === row.name ? null : row.name)
                          }}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {openMenuRow === row.name && (
                          <div className="absolute right-0 z-30 mt-1 w-44 bg-white border border-slate-200 rounded-md shadow-lg py-1">
                            <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                              Send Reminder
                            </div>
                            <button
                              type="button"
                              onClick={(e) => handleSendReminder(e, row.name, row.patient_name || row.patient || row.name, 'email')}
                              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <Mail className="w-3.5 h-3.5 text-blue-500" /> Send Email
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleSendReminder(e, row.name, row.patient_name || row.patient || row.name, 'whatsapp')}
                              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <span className="text-green-500 text-base leading-none">💬</span> Send WhatsApp
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleSendReminder(e, row.name, row.patient_name || row.patient || row.name, 'sms')}
                              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <span className="text-purple-500 text-base leading-none">📱</span> Send SMS
                            </button>
                            <div className="border-t border-slate-100 my-1" />
                            <button
                              type="button"
                              onClick={(e) => openRemarksModal(e, row)}
                              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <span className="text-slate-500 text-base leading-none">✏️</span> Add Remarks
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Print */}
                      <PrintFormatDropdown
                        doctype="Long Acting Medicine"
                        docName={row.name}
                        noLetterhead={0}
                        triggerPrint={1}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-primary hover:bg-slate-100 transition-colors"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailName ? (
        <LongActingMedicineDetailPanel
          name={detailName}
          preview={detailPreview}
          onClose={handleCloseDetail}
          onPatientClick={onPatientClick}
        />
      ) : null}

      {/* Add Remarks Modal */}
      {remarksModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Add Remarks</h2>
                <p className="text-xs text-slate-500 mt-0.5">{remarksModal.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setRemarksModal(null)}
                disabled={remarksSaving}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-40 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
                <textarea
                  value={remarksText}
                  onChange={(e) => setRemarksText(e.target.value)}
                  rows={5}
                  placeholder="Enter remarks..."
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  autoFocus
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemarksModal(null)}
                disabled={remarksSaving}
                className="px-4 py-2 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRemarks}
                disabled={remarksSaving}
                className="px-4 py-2 text-sm rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50 font-medium"
              >
                {remarksSaving ? 'Saving…' : 'Save Remarks'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}