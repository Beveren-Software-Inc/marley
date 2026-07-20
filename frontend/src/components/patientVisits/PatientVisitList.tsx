import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useCardFilters, useDashboardCompactClinical, useCardHeaderSlot } from '../../contexts/CardFilterContext'
import { StatusPill } from '../ui/StatusPill'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import {
  CardRowMetaHint,
  dashboardCardRowHoverClass,
  formatDashboardDate,
  type CardMetaField,
} from '../ui/dashboardCardListing'
import { PatientVisitDetails } from './PatientVisitDetails'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { cancelVisit, type PatientVisitListRow } from '../../services/patientVisits'
import { CreateAdmissionModal } from '../admissions/CreateAdmissionModal'
import { CancelVisitModal } from './CancelVisitModal'
import { EditPatientVisitModal } from './EditPatientVisitModal'
import { toast } from '../../hooks/useToast'
import { getInvoicesByReference } from '../../services/serviceOrders'
import { fetchAppointmentPractitioners, fetchBranchOptions, getCurrentUserPractitionerOption, type LinkFieldOption } from '../../services/common'
import { formatDate } from '../../utils/formatDate'
import { fetchPatientVisitsFull, fetchPatientVisitTypes, type PatientVisitTypeOption } from '../../services/patientVisits'
import { CreatePatientReferralModal } from '../referrals/CreatePatientReferralModal'
import { CreateVitalSignModal } from '../vitalSigns/CreateVitalSignModal'
import { CreateObservationModal } from '../observations/CreateObservationModal'
import { PatientDiagnosisModal } from '../diagnosis/PatientDiagnosisModal'
import { useCareContext } from '../../providers/CareContextProvider'
import { isDoctorRole } from '../../config/permissions'
import { observationsAllowedForMode } from '../../config/costCenterCareScope'
import { useFormatMoney } from '../../hooks/useFormatMoney'
import { PaginationControls, DEFAULT_PAGE_SIZE, type PageSize } from '../ui/PaginationControls'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { UploadPatientDocumentsModal } from '../documents/UploadPatientDocumentsModal'
import { DateFilterInput } from '../ui/DateFilterInput'

const statusColors: Record<string, string> = {
  'Open': 'warning',
  'Ordered': 'info',
  'Completed': 'success',
  'Cancelled': 'danger'
}

function localDateISO(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getOpDefaultDateRange() {
  const today = localDateISO()
  return { dateFrom: today, dateTo: today }
}

interface PatientVisitListProps {
  onVisitSelect?: (visitName: string) => void
  /** Select visit in navbar (OP mode) and navigate — used from doctor/nurse lists */
  onVisitActivate?: (visit: PatientVisitListRow) => void
  onPatientFromVisit?: (patient: string) => void
  searchQuery?: string
  patient?: string
  refreshKey?: string | number
  visitType?: string
  onCreateNew?: () => void
  /** Reception portal: show linked appointment paid amount column. */
  showAppointmentAmount?: boolean
  /** Hide lab/pharmacy amount columns (e.g. Daily Auto Visits). */
  hideLabPharmacyAmounts?: boolean
  /** Doctor dashboard: detailed 15-column table (Visit No/Date/Type, File/CPR, amounts, Total Due, Discount, Balance, Doctor, User). */
  detailedColumns?: boolean
  /** Default the Doctor filter to the logged-in user's Healthcare Practitioner (any specialty). */
  defaultToCurrentPractitioner?: boolean
}

function visitPatientDisplayName(visit: PatientVisitListRow): string {
  return visit.patient_name || visit.label?.split(' - ')[1]?.trim() || '-'
}

function patientVisitCardMetaFields(
  visit: PatientVisitListRow,
  opts: { patient?: string },
): readonly CardMetaField[] {
  const fields: CardMetaField[] = [['Visit No', visit.value]]
  if (!opts.patient) {
    fields.push(['Patient', visitPatientDisplayName(visit)])
  }
  fields.push(['Doctor', visit.practitioner_name])
  return fields
}

export const PatientVisitList = ({
  onVisitSelect,
  onVisitActivate,
  onPatientFromVisit,
  searchQuery: externalSearchQuery = '',
  patient,
  refreshKey,
  visitType,
  onCreateNew,
  showAppointmentAmount = false,
  hideLabPharmacyAmounts = false,
  detailedColumns = false,
  defaultToCurrentPractitioner = false,
}: PatientVisitListProps = {}) => {
  const { mode, activeVisit, selectedPatient: contextPatient, userCostCenter, userRole } = useCareContext()
  const formatMoney = useFormatMoney()
  const formatAmount = (value?: number) => formatMoney(Number(value ?? 0))

  // When OP mode has a specific visit selected globally, lock the list to that visit.
  // Fall back to the patient prop, then context patient, for broader filtering.
  const effectiveVisitFilter = (mode === 'OP' && activeVisit) ? activeVisit : undefined
  const effectivePatient = patient ?? (contextPatient || undefined)
  /** OP browse (no active visit, not a typed sub-list): default From/To to today. */
  const shouldUseOpDefaults = !effectiveVisitFilter && !visitType
  const opDefaultsOnMount = shouldUseOpDefaults ? getOpDefaultDateRange() : null

  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const cardFilters = useCardFilters()
  const cardCompactLayout = useDashboardCompactClinical()
  const headerSlot = useCardHeaderSlot()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const isInsideCard = cardFilters !== undefined
  const [detailVisit, setDetailVisit] = useState<string | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [admissionModalVisit, setAdmissionModalVisit] = useState<PatientVisitListRow | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // --- Filter: Practitioner (custom searchable dropdown) ---
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [selectedPractitioner, setSelectedPractitioner] = useState<LinkFieldOption | null>(null)
  const [practitionerFilter, setPractitionerFilter] = useState('')
  // Visit Type filter — options from the Patient Visit Type master (name === visit_type).
  const [visitTypeFilter, setVisitTypeFilter] = useState('')
  const [visitTypeOptions, setVisitTypeOptions] = useState<PatientVisitTypeOption[]>([])
  // Effective visit type: a fixed prop (typed sub-lists) wins over the user filter.
  const effectiveVisitType = visitType || visitTypeFilter || undefined
  // Default the Doctor filter to the logged-in practitioner — ONLY for doctors, browse view only.
  // Other roles (nurse, etc.) must not get a self-filter that hides visits.
  const shouldDefaultPractitioner = defaultToCurrentPractitioner && !patient && isDoctorRole(userRole)
  const [practitionerDefaultReady, setPractitionerDefaultReady] = useState(!shouldDefaultPractitioner)
  // Branch filter — options + friendly label; defaults to the global (top-bar) branch.
  const [filterBranch, setFilterBranch] = useState('')
  const [branchOptions, setBranchOptions] = useState<LinkFieldOption[]>([])
  useEffect(() => {
    let cancelled = false
    fetchBranchOptions().then((opts) => { if (!cancelled) setBranchOptions(opts) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Load Visit Type options for the filter dropdown (skip when the type is fixed by a prop).
  useEffect(() => {
    if (visitType) return
    let cancelled = false
    fetchPatientVisitTypes().then((opts) => { if (!cancelled) setVisitTypeOptions(opts) }).catch(() => {})
    return () => { cancelled = true }
  }, [visitType])

  // Default the Doctor filter to the logged-in practitioner, then release the first fetch.
  useEffect(() => {
    if (!shouldDefaultPractitioner) return
    let cancelled = false
    getCurrentUserPractitionerOption()
      .then((opt) => {
        if (cancelled) return
        if (opt) {
          setSelectedPractitioner(opt)
          setPractitionerFilter(opt.name)
        }
      })
      .finally(() => { if (!cancelled) setPractitionerDefaultReady(true) })
    return () => { cancelled = true }
    // Resolve once on mount; user edits afterwards must not re-trigger the default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the Branch filter in sync with the global (top-bar) navbar branch.
  useEffect(() => {
    if (!userCostCenter) return
    setFilterBranch(userCostCenter)
  }, [userCostCenter])
  const branchLabel = (cc?: string) => {
    if (!cc) return '-'
    return branchOptions.find((o) => o.name === cc)?.label || cc.replace(/\s*-\s*[^-]+$/, '') || cc
  }

  const [dateFrom, setDateFrom] = useState(() => opDefaultsOnMount?.dateFrom ?? '')
  const [dateTo, setDateTo] = useState(() => opDefaultsOnMount?.dateTo ?? '')

  useLayoutEffect(() => {
    if (!shouldUseOpDefaults) return
    const { dateFrom: from, dateTo: to } = getOpDefaultDateRange()
    setDateFrom(from)
    setDateTo(to)
  }, [shouldUseOpDefaults])

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  const [totalCount, setTotalCount] = useState(0)

  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [selectedVisitForCancel, setSelectedVisitForCancel] = useState<PatientVisitListRow | null>(null)
  const [referralVisit, setReferralVisit] = useState<PatientVisitListRow | null>(null)
  const [vitalSignVisit, setVitalSignVisit] = useState<PatientVisitListRow | null>(null)
  const [observationVisit, setObservationVisit] = useState<PatientVisitListRow | null>(null)
  const [diagnosisVisit, setDiagnosisVisit] = useState<PatientVisitListRow | null>(null)
  const [uploadDocumentsVisit, setUploadDocumentsVisit] = useState<PatientVisitListRow | null>(null)
  const [editVisit, setEditVisit] = useState<PatientVisitListRow | null>(null)


  // --- Practitioner: debounced search when dropdown is open ---
  useEffect(() => {
    if (!practitionerOpen) return
    const t = setTimeout(async () => {
      try {
        const options = await fetchAppointmentPractitioners(practitionerQuery || undefined)
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
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const visitsRef = useRef<PatientVisitListRow[]>([])
  visitsRef.current = visits

  const fetchVisits = async () => {
    if (visitsRef.current.length === 0) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }
    setError(null)
    try {
      const visitSearch =
        externalSearchQuery || effectiveVisitFilter || undefined
      const response = await fetchPatientVisitsFull(
        effectivePatient,
        visitSearch,
        practitionerFilter || undefined,
        dateFrom || undefined,
        dateTo || undefined,
        selectedStatus || undefined,
        effectiveVisitType,
        pageSize,
        (page - 1) * pageSize,
        filterBranch || undefined,
      )
      setVisits(response.data)
      setTotalCount(response.total_count)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch visits'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (!practitionerDefaultReady) return
    fetchVisits()
  }, [selectedStatus, practitionerFilter, dateFrom, dateTo, effectivePatient, externalSearchQuery, refreshKey, effectiveVisitFilter, page, pageSize, visitType, visitTypeFilter, filterBranch, practitionerDefaultReady])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [selectedStatus, practitionerFilter, dateFrom, dateTo, effectivePatient, externalSearchQuery, effectiveVisitFilter, visitType, visitTypeFilter, filterBranch])

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
        setPractitionerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // --- Handlers ---
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

  const handleScheduleAdmission = (visit: PatientVisitListRow) => {
    setAdmissionModalVisit(visit)
    setOpenActionRow(null)
  }

  const handlePrintInvoice = async (visit: PatientVisitListRow) => {
    // visit.value is the Patient Visit id, not a Sales Invoice name — resolve the visit's
    // actual invoice first, otherwise printview opens a non-existent Sales Invoice.
    try {
      const invoices = await getInvoicesByReference(visit.value, 'Patient Visit', visit.patient || undefined)
      if (!invoices.length) {
        toast.error('No invoice found for this visit')
        return
      }
      const invoiceName = invoices[0].name
      const url = `/printview?doctype=Sales+Invoice&name=${encodeURIComponent(invoiceName)}&trigger_print=1&format=Standard&no_letterhead=0`
      window.open(url, '_blank')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to open invoice')
    }
  }

  const handleClearFilters = () => {
    setPractitionerFilter('')
    setPractitionerQuery('')
    setSelectedPractitioner(null)
    setDateFrom('')
    setDateTo('')
    setSelectedStatus('')
    setFilterBranch(userCostCenter || '')
    setVisitTypeFilter('')
  }

  const hasActiveFilters = Boolean(
    selectedStatus || practitionerFilter || dateFrom || dateTo || filterBranch || visitTypeFilter,
  )
  const statuses = ['Open', 'Ordered', 'Completed', 'Cancelled']
  const inputClass = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white'

  const tableColSpan = detailedColumns
    ? 17
    : cardCompactLayout
    ? 3
    : 8 +
      (patient ? 0 : 1) +
      (showAppointmentAmount ? 1 : 0) -
      (hideLabPharmacyAmounts ? 2 : 0)

  const openVisitRow = (visit: PatientVisitListRow) => {
    setDetailVisit(visit.value)
    onVisitSelect?.(visit.value)
    onVisitActivate?.(visit)
  }

  const visitMetaOptions = { patient }

  const renderVisitActionsCell = (visit: PatientVisitListRow, compact = false) => (
    <td
      className={`${compact ? 'px-3 py-2' : 'px-4 py-2'} align-middle whitespace-nowrap`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5">
        <div className="relative" ref={openActionRow === visit.value ? menuRef : undefined}>
          <button
            type="button"
            onClick={() => setOpenActionRow((prev) => (prev === visit.value ? null : visit.value))}
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
            {visit.status !== 'Cancelled' && (
              <button
                type="button"
                onClick={() => { setEditVisit(visit); setOpenActionRow(null) }}
                className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Edit Visit
              </button>
            )}
            <button
              type="button"
              onClick={() => { void handlePrintInvoice(visit); setOpenActionRow(null) }}
              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Print Invoice
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
            {visit.patient && observationsAllowedForMode(mode) && (
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
              onClick={() => { setUploadDocumentsVisit(visit); setOpenActionRow(null) }}
              className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50 w-full text-left"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload Document
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
      </div>
    </td>
  )

  const exportFilteredCsv = () => {
    const headers = [
      'Visit No',
      'Patient',
      'Doctor',
      'Encounter Date',
      ...(showAppointmentAmount ? ['Appointment Amount'] : []),
      ...(!hideLabPharmacyAmounts ? ['Lab Amount', 'Pharmacy Amount'] : []),
      'Service Amount',
      'Status',
    ]
    const rows = visits.map((v) => [
      v.value,
      v.patient_name || '',
      v.practitioner_name || '',
      v.encounter_date || '',
      ...(showAppointmentAmount ? [String(v.appointment_amount ?? 0)] : []),
      ...(!hideLabPharmacyAmounts
        ? [String(v.lab_amount ?? 0), String(v.pharmacy_amount ?? 0)]
        : []),
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
    const apptTh = showAppointmentAmount ? '<th>Appointment</th>' : ''
    const rows = visits
      .map((v) => {
        const apptTd = showAppointmentAmount
          ? `<td>${formatAmount(v.appointment_amount)}</td>`
          : ''
        const billingTds = hideLabPharmacyAmounts
          ? `<td>${formatAmount(v.service_amount)}</td>`
          : `<td>${formatAmount(v.lab_amount)}</td><td>${formatAmount(v.pharmacy_amount)}</td><td>${formatAmount(v.service_amount)}</td>`
        return `<tr><td>${v.value}</td><td>${v.patient_name || ''}</td><td>${v.practitioner_name || ''}</td><td>${v.encounter_date || ''}</td>${apptTd}${billingTds}<td>${v.status || ''}</td></tr>`
      })
      .join('')
    const billingTh = hideLabPharmacyAmounts
      ? '<th>Service</th>'
      : '<th>Lab</th><th>Pharmacy</th><th>Service</th>'
    win.document.write(`<html><head><title>Patient Visit Listing</title></head><body><h3>Patient Visit Listing</h3><table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>Visit No</th><th>Patient</th><th>Doctor</th><th>Encounter Date</th>${apptTh}${billingTh}<th>Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`)
    win.document.close()
    win.print()
  }

  return (
    <div className={`flex flex-col flex-1 min-h-0 h-full min-w-0 transition-opacity ${refreshing ? 'opacity-60 pointer-events-none' : ''}`}>
      {/* Global-context active visit banner */}
      {effectiveVisitFilter && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-xs mb-2">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          Filtered by active visit: <span className="font-semibold ml-1">{effectiveVisitFilter}</span>
        </div>
      )}

      {/* PDF / Excel export — portaled into the card header, to the left of the + button. */}
      {isInsideCard && detailedColumns && headerSlot && createPortal(
        <>
          <button type="button" onClick={printFilteredList} className="px-2.5 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-50 bg-white text-slate-700 font-medium">
            PDF
          </button>
          <button type="button" onClick={exportFilteredCsv} className="px-2.5 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-50 bg-white text-slate-700 font-medium">
            Excel
          </button>
        </>,
        headerSlot,
      )}

      {/* --- Header (hidden when inside a DashboardCard) --- */}
      {!isInsideCard && (
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-base font-semibold text-slate-800">Patient Visits</h2>
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
          <button type="button" onClick={printFilteredList} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50">PDF</button>
          <button type="button" onClick={exportFilteredCsv} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50">Excel</button>
          {onCreateNew && (
            <button
              type="button"
              onClick={onCreateNew}
              className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-lg font-bold flex-shrink-0"
              title="Create New Patient Visit"
            >
              +
            </button>
          )}
        </div>
      </div>
      )}

      {showFilters && (
      <div className="card-filter-bar flex flex-wrap gap-3 mb-4 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">From Date</label>
          <DateFilterInput
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">To Date</label>
          <DateFilterInput
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Doctor — custom searchable dropdown (matches Title style) */}
        <div data-filter-dropdown className="relative">
          <label className="block text-xs font-medium text-slate-600 mb-1">Doctor</label>
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
            placeholder="Search doctor..."
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

        {/* Date To */}

        {/* Branch */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Branch</label>
          <select
            value={filterBranch}
            onChange={e => setFilterBranch(e.target.value)}
            className={inputClass}
          >
            <option value="">Select All</option>
            {branchOptions.map(b => <option key={b.name} value={b.name}>{b.label}</option>)}
          </select>
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className={inputClass}
          >
            <option value="">Select All</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Visit Type — hidden when the type is fixed by a prop (typed sub-lists). */}
        {!visitType && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Visit Type</label>
            <select
              value={visitTypeFilter}
              onChange={e => setVisitTypeFilter(e.target.value)}
              className={inputClass}
            >
              <option value="">Select All</option>
              {visitTypeOptions.map(vt => <option key={vt.name} value={vt.name}>{vt.visit_type}</option>)}
            </select>
          </div>
        )}

        <div className="flex items-end">
          <ClearFiltersButton onClick={handleClearFilters} disabled={!hasActiveFilters} />
        </div>
      </div>
      )}

      {/* --- Visits Table --- */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden min-w-0">
        <div className="flex-1 min-h-0 overflow-auto overflow-x-auto">
        {loading && visits.length === 0 ? (
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
          <table
            className={
              detailedColumns
                ? 'w-full min-w-[1620px]'
                : cardCompactLayout
                ? 'w-full table-fixed'
                : `w-full ${hideLabPharmacyAmounts ? 'min-w-[900px]' : 'min-w-[1200px]'}`
            }
          >
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {detailedColumns ? (
                  <>
                    {['Visit No.', 'Visit Date', 'Visit Type', 'File No.', 'Patient Name', 'CPR No.', 'Services', 'Lab', 'Pharmacy', 'Total Due', 'Discount', 'Branch', 'Status', 'Balance', 'Doctor Name', 'User', 'Actions'].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </>
                ) : cardCompactLayout ? (
                  <>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Visit No
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Encounter Date
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Status
                    </th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Visit No</th>
                    {!patient && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Patient</th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Doctor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Encounter Date</th>
                    {showAppointmentAmount && (
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">
                        Appointment Amount
                      </th>
                    )}
                    {!hideLabPharmacyAmounts && (
                      <>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Lab Amount</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Pharmacy Amount</th>
                      </>
                    )}
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Service Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide w-[100px]">Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visits.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-4 py-10 text-center text-slate-400 text-sm">
                    {hasActiveFilters ? 'NO VISITS MATCH YOUR FILTERS.' : 'NO PATIENT VISITS FOUND.'}
                  </td>
                </tr>
              ) : detailedColumns ? (
                visits.map((visit) => (
                  <tr key={visit.value} className={dashboardCardRowHoverClass} onClick={() => openVisitRow(visit)}>
                    <td className="px-3 py-2.5 text-sm font-medium text-primary whitespace-nowrap">{visit.value}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap">{visit.encounter_date ? formatDate(visit.encounter_date) : '-'}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap">{visit.visit_type || '-'}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap">{visit.file_no || '-'}</td>
                    <td
                      className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap"
                      onClick={(e) => { if (visit.patient) { e.stopPropagation(); onPatientFromVisit?.(visit.patient) } }}
                    >
                      <span className={visit.patient ? 'text-primary hover:underline' : ''}>{visit.patient_name || '-'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap">{visit.cpr_no || '-'}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 text-right whitespace-nowrap">{formatAmount(visit.service_amount)}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 text-right whitespace-nowrap">{formatAmount(visit.lab_amount)}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 text-right whitespace-nowrap">{formatAmount(visit.pharmacy_amount)}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 text-right whitespace-nowrap">{formatAmount(visit.total_due ?? 0)}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 text-right whitespace-nowrap">{formatAmount(visit.discount ?? 0)}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap" title={visit.cost_center || undefined}>{branchLabel(visit.cost_center)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><StatusPill status={visit.status} color={statusColors[visit.status] || 'default'} /></td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 text-right whitespace-nowrap">{formatAmount(visit.balance ?? 0)}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap">{visit.practitioner_name || '-'}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap">{visit.user || '-'}</td>
                    {renderVisitActionsCell(visit, true)}
                  </tr>
                ))
              ) : cardCompactLayout ? (
                visits.map((visit) => (
                  <tr
                    key={visit.value}
                    className={dashboardCardRowHoverClass}
                    onClick={() => openVisitRow(visit)}
                  >
                    <td className="px-3 py-2.5 text-xs text-slate-700 align-top">
                      <span className="inline-flex items-start text-primary font-medium break-words">
                        {visit.value}
                        <CardRowMetaHint fields={patientVisitCardMetaFields(visit, visitMetaOptions)} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-700 align-top">
                      {formatDashboardDate(visit.encounter_date)}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <StatusPill status={visit.status} color={statusColors[visit.status] || 'default'} />
                    </td>
                  </tr>
                ))
              ) : visits.map(visit => (
                <tr key={visit.value} className="hover:bg-slate-50 transition-colors">
                  <td
                    className="px-4 py-3 text-sm font-medium text-primary hover:underline cursor-pointer"
                    onClick={() => openVisitRow(visit)}
                  >
                    {visit.value}
                  </td>
                  {!patient && (
                    <td
                      className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                      onClick={() => { if (visit.patient) onPatientFromVisit?.(visit.patient) }}
                    >
                      <span className="font-medium text-primary hover:underline">{visitPatientDisplayName(visit)}</span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-slate-700">{visit.practitioner_name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {visit.encounter_date
                      ? new Date(visit.encounter_date).toLocaleDateString('en-GB')
                      : '-'}
                  </td>
                  {showAppointmentAmount && (
                    <td className="px-4 py-3 text-sm text-slate-700 text-right">
                      {formatAmount(visit.appointment_amount)}
                    </td>
                  )}
                  {!hideLabPharmacyAmounts && (
                    <>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right">{formatAmount(visit.lab_amount)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right">{formatAmount(visit.pharmacy_amount)}</td>
                    </>
                  )}
                  <td className="px-4 py-3 text-sm text-slate-700 text-right">{formatAmount(visit.service_amount)}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={visit.status} color={statusColors[visit.status] || 'default'} />
                  </td>
                  {renderVisitActionsCell(visit)}
                </tr>
              ))}
            </tbody>
          </table>
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

      {/* Edit Visit Modal */}
      {editVisit && (
        <EditPatientVisitModal
          visitName={editVisit.value}
          onClose={() => setEditVisit(null)}
          onSuccess={() => {
            setEditVisit(null)
            fetchVisits()
          }}
        />
      )}

      {/* Upload Documents Modal */}
      {uploadDocumentsVisit && (
        <UploadPatientDocumentsModal
          target={{
            doctype: 'Patient Visit',
            name: uploadDocumentsVisit.value,
            label: `Upload Documents — ${uploadDocumentsVisit.patient_name || uploadDocumentsVisit.value}`,
          }}
          onClose={() => setUploadDocumentsVisit(null)}
          onSuccess={() => setUploadDocumentsVisit(null)}
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
        <DetailSlideOver
          title="Patient Visit"
          subtitle={detailVisit}
          onClose={() => setDetailVisit(null)}
          maxWidthClass="max-w-3xl"
          headerActions={
            <PrintFormatDropdown
              doctype="Patient Visit"
              docName={detailVisit}
              noLetterhead={0}
              triggerPrint={1}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-700 shadow-sm transition hover:bg-emerald-50"
            />
          }
        >
          <PatientVisitDetails visitNo={detailVisit} onUpdate={fetchVisits} />
        </DetailSlideOver>
      )}

      {/* Admission Modal */}
      {admissionModalVisit && (
        <CreateAdmissionModal
          patientName={admissionModalVisit.patient_name || admissionModalVisit.label?.split(' - ')[1] || ''}
          encounterName={admissionModalVisit.value}
          onClose={() => setAdmissionModalVisit(null)}
          onSuccess={() => { setAdmissionModalVisit(null); fetchVisits() }}
        />
      )}
    </div>
  )
}