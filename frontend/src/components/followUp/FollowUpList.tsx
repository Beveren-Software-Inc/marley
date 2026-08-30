import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  getFollowUps,
  getOpFollowUpVisits,
  getIpFollowUpAdmissions,
  sendFollowUpReminder,
  sendFollowUpRemindersSelected,
  updateFollowUpStatus,
  getCostCenters,
  type PatientFollowUpRow,
  type FollowUpCandidateRow,
  type ReminderChannel,
  type FollowUpReferencePayload,
  type FollowUpWhatsAppTarget,
} from '../../services/followUp'
import { toast } from '../../hooks/useToast'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { DocDetailView } from '../ui/DocDetailView'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { PaginationControls, DEFAULT_PAGE_SIZE, type PageSize } from '../ui/PaginationControls'
import { useCardFilters } from '../../contexts/CardFilterContext'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { DateFilterInput } from '../ui/DateFilterInput'
import { AddFollowUpRemarkModal, type FollowUpRemarkTarget } from './AddFollowUpRemarkModal'
import { SendWhatsAppFollowUpModal } from './SendWhatsAppFollowUpModal'

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
  { value: '', label: 'All statuses' },
]

const STATUS_ACTIONS: { value: string; label: string }[] = [
  { value: 'Open', label: 'Mark as Open' },
  { value: 'Contacted', label: 'Mark as Contacted' },
  { value: 'Completed', label: 'Mark as Completed' },
  { value: 'No Follow Up Required', label: 'No Follow Up Required' },
]

const FOLLOW_UP_CATEGORIES = [
  { id: 'Normal', label: 'Normal', description: 'General follow-up records' },
  { id: 'OP', label: 'OP', description: 'Latest outpatient visit per patient' },
  { id: 'IP', label: 'IP', description: 'Latest inpatient admission per patient' },
] as const

type FollowUpCategory = (typeof FOLLOW_UP_CATEGORIES)[number]['id']

interface FollowUpListProps {
  refreshKey?: number | string
  patient?: string
  onPatientClick?: (patient: string) => void
}

function normalRowKey(row: PatientFollowUpRow): string {
  return `followup:${row.name}`
}

function candidateRowKey(row: FollowUpCandidateRow): string {
  return `ref:${row.reference_doctype}:${row.reference_name}`
}

function statusBadgeClass(status?: string): string {
  if (status === 'Open') return 'bg-amber-100 text-amber-800'
  if (status === 'Contacted') return 'bg-blue-100 text-blue-800'
  if (status === 'Completed') return 'bg-green-100 text-green-800'
  return 'bg-slate-100 text-slate-700'
}

export const FollowUpList = ({ refreshKey, patient, onPatientClick }: FollowUpListProps) => {
  const [normalList, setNormalList] = useState<PatientFollowUpRow[]>([])
  const [candidateList, setCandidateList] = useState<FollowUpCandidateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<FollowUpCategory>('Normal')
  const [status, setStatus] = useState<string>('Open')
  const [costCenter, setCostCenter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [search, setSearch] = useState<string>('')
  const [searchInput, setSearchInput] = useState<string>('')
  const [costCenterOptions, setCostCenterOptions] = useState<{ name: string }[]>([])
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sendingBulk, setSendingBulk] = useState(false)
  const [bulkMenuMode, setBulkMenuMode] = useState<'selected' | 'all' | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [remarkTarget, setRemarkTarget] = useState<FollowUpRemarkTarget | null>(null)
  const [whatsappTarget, setWhatsappTarget] = useState<FollowUpWhatsAppTarget | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const cardFilters = useCardFilters()
  const [showFiltersInternal, setShowFiltersInternal] = useState(true)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const isInsideCard = cardFilters !== undefined
  const menuRef = useRef<HTMLDivElement>(null)
  const bulkMenuRef = useRef<HTMLDivElement>(null)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  const [totalCount, setTotalCount] = useState(0)

  const isNormal = category === 'Normal'
  const currentRowKeys = useMemo(() => {
    if (isNormal) return normalList.map(normalRowKey)
    return candidateList.map(candidateRowKey)
  }, [isNormal, normalList, candidateList])

  const allOnPageSelected =
    currentRowKeys.length > 0 && currentRowKeys.every((key) => selectedKeys.has(key))

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const commonParams = {
        cost_center: costCenter || undefined,
        patient: patient || undefined,
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }

      if (category === 'Normal') {
        const result = await getFollowUps({
          ...commonParams,
          status: status || undefined,
          follow_up_type: 'Normal',
        })
        setNormalList(result.data)
        setCandidateList([])
        setTotalCount(result.total_count)
      } else if (category === 'OP') {
        const result = await getOpFollowUpVisits(commonParams)
        setCandidateList(result.data)
        setNormalList([])
        setTotalCount(result.total_count)
      } else {
        const result = await getIpFollowUpAdmissions(commonParams)
        setCandidateList(result.data)
        setNormalList([])
        setTotalCount(result.total_count)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load follow-ups')
      setNormalList([])
      setCandidateList([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [status, costCenter, category, patient, page, pageSize, dateFrom, dateTo, search])

  useEffect(() => {
    loadList()
  }, [loadList, refreshKey])

  useEffect(() => {
    getCostCenters().then(setCostCenterOptions).catch(() => setCostCenterOptions([]))
  }, [])

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

  useEffect(() => {
    setSelectedKeys(new Set())
  }, [category, page, pageSize, status, costCenter, dateFrom, dateTo, search, patient])

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const toggleRow = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAllOnPage = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) {
        currentRowKeys.forEach((key) => next.delete(key))
      } else {
        currentRowKeys.forEach((key) => next.add(key))
      }
      return next
    })
  }

  const handleRemindFollowUp = async (row: PatientFollowUpRow, channel: ReminderChannel) => {
    setOpenActionRow(null)
    if (channel === 'whatsapp') {
      setWhatsappTarget({
        patient_follow_up_name: row.name,
        patient_name: row.patient_name || row.patient,
      })
      return
    }
    setSendingId(row.name)
    const channelLabel = channel === 'sms' ? 'SMS' : 'Email'
    try {
      const result = await sendFollowUpReminder(row.name, channel)
      if (result.sent) {
        toast.success(`${channelLabel} reminder sent`)
        loadList()
      } else {
        toast.error(result.message || 'Reminder not sent')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to send ${channelLabel} reminder`)
    } finally {
      setSendingId(null)
    }
  }

  const handleRemindCandidate = async (row: FollowUpCandidateRow, channel: ReminderChannel) => {
    setOpenActionRow(null)
    if (channel === 'whatsapp') {
      setWhatsappTarget({
        patient_follow_up_name: row.follow_up_name,
        patient_name: row.patient_name || row.patient,
        reference_doctype: row.reference_doctype,
        reference_name: row.reference_name,
        follow_up_type: row.follow_up_type,
      })
      return
    }
    const key = candidateRowKey(row)
    setSendingId(key)
    const channelLabel = channel === 'sms' ? 'SMS' : 'Email'
    try {
      const result = await sendFollowUpRemindersSelected({
        channel,
        names: row.follow_up_name ? [row.follow_up_name] : undefined,
        references: row.follow_up_name
          ? undefined
          : [
              {
                reference_doctype: row.reference_doctype,
                reference_name: row.reference_name,
                follow_up_type: row.follow_up_type,
              },
            ],
      })
      if (result.sent > 0) {
        toast.success(`${channelLabel} reminder sent`)
        loadList()
      } else {
        toast.error('Reminder not sent')
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

  const buildSelectedPayload = () => {
    const names: string[] = []
    const references: FollowUpReferencePayload[] = []

    if (isNormal) {
      normalList.forEach((row) => {
        const key = normalRowKey(row)
        if (selectedKeys.has(key)) names.push(row.name)
      })
    } else {
      candidateList.forEach((row) => {
        const key = candidateRowKey(row)
        if (!selectedKeys.has(key)) return
        if (row.follow_up_name) {
          names.push(row.follow_up_name)
        } else {
          references.push({
            reference_doctype: row.reference_doctype,
            reference_name: row.reference_name,
            follow_up_type: row.follow_up_type,
          })
        }
      })
    }

    return { names, references }
  }

  const handleSendSelected = async (channel: ReminderChannel) => {
    const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'Email'
    const { names, references } = buildSelectedPayload()
    if (!names.length && !references.length) {
      toast.error('Select at least one row')
      return
    }
    setSendingBulk(true)
    try {
      const result = await sendFollowUpRemindersSelected({ names, references, channel })
      toast.success(`${channelLabel} reminders sent: ${result.sent} of ${result.total}`)
      if (result.sent > 0) loadList()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to send ${channelLabel} reminders`)
    } finally {
      setSendingBulk(false)
    }
  }

  const handleSendAllMatching = async (channel: ReminderChannel) => {
    const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'Email'
    // Confirm before firing potentially hundreds of reminders on a single click.
    if (!window.confirm(`Send ${channelLabel} reminders to all ${totalCount} matching follow-up${totalCount === 1 ? '' : 's'}?`)) {
      return
    }
    setSendingBulk(true)
    try {
      // Fetch exactly the rows the current filters (status + date range) show, then send by
      // name/reference. Using the same query as the list guarantees the recipients match the
      // visible set (honours the date filter, and the actual status — not a forced 'Open').
      const commonParams = {
        cost_center: costCenter || undefined,
        patient: patient || undefined,
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: totalCount > 0 ? totalCount : 500,
        offset: 0,
      }
      const names: string[] = []
      const references: FollowUpReferencePayload[] = []
      if (isNormal) {
        // Normal rows are real Patient Follow Up records — send by their record name.
        const res = await getFollowUps({ ...commonParams, status: status || undefined, follow_up_type: 'Normal' })
        res.data.forEach((row) => { if (row.name) names.push(row.name) })
      } else {
        // OP/IP candidates: send by follow-up name if one exists, else by visit/admission reference.
        const res = category === 'OP'
          ? await getOpFollowUpVisits(commonParams)
          : await getIpFollowUpAdmissions(commonParams)
        res.data.forEach((row) => {
          if (row.follow_up_name) names.push(row.follow_up_name)
          else {
            references.push({
              reference_doctype: row.reference_doctype,
              reference_name: row.reference_name,
              follow_up_type: row.follow_up_type,
            })
          }
        })
      }

      const sendResult = await sendFollowUpRemindersSelected({
        channel,
        names: names.length ? names : undefined,
        references: references.length ? references : undefined,
      })
      toast.success(`${channelLabel} reminders sent: ${sendResult.sent} of ${sendResult.total}`)
      loadList()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to send ${channelLabel} reminders`)
    } finally {
      setSendingBulk(false)
    }
  }

  const clearFilters = () => {
    setStatus('Open')
    setCostCenter('')
    setDateFrom('')
    setDateTo('')
    setSearchInput('')
    setSearch('')
    setPage(1)
  }

  const hasActiveFilters = Boolean(
    (status && status !== 'Open') || costCenter || dateFrom || dateTo || search,
  )

  const remarksPreview = (r?: string) => {
    if (!r) return '—'
    const plain = r.replace(/<[^>]+>/g, '').trim()
    return plain.length > 50 ? plain.slice(0, 50) + '…' : plain
  }

  const listEmpty = isNormal ? normalList.length === 0 : candidateList.length === 0
  const selectedCount = selectedKeys.size

  const renderBulkMenu = (mode: 'selected' | 'all') => (
    <div className="absolute right-0 z-30 mt-1 w-52 bg-white border border-slate-200 rounded-md shadow-lg py-1">
      <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
        Choose Channel
      </div>
      {CHANNEL_OPTIONS.map((ch) => (
        <button
          key={ch.value}
          type="button"
          onClick={() => {
            setBulkMenuMode(null)
            if (mode === 'selected') handleSendSelected(ch.value)
            else handleSendAllMatching(ch.value)
          }}
          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
        >
          <span>{ch.icon}</span> {ch.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col gap-4 min-h-[400px]">
      {!isInsideCard && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-900">Follow Ups</h2>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {FOLLOW_UP_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setCategory(item.id)
              setPage(1)
            }}
            className={`rounded-lg border p-4 text-left transition-colors ${
              category === item.id
                ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="text-sm font-semibold text-slate-900">{item.label}</div>
            <div className="mt-1 text-xs text-slate-500">{item.description}</div>
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="card-filter-bar flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">From Date</label>
            <DateFilterInput
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">To Date</label>
            <DateFilterInput
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[180px] flex-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Search</label>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Patient name, ID, visit, mobile…"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {isNormal && (
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</label>
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1) }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Branch</label>
            <select
              value={costCenter}
              onChange={(e) => { setCostCenter(e.target.value); setPage(1) }}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select All</option>
              {costCenterOptions.map((cc) => (
                <option key={cc.name} value={cc.name}>{cc.name}</option>
              ))}
            </select>
          </div>
          <ClearFiltersButton onClick={clearFilters} disabled={!hasActiveFilters} />
          <div className="flex flex-wrap gap-2 ml-auto">
            <div className="relative" ref={bulkMenuRef}>
              <button
                type="button"
                onClick={() => setBulkMenuMode((m) => (m === 'selected' ? null : 'selected'))}
                disabled={sendingBulk || selectedCount === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-primary text-primary rounded-md text-sm font-medium hover:bg-primary/5 disabled:opacity-50"
              >
                {sendingBulk ? 'Sending…' : `Send selected (${selectedCount})`}
              </button>
              {bulkMenuMode === 'selected' && selectedCount > 0 && renderBulkMenu('selected')}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setBulkMenuMode((m) => (m === 'all' ? null : 'all'))}
                disabled={sendingBulk || totalCount === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {sendingBulk ? 'Sending…' : `Send all matching (${totalCount})`}
              </button>
              {bulkMenuMode === 'all' && totalCount > 0 && renderBulkMenu('all')}
            </div>
          </div>
        </div>
      )}

      <div className="border border-slate-200 rounded-lg bg-white flex flex-col min-h-[320px]">
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 text-xs text-slate-600">
          {isNormal ? (
            <>
              Showing <span className="font-medium text-slate-800">Normal</span> follow-up records
            </>
          ) : (
            <>
              Showing latest <span className="font-medium text-slate-800">{category}</span>{' '}
              {category === 'OP' ? 'visit' : 'admission'} per patient (patients with follow-up enabled)
            </>
          )}
          {hasActiveFilters ? ' · filtered' : ''}
          {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading follow-ups…</div>
        ) : listEmpty ? (
          <div className="p-8 text-center text-slate-500">
            {isNormal
              ? 'No follow-up records match the filters. Try “All statuses” or check the OP/IP tabs.'
              : 'NO PATIENTS WITH FOLLOW-UP ENABLED MATCH THE FILTERS.'}
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-visible flex-1">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 w-10">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleAllOnPage}
                      aria-label="Select all on page"
                      className="rounded border-slate-300"
                    />
                  </th>
                  {!patient && (
                    <th className="px-4 py-2 text-left font-medium text-slate-700">Patient</th>
                  )}
                  {isNormal ? (
                    <>
                      <th className="px-4 py-2 text-left font-medium text-slate-700">Follow Up Date</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-700">Status</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-700">Branch</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-700">Remarks</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-2 text-left font-medium text-slate-700">
                        {category === 'OP' ? 'Latest Visit' : 'Latest Admission'}
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-slate-700">Last Date</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-700">Follow Up Date</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-700">Status</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-700">Doctor</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-700">Branch</th>
                    </>
                  )}
                  <th className="px-4 py-2 text-right font-medium text-slate-700 w-[80px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {isNormal
                  ? normalList.map((row) => {
                      const key = normalRowKey(row)
                      return (
                        <tr key={row.name} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedKeys.has(key)}
                              onChange={() => toggleRow(key)}
                              aria-label={`Select ${row.patient_name}`}
                              className="rounded border-slate-300"
                            />
                          </td>
                          {!patient && (
                            <td
                              className="px-4 py-2 cursor-pointer"
                              onClick={() => row.patient && onPatientClick?.(row.patient)}
                            >
                              <span className="font-medium text-primary hover:underline">
                                {row.patient_name || row.patient}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-2 text-slate-600">{row.follow_up_date}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(row.status)}`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-600">{row.cost_center || '—'}</td>
                          <td className="px-4 py-2 text-slate-600 max-w-[220px]" title={row.remarks || ''}>
                            <button
                              type="button"
                              className="block w-full truncate text-left hover:text-primary"
                              title="Add or edit remark"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenActionRow(null)
                                setRemarkTarget({
                                  name: row.name,
                                  patient_name: row.patient_name || row.patient,
                                  remarks: row.remarks,
                                })
                              }}
                            >
                              {remarksPreview(row.remarks) === '—' ? (
                                <span className="text-slate-400">Add remark…</span>
                              ) : (
                                remarksPreview(row.remarks)
                              )}
                            </button>
                          </td>
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
                                ⋮
                              </button>
                              <PortalActionsMenu
                                open={openActionRow === row.name}
                                onClose={() => setOpenActionRow(null)}
                                triggerRef={menuRef}
                                placement="above-right"
                                minWidth={200}
                              >
                                <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                                  Send Reminder
                                </div>
                                {CHANNEL_OPTIONS.map((ch) => (
                                  <button
                                    key={ch.value}
                                    type="button"
                                    onClick={() => handleRemindFollowUp(row, ch.value)}
                                    disabled={sendingId === row.name}
                                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2"
                                  >
                                    <span>{ch.icon}</span> {ch.label}
                                  </button>
                                ))}
                                <div className="border-t border-slate-100 my-1" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionRow(null)
                                    setRemarkTarget({
                                      name: row.name,
                                      patient_name: row.patient_name || row.patient,
                                      remarks: row.remarks,
                                    })
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                >
                                  Add Remark
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDetailName(row.name)}
                                  className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                >
                                  View details
                                </button>
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
                      )
                    })
                  : candidateList.map((row) => {
                      const key = candidateRowKey(row)
                      const actionId = row.follow_up_name || key
                      return (
                        <tr key={key} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedKeys.has(key)}
                              onChange={() => toggleRow(key)}
                              aria-label={`Select ${row.patient_name}`}
                              className="rounded border-slate-300"
                            />
                          </td>
                          {!patient && (
                            <td
                              className="px-4 py-2 cursor-pointer"
                              onClick={() => row.patient && onPatientClick?.(row.patient)}
                            >
                              <span className="font-medium text-primary hover:underline">
                                {row.patient_name || row.patient}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-2 text-slate-700 font-medium">{row.reference_name}</td>
                          <td className="px-4 py-2 text-slate-600">{row.reference_date || '—'}</td>
                          <td className="px-4 py-2 text-slate-600">{row.follow_up_date || '—'}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(row.follow_up_status || row.reference_status)}`}>
                              {row.follow_up_status || row.reference_status || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-600">{row.practitioner_name || '—'}</td>
                          <td className="px-4 py-2 text-slate-600">{row.cost_center || '—'}</td>
                          <td className="px-4 py-2 text-right">
                            <div
                              className="relative inline-block"
                              ref={openActionRow === actionId ? menuRef : undefined}
                            >
                              <button
                                type="button"
                                onClick={() => setOpenActionRow((prev) => (prev === actionId ? null : actionId))}
                                disabled={sendingId === key}
                                className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                                aria-label="Actions"
                              >
                                ⋮
                              </button>
                              <PortalActionsMenu
                                open={openActionRow === actionId}
                                onClose={() => setOpenActionRow(null)}
                                triggerRef={menuRef}
                                placement="above-right"
                                minWidth={200}
                              >
                                <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                                  Send Reminder
                                </div>
                                {CHANNEL_OPTIONS.map((ch) => (
                                  <button
                                    key={ch.value}
                                    type="button"
                                    onClick={() => handleRemindCandidate(row, ch.value)}
                                    disabled={sendingId === key}
                                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2"
                                  >
                                    <span>{ch.icon}</span> {ch.label}
                                  </button>
                                ))}
                                <div className="border-t border-slate-100 my-1" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionRow(null)
                                    setRemarkTarget({
                                      name: row.follow_up_name,
                                      patient_name: row.patient_name || row.patient,
                                      remarks: row.remarks,
                                      reference_doctype: row.reference_doctype,
                                      reference_name: row.reference_name,
                                      follow_up_type: row.follow_up_type,
                                    })
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                >
                                  Add Remark
                                </button>
                                {row.follow_up_name && (
                                  <button
                                    type="button"
                                    onClick={() => setDetailName(row.follow_up_name!)}
                                    className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                  >
                                    View follow-up record
                                  </button>
                                )}
                              </PortalActionsMenu>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
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

      {whatsappTarget && (
        <SendWhatsAppFollowUpModal
          target={whatsappTarget}
          onClose={() => setWhatsappTarget(null)}
          onSuccess={() => loadList()}
        />
      )}

      {remarkTarget && (
        <AddFollowUpRemarkModal
          target={remarkTarget}
          onClose={() => setRemarkTarget(null)}
          onSuccess={(result) => {
            setNormalList((prev) =>
              prev.map((r) =>
                r.name === result.name || r.name === remarkTarget.name
                  ? { ...r, remarks: result.remarks }
                  : r,
              ),
            )
            setCandidateList((prev) =>
              prev.map((r) => {
                const matchesName = remarkTarget.name && r.follow_up_name === remarkTarget.name
                const matchesRef =
                  remarkTarget.reference_doctype === r.reference_doctype &&
                  remarkTarget.reference_name === r.reference_name
                if (!matchesName && !matchesRef) return r
                return {
                  ...r,
                  follow_up_name: result.name,
                  remarks: result.remarks,
                }
              }),
            )
          }}
        />
      )}
    </div>
  )
}
