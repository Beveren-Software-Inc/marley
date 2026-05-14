import { useState, useEffect, useRef } from 'react'
import { StatusPill } from '../ui/StatusPill'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { PatientVisitDetails } from './PatientVisitDetails'
import { cancelVisit, createInvoiceForVisit, type PatientVisitListRow } from '../../services/patientVisits'
import { CreateAdmissionModal } from '../admissions/CreateAdmissionModal'
import { CancelVisitModal } from './CancelVisitModal'
import { CreatePaymentModal } from './CreatePaymentModal'
import { toast } from '../../hooks/useToast'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { fetchPatientVisitsFull } from '../../services/patientVisits'
import { CreatePatientReferralModal } from '../referrals/CreatePatientReferralModal'
import { CreateVitalSignModal } from '../vitalSigns/CreateVitalSignModal'
import { CreateObservationModal } from '../observations/CreateObservationModal'
import { PatientDiagnosisModal } from '../diagnosis/PatientDiagnosisModal'
import { useCareContext } from '../../providers/CareContextProvider'
import { useFormatMoney } from '../../hooks/useFormatMoney'
import { PaginationControls, DEFAULT_PAGE_SIZE, type PageSize } from '../ui/PaginationControls'

const statusColors: Record<string, string> = {
  'Open': 'warning',
  'Ordered': 'info',
  'Completed': 'success',
  'Cancelled': 'danger'
}

interface PatientVisitListProps {
  onVisitSelect?: (visitName: string) => void
  onPatientFromVisit?: (patient: string) => void
  searchQuery?: string
  patient?: string
  refreshKey?: string | number
  visitType?: string
}

export const PatientVisitList = ({
  onVisitSelect,
  onPatientFromVisit,
  searchQuery: externalSearchQuery = '',
  patient,
  refreshKey,
  visitType
}: PatientVisitListProps = {}) => {
  const { mode, activeVisit, selectedPatient: contextPatient } = useCareContext()
  const formatMoney = useFormatMoney()
  const formatAmount = (value?: number) => formatMoney(Number(value ?? 0))

  // When OP mode has a specific visit selected globally, lock the list to that visit.
  // Fall back to the patient prop, then context patient, for broader filtering.
  const effectiveVisitFilter = (mode === 'OP' && activeVisit) ? activeVisit : undefined
  const effectivePatient = patient ?? (contextPatient || undefined)

  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [detailVisit, setDetailVisit] = useState<string | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [admissionModalVisit, setAdmissionModalVisit] = useState<PatientVisitListRow | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // --- Filter: Visit No (custom searchable dropdown) ---
  const [visitQuery, setVisitQuery] = useState('')
  const [visitOptions, setVisitOptions] = useState<{ value: string; label: string }[]>([])
  const [visitOpen, setVisitOpen] = useState(false)
  const [selectedVisit, setSelectedVisit] = useState<{ value: string; label: string } | null>(null)
  const [visitIdFilter, setVisitIdFilter] = useState('')

  // --- Filter: Practitioner (custom searchable dropdown) ---
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [selectedPractitioner, setSelectedPractitioner] = useState<LinkFieldOption | null>(null)
  const [practitionerFilter, setPractitionerFilter] = useState('')

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  const [totalCount, setTotalCount] = useState(0)

  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [selectedVisitForCancel, setSelectedVisitForCancel] = useState<PatientVisitListRow | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentVisit, setPaymentVisit] = useState<PatientVisitListRow | null>(null)
  const [referralVisit, setReferralVisit] = useState<PatientVisitListRow | null>(null)
  const [vitalSignVisit, setVitalSignVisit] = useState<PatientVisitListRow | null>(null)
  const [observationVisit, setObservationVisit] = useState<PatientVisitListRow | null>(null)
  const [diagnosisVisit, setDiagnosisVisit] = useState<PatientVisitListRow | null>(null)

  // --- Visit No: debounced search when dropdown is open ---
  useEffect(() => {
    if (!visitOpen) return
    const t = setTimeout(async () => {
      try {
        const response = await fetchPatientVisitsFull(effectivePatient, visitQuery || undefined)
        setVisitOptions(response.data.map(r => ({ value: r.value, label: r.label })))
      } catch (err) {
        console.error('Failed to load visit options', err)
      }
    }, visitQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [visitQuery, visitOpen, effectivePatient])

  // --- Practitioner: debounced search when dropdown is open ---
  useEffect(() => {
    if (!practitionerOpen) return
    const t = setTimeout(async () => {
      try {
        const options = await fetchHealthcarePractitioners(practitionerQuery || undefined)
        setPractitionerOptions(options)
      } catch (err) {
        console.error('Failed to load practitioners', err)
      }
    }, practitionerQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [practitionerQuery, practitionerOpen])

  // --- Fetch main visit list ---
  const [visits, setVisits] = useState<PatientVisitListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchVisits = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetchPatientVisitsFull(
        effectiveVisitFilter ? undefined : effectivePatient,
        effectiveVisitFilter ?? (visitIdFilter || externalSearchQuery || undefined),
        effectiveVisitFilter ? undefined : (practitionerFilter || undefined),
        effectiveVisitFilter ? undefined : (dateFrom || undefined),
        effectiveVisitFilter ? undefined : (dateTo || undefined),
        effectiveVisitFilter ? undefined : (selectedStatus || undefined),
        effectiveVisitFilter ? undefined : (visitType || undefined),
        pageSize,
        (page - 1) * pageSize
      )
      setVisits(response.data)
      setTotalCount(response.total_count)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch visits'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchVisits()
  }, [selectedStatus, practitionerFilter, visitIdFilter, dateFrom, dateTo, effectivePatient, externalSearchQuery, refreshKey, effectiveVisitFilter, page, pageSize])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [selectedStatus, practitionerFilter, visitIdFilter, dateFrom, dateTo, effectivePatient, externalSearchQuery, effectiveVisitFilter])

  // Close action row dropdown on outside click (ignore portaled menu and trigger button)
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

  // Close filter dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-filter-dropdown]')) {
        setVisitOpen(false)
        setPractitionerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // --- Handlers ---
  const handleVisitSelect = (opt: { value: string; label: string }) => {
    setSelectedVisit(opt)
    setVisitIdFilter(opt.value)
    setVisitQuery('')
    setVisitOpen(false)
  }

  const handlePractitionerSelect = (opt: LinkFieldOption) => {
    setSelectedPractitioner(opt)
    setPractitionerFilter(opt.name)  // opt.name is the docname sent to backend; opt.value is display text
    setPractitionerQuery('')
    setPractitionerOpen(false)
  }

  const handleCancelVisitConfirm = async (_reason: string) => {
    if (!selectedVisitForCancel) return
    setCancelLoading(true)
    try {
      await cancelVisit(selectedVisitForCancel.value, _reason)
      toast.success('Visit cancelled successfully')
      setShowCancelModal(false)
      setSelectedVisitForCancel(null)
      fetchVisits()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel visit')
    } finally {
      setCancelLoading(false)
    }
  }

  const handleCreateInvoice = async (visitName: string) => {
    setActionLoading(visitName + '_invoice')
    try {
      const invoiceName = await createInvoiceForVisit(visitName)
      toast.success('Invoice created: ' + invoiceName.sales_invoice)
      fetchVisits()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create invoice')
    } finally {
      setActionLoading(null)
      setOpenActionRow(null)
    }
  }

  const handleScheduleAdmission = (visit: PatientVisitListRow) => {
    setAdmissionModalVisit(visit)
    setOpenActionRow(null)
  }

  const handlePrintInvoice = (visitName: string) => {
    const url = `/printview?doctype=Sales+Invoice&name=${encodeURIComponent(visitName)}&trigger_print=1&format=Standard&no_letterhead=0`
    window.open(url, '_blank')
  }

  const handleClearFilters = () => {
    setVisitIdFilter('')
    setVisitQuery('')
    setSelectedVisit(null)
    setPractitionerFilter('')
    setPractitionerQuery('')
    setSelectedPractitioner(null)
    setDateFrom('')
    setDateTo('')
    setSelectedStatus('')
  }

  const hasActiveFilters = visitIdFilter || practitionerFilter || dateFrom || dateTo || selectedStatus
  const statuses = ['Open', 'Ordered', 'Completed', 'Cancelled']
  const inputClass = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white'

  const exportFilteredCsv = () => {
    const headers = ['Visit No', 'Patient', 'Practitioner', 'Encounter Date', 'Lab Amount', 'Pharmacy Amount', 'Service Amount', 'Status']
    const rows = visits.map((v) => [
      v.value,
      v.patient_name || '',
      v.practitioner_name || '',
      v.encounter_date || '',
      String(v.lab_amount ?? 0),
      String(v.pharmacy_amount ?? 0),
      String(v.service_amount ?? 0),
      v.status || '',
    ])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `patient-visits-${dateFrom || 'all'}-${dateTo || 'all'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printFilteredList = () => {
    const win = window.open('', '_blank', 'width=1200,height=800')
    if (!win) return
    const rows = visits.map((v) => `<tr><td>${v.value}</td><td>${v.patient_name || ''}</td><td>${v.practitioner_name || ''}</td><td>${v.encounter_date || ''}</td><td>${formatAmount(v.lab_amount)}</td><td>${formatAmount(v.pharmacy_amount)}</td><td>${formatAmount(v.service_amount)}</td><td>${v.status || ''}</td></tr>`).join('')
    win.document.write(`<html><head><title>Patient Visit Listing</title></head><body><h3>Patient Visit Listing</h3><table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>Visit No</th><th>Patient</th><th>Practitioner</th><th>Encounter Date</th><th>Lab</th><th>Pharmacy</th><th>Service</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`)
    win.document.close()
    win.print()
  }

  return (
    <>
      {/* Global-context active visit banner */}
      {effectiveVisitFilter && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-xs mb-2">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          Filtered by active visit: <span className="font-semibold ml-1">{effectiveVisitFilter}</span>
        </div>
      )}

      {/* --- Filters (hidden when a specific visit is globally active) --- */}
      <div className="flex items-center justify-end gap-2 mb-3">
        <button type="button" onClick={printFilteredList} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50">PDF</button>
        <button type="button" onClick={exportFilteredCsv} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50">Excel</button>
      </div>

      {!effectiveVisitFilter && (
      <div className="flex flex-wrap gap-3 mb-4 items-end">

        {/* Visit No — custom searchable dropdown (matches Title style) */}
        <div data-filter-dropdown className="relative">
          <label className="block text-xs font-medium text-slate-600 mb-1">Visit No</label>
          <input
            type="text"
            value={selectedVisit ? selectedVisit.value : visitQuery}
            onChange={e => {
              setVisitQuery(e.target.value)
              setSelectedVisit(null)
              setVisitIdFilter('')
              setVisitOpen(true)
            }}
            onFocus={() => setVisitOpen(true)}
            placeholder="Search visit..."
            className={`${inputClass} w-44`}
          />
          {visitOpen && visitOptions.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
              {visitOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleVisitSelect(opt)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                >
                  <div className="font-medium text-slate-800">{opt.value}</div>
                  {opt.label !== opt.value && (
                    <div className="text-xs text-slate-500 truncate">{opt.label}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Practitioner — custom searchable dropdown (matches Title style) */}
        <div data-filter-dropdown className="relative">
          <label className="block text-xs font-medium text-slate-600 mb-1">Practitioner</label>
          <input
            type="text"
            value={selectedPractitioner ? selectedPractitioner.label : practitionerQuery}
            onChange={e => {
              setPractitionerQuery(e.target.value)
              setSelectedPractitioner(null)
              setPractitionerFilter('')
              setPractitionerOpen(true)
            }}
            onFocus={() => setPractitionerOpen(true)}
            placeholder="Search practitioner..."
            className={`${inputClass} w-48`}
          />
          {practitionerOpen && practitionerOptions.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
              {practitionerOptions.map(opt => (
                <button
                  key={opt.name}
                  type="button"
                  onClick={() => handlePractitionerSelect(opt)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date From */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Date To */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className={inputClass}
          >
            <option value="">All</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Clear */}
        {hasActiveFilters && (
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleClearFilters}
              className="px-3 py-2 text-sm text-slate-500 border border-slate-300 rounded-md hover:bg-slate-50 hover:text-slate-700 transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
      )}

      {/* --- Visits Table --- */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center p-10 text-slate-500 text-sm">
            <svg className="animate-spin w-4 h-4 mr-2 text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading patient visits...
          </div>
        ) : error ? (
          <div className="p-8">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl">
              <h3 className="text-red-800 font-semibold mb-1">Error Loading Patient Visits</h3>
              <p className="text-red-700 text-sm mb-3">{error.message}</p>
              <button onClick={fetchVisits} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700">
                Retry
              </button>
            </div>
          </div>
        ) : (
          <table className="w-full min-w-[1200px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Visit No</th>
                {!patient && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Patient</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Practitioner</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Encounter Date</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Lab Amount</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Pharmacy Amount</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Service Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visits.length === 0 ? (
                <tr>
                  <td colSpan={patient ? 8 : 9} className="px-4 py-10 text-center text-slate-400 text-sm">
                    {hasActiveFilters ? 'No visits match your filters.' : 'No patient visits found.'}
                  </td>
                </tr>
              ) : visits.map(visit => (
                <tr key={visit.value} className="hover:bg-slate-50 transition-colors">
                  <td
                    className="px-4 py-3 text-sm font-medium text-primary hover:underline cursor-pointer"
                    onClick={() => { setDetailVisit(visit.value); onVisitSelect?.(visit.value) }}
                  >
                    {visit.value}
                  </td>
                  {!patient && (
                    <td
                      className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                      onClick={() => { if (visit.patient) onPatientFromVisit?.(visit.patient) }}
                    >
                      <span className="font-medium text-primary hover:underline">{visit.label?.split(' - ')[1] || '-'}</span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-slate-700">{visit.practitioner_name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {visit.encounter_date
                      ? new Date(visit.encounter_date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 text-right">{formatAmount(visit.lab_amount)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 text-right">{formatAmount(visit.pharmacy_amount)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 text-right">{formatAmount(visit.service_amount)}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={visit.status} color={statusColors[visit.status] || 'default'} />
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <div className="flex items-center gap-1.5">
                     

                      {/* Actions dropdown */}
                    <div className="relative" ref={openActionRow === visit.value ? menuRef : undefined}>
                      <button
                        type="button"
                        onClick={() => setOpenActionRow(prev => prev === visit.value ? null : visit.value)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                        aria-label="Actions"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                      <PortalActionsMenu
                        open={openActionRow === visit.value}
                        onClose={() => setOpenActionRow(null)}
                        triggerRef={menuRef}
                        minWidth={160}
                      >
                        <button
                          type="button"
                          onClick={() => { handlePrintInvoice(visit.value); setOpenActionRow(null) }}
                          className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          Print Invoice
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCreateInvoice(visit.value)}
                          disabled={actionLoading === visit.value + '_invoice'}
                          className="block w-full text-left px-3 py-2 text-sm text-green-600 hover:bg-green-50 disabled:opacity-50"
                        >
                          {actionLoading === visit.value + '_invoice' ? 'Creating…' : 'Create Invoice'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPaymentVisit(visit); setShowPaymentModal(true); setOpenActionRow(null) }}
                          className="block w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50"
                        >
                          Create Payment
                        </button>
                        <button
                          type="button"
                          onClick={() => handleScheduleAdmission(visit)}
                          className="block w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5"
                        >
                          Schedule Admission
                        </button>
                        <button
                          type="button"
                          onClick={() => { setReferralVisit(visit); setOpenActionRow(null) }}
                          className="block w-full text-left px-3 py-2 text-sm text-orange-700 hover:bg-orange-50"
                        >
                          Create Referral
                        </button>
                        {visit.patient && (
                          <button
                            type="button"
                            onClick={() => { setVitalSignVisit(visit); setOpenActionRow(null) }}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-teal-700 hover:bg-teal-50 w-full text-left"
                          >
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                            Create Vital Sign
                          </button>
                        )}
                        {visit.patient && (
                          <button
                            type="button"
                            onClick={() => { setObservationVisit(visit); setOpenActionRow(null) }}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-violet-700 hover:bg-violet-50 w-full text-left"
                          >
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                            Create Observation
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { setDiagnosisVisit(visit); setOpenActionRow(null) }}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-sky-700 hover:bg-sky-50 w-full text-left"
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Diagnosis
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSelectedVisitForCancel(visit); setShowCancelModal(true); setOpenActionRow(null) }}
                          className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          Cancel Visit
                        </button>
                      </PortalActionsMenu>
                    </div>
                     <PrintFormatDropdown
                        doctype="Patient Visit"
                        docName={visit.value}
                        noLetterhead={0}
                        triggerPrint={1}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <PaginationControls
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          loading={loading}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
        />
      </div>

      {/* Referral Modal */}
      {referralVisit && (
        <CreatePatientReferralModal
          initialPatient={referralVisit.patient}
          initialPatientName={referralVisit.patient_name}
          referredFromDoctype="Patient Visit"
          referredFromDocname={referralVisit.value}
          onClose={() => setReferralVisit(null)}
          onSuccess={() => setReferralVisit(null)}
        />
      )}

      {/* Vital Sign Modal */}
      {vitalSignVisit && (
        <CreateVitalSignModal
          initialPatient={vitalSignVisit.patient}
          onClose={() => setVitalSignVisit(null)}
          onSuccess={() => setVitalSignVisit(null)}
        />
      )}

      {/* Observation Modal */}
      {observationVisit && (
        <CreateObservationModal
          initialPatient={observationVisit.patient}
          onClose={() => setObservationVisit(null)}
          onSuccess={() => setObservationVisit(null)}
        />
      )}

      {/* Patient Diagnosis Modal */}
      {diagnosisVisit && (
        <PatientDiagnosisModal
          parentDoctype="Patient Visit"
          parentName={diagnosisVisit.value}
          patient={diagnosisVisit.patient}
          patientName={diagnosisVisit.patient_name}
          onClose={() => setDiagnosisVisit(null)}
          onSuccess={() => setDiagnosisVisit(null)}
        />
      )}

      {/* Cancel Modal */}
      {showCancelModal && selectedVisitForCancel && (
        <CancelVisitModal
          visitName={selectedVisitForCancel.value}
          onClose={() => { setShowCancelModal(false); setSelectedVisitForCancel(null) }}
          onConfirm={handleCancelVisitConfirm}
          loading={cancelLoading}
        />
      )}

      {/* Slide-over Detail */}
      {detailVisit && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end"
          onClick={() => setDetailVisit(null)}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative z-10 h-full w-full max-w-2xl bg-white shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Patient Visit</p>
                <p className="text-sm font-semibold text-slate-800">{detailVisit}</p>
              </div>
              <div className="flex items-center gap-2">
                <PrintFormatDropdown
                  doctype="Patient Visit"
                  docName={detailVisit}
                  noLetterhead={0}
                  triggerPrint={1}
                  className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                />
                <button
                  type="button"
                  onClick={() => setDetailVisit(null)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <PatientVisitDetails visitNo={detailVisit} onUpdate={fetchVisits} />
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && paymentVisit && (
        <CreatePaymentModal
          visitName={paymentVisit.value}
          patientName={paymentVisit.label?.split(' - ')[1] || ''}
          onClose={() => { setShowPaymentModal(false); setPaymentVisit(null) }}
          onSuccess={() => { setShowPaymentModal(false); setPaymentVisit(null); fetchVisits() }}
        />
      )}

      {/* Admission Modal */}
      {admissionModalVisit && (
        <CreateAdmissionModal
          patientName={admissionModalVisit.label?.split(' - ')[1] || ''}
          encounterName={admissionModalVisit.value}
          onClose={() => setAdmissionModalVisit(null)}
          onSuccess={() => { setAdmissionModalVisit(null); fetchVisits() }}
        />
      )}
    </>
  )
}