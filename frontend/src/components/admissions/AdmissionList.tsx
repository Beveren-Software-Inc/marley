
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useCardFilters } from '../../contexts/CardFilterContext'
import { useInpatientRecords } from '../../hooks/useInpatientRecords'
import { fetchInpatientRecords } from '../../services/inpatientRecords'
import { fetchHealthcarePractitioners, fetchBranchOptions, type LinkFieldOption } from '../../services/common'
import { getUserCostCenterPermission } from '../../services/costCenterPermission'
import { useCareContext } from '../../providers/CareContextProvider'
import { PaginationControls, DEFAULT_PAGE_SIZE, type PageSize } from '../ui/PaginationControls'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { StatusPill } from '../ui/StatusPill'
import { PackageSelectionModal } from './PackageSelectionModal'
import { AdmissionFormModal } from './AdmissionFormModal'
import { ScheduleDischargeModal } from './ScheduleDischargeModal'
import { TransferCostCenterModal } from './TransferCostCenterModal'
import { InpatientAdmissionDetails } from './InpatientAdmissionDetails'
import { AddVisitorModal } from './AddVisitorModal'
import { SuicidalPatientAssessmentModal } from './SuicidalPatientAssessmentModal'
import { navigateToDischarge } from '../../utils/dischargeNavigation'
import { fetchDischargeDraftForAdmission } from '../../services/inpatientRecords'
import { RecoveryRoomRecordModal } from './RecoveryRoomRecordModal'
import { AnesthesiaRecordModal } from './AnesthesiaRecordModal'
import { TimeOutProcedureModal } from './TimeOutProcedureModal'
import { PreEctChecklistModal } from './PreEctChecklistModal'
import { ModifiedAldereteScoreModal } from './ModifiedAldereteScoreModal'
import { ECTAnesthesiaConsentModal } from '../ect/ECTAnesthesiaConsentModal'
import { PreAnesthesiaAssessmentModal } from '../ect/PreAnesthesiaAssessmentModal'
import { PhysicalExaminationModal } from '../physicalExam/PhysicalExaminationModal'
import { PatientHistoryModal } from '../patientHistory/PatientHistoryModal'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import type { InpatientRecord, InpatientPackage } from '../../services/inpatientRecords'
import { CreatePatientReferralModal } from '../referrals/CreatePatientReferralModal'
import { PatientDiagnosisModal } from '../diagnosis/PatientDiagnosisModal'
import { createInvoiceForInpatientAdmission } from '../../services/inpatientRecords' // Add this import
import { toast } from '../../hooks/useToast' // Add this import if not already present
import { Stethoscope } from 'lucide-react'
import { InpatientDiagnosisModal } from './InpatientDiagnosisModal'
import { CreateAdmissionModal } from './CreateAdmissionModal'
import { UploadPatientDocumentsModal } from '../documents/UploadPatientDocumentsModal'
import { formatAdmissionDate } from '../../utils/admissionDateTime'
import { isDoctorRole, isNurseRole } from '../../config/permissions'
import { stripDischargeFlowParams } from '../../utils/dischargeNavigation'

const statusColors: Record<string, string> = {
  'Admission Scheduled': 'warning',
  'Admitted': 'success',
  'Discharge Scheduled': 'info',
  'Discharged': 'default',
  'Cancelled': 'danger'
}

function localDateISO(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getIpDefaultFilters() {
  const today = localDateISO()
  return { status: 'Admitted', dateFrom: today, dateTo: today }
}

interface AdmissionListProps {
  onAdmissionSelect?: (admissionName: string) => void
  /** Select admission in navbar (IP mode) and go to doctor/nurse home — used from clinical portals */
  onAdmissionActivate?: (record: InpatientRecord) => void
  onPatientFromAdmission?: (patient: string) => void
  searchQuery?: string
  patient?: string
  refreshKey?: string | number
  onCreateNew?: () => void
}

export const AdmissionList = ({
  onAdmissionSelect,
  onAdmissionActivate,
  onPatientFromAdmission,
  searchQuery: externalSearchQuery = '',
  patient,
  refreshKey,
  onCreateNew,
}: AdmissionListProps = {}) => {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    mode,
    activeAdmission,
    selectedPatient: contextPatient,
    userRole,
    applyIpCareContext,
    setSelectedPatient,
  } = useCareContext()

  const effectivePatient = patient !== undefined ? (patient || undefined) : (contextPatient || undefined)
  // When IP mode has a specific admission selected globally, lock the list to that admission
  // unless a patient is in scope (dashboard patient view shows all admissions for that patient).
  const effectiveNameFilter = (mode === 'IP' && activeAdmission && !effectivePatient) ? activeAdmission : undefined
  const shouldUseIpDefaults = mode === 'IP' && !effectiveNameFilter && !effectivePatient
  const ipDefaultsOnMount = shouldUseIpDefaults ? getIpDefaultFilters() : null

  const [selectedStatus, setSelectedStatus] = useState<string>(() => ipDefaultsOnMount?.status ?? '')
  const cardFilters = useCardFilters()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const isInsideCard = cardFilters !== undefined
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null)
  const [showPackages, setShowPackages] = useState(false)
  const [showAdmissionForm, setShowAdmissionForm] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<InpatientPackage | null>(null)
  const [showScheduleDischarge, setShowScheduleDischarge] = useState(false)
  const [selectedAdmissionForDischarge, setSelectedAdmissionForDischarge] = useState<InpatientRecord | null>(null)
  const [showTransferCostCenter, setShowTransferCostCenter] = useState(false)
  const [selectedAdmissionForTransfer, setSelectedAdmissionForTransfer] = useState<InpatientRecord | null>(null)
  const [showVisitorModal, setShowVisitorModal] = useState(false)
  const [visitorAdmission, setVisitorAdmission] = useState<InpatientRecord | null>(null)
  const [showSuicideAssessment, setShowSuicideAssessment] = useState(false)
  const [suicideAssessmentAdmission, setSuicideAssessmentAdmission] = useState<InpatientRecord | null>(null)
  const [showRecoveryRoom, setShowRecoveryRoom] = useState(false)
  const [recoveryRoomAdmission, setRecoveryRoomAdmission] = useState<InpatientRecord | null>(null)
  const [showAnesthesia, setShowAnesthesia] = useState(false)
  const [anesthesiaAdmission, setAnesthesiaAdmission] = useState<InpatientRecord | null>(null)
  const [showTimeOut, setShowTimeOut] = useState(false)
  const [timeOutAdmission, setTimeOutAdmission] = useState<InpatientRecord | null>(null)
  const [showPreEct, setShowPreEct] = useState(false)
  const [preEctAdmission, setPreEctAdmission] = useState<InpatientRecord | null>(null)
  const [showAldereteScore, setShowAldereteScore] = useState(false)
  const [aldereteScoreAdmission, setAldereteScoreAdmission] = useState<InpatientRecord | null>(null)
  const [showECTAnesthesiaConsent, setShowECTAnesthesiaConsent] = useState(false)
  const [ectAnesthesiaConsentAdmission, setEctAnesthesiaConsentAdmission] = useState<InpatientRecord | null>(null)
  const [showPreAnesthesia, setShowPreAnesthesia] = useState(false)
  const [preAnesthesiaAdmission, setPreAnesthesiaAdmission] = useState<InpatientRecord | null>(null)
  const [showPhysicalExam, setShowPhysicalExam] = useState(false)
  const [physicalExamAdmission, setPhysicalExamAdmission] = useState<InpatientRecord | null>(null)
  const [showPatientHistory, setShowPatientHistory] = useState(false)
  const [patientHistoryAdmission, setPatientHistoryAdmission] = useState<InpatientRecord | null>(null)
  const [referralAdmission, setReferralAdmission] = useState<InpatientRecord | null>(null)
  const [diagnosisAdmission, setDiagnosisAdmission] = useState<InpatientRecord | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [diagnosisModalAdmission, setDiagnosisModalAdmission] = useState<InpatientRecord | null>(null)
  const [editAdmissionName, setEditAdmissionName] = useState<string | null>(null)
  const [uploadDocumentsAdmission, setUploadDocumentsAdmission] = useState<InpatientRecord | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  // --- Filter: Admission No (searchable dropdown) ---
  const [admissionNoQuery, setAdmissionNoQuery] = useState('')
  const [admissionOptions, setAdmissionOptions] = useState<{ value: string; label: string }[]>([])
  const [admissionOpen, setAdmissionOpen] = useState(false)
  const [selectedAdmissionOpt, setSelectedAdmissionOpt] = useState<{ value: string; label: string } | null>(null)
  const [admissionNoFilter, setAdmissionNoFilter] = useState('')

  // --- Filter: Practitioner (searchable dropdown) ---
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [selectedPractitioner, setSelectedPractitioner] = useState<LinkFieldOption | null>(null)
  const [practitionerFilter, setPractitionerFilter] = useState('')

  const [dateFrom, setDateFrom] = useState(() => ipDefaultsOnMount?.dateFrom ?? '')
  const [dateTo, setDateTo] = useState(() => ipDefaultsOnMount?.dateTo ?? '')

  const excludeCancelled = Boolean(effectivePatient && !selectedStatus && !effectiveNameFilter)

  // Branch filter — options + friendly label; defaults to the global (top-bar) branch.
  const [filterBranch, setFilterBranch] = useState('')
  const [branchOptions, setBranchOptions] = useState<LinkFieldOption[]>([])
  useEffect(() => {
    let cancelled = false
    fetchBranchOptions().then((opts) => { if (!cancelled) setBranchOptions(opts) }).catch(() => {})
    getUserCostCenterPermission().then((perm) => { if (!cancelled && perm?.cost_center) setFilterBranch(perm.cost_center) }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  const branchLabel = (cc?: string) => {
    if (!cc) return '-'
    return branchOptions.find((o) => o.name === cc)?.label || cc.replace(/\s*-\s*[^-]+$/, '') || cc
  }

  // IP mode: apply defaults before paint when switching into IP (avoids one unfiltered fetch).
  useLayoutEffect(() => {
    if (!shouldUseIpDefaults) return
    const defaults = getIpDefaultFilters()
    setSelectedStatus(defaults.status)
    setDateFrom(defaults.dateFrom)
    setDateTo(defaults.dateTo)
  }, [shouldUseIpDefaults])

  // Actions dropdown (three-dot menu) — one row open at a time
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [openActionRowHasDraft, setOpenActionRowHasDraft] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Slide-over detail panel — opens when clicking the row (not the case number)
  const [detailAdmission, setDetailAdmission] = useState<string | null>(null)

  const openAdmissionDetail = (record: InpatientRecord) => {
    setDetailAdmission(record.name)
  }

  const handleAdmissionIdClick = (e: React.MouseEvent, record: InpatientRecord) => {
    e.stopPropagation()
    if (onAdmissionActivate) {
      onAdmissionActivate(record)
      return
    }

    applyIpCareContext({
      patient: record.patient,
      admission: record.name,
      admissionLabel: record.name,
    })
    if (record.patient) {
      setSelectedPatient(record.patient)
      onPatientFromAdmission?.(record.patient)
    }

    const portal = location.pathname.startsWith('/doctor')
      ? '/doctor'
      : location.pathname.startsWith('/nurse')
        ? '/nurse'
        : isDoctorRole(userRole)
          ? '/doctor'
          : isNurseRole(userRole)
            ? '/nurse'
            : null

    if (!portal) return

    const onPortal = location.pathname.startsWith(portal)
    const params = new URLSearchParams(onPortal ? location.search : undefined)
    if (record.patient) params.set('patient', record.patient)
    params.delete('screen')
    stripDischargeFlowParams(params)
    navigate(`${portal}?${params.toString()}`, { replace: onPortal })
  }

  const { records, totalCount, loading, error, refetch } = useInpatientRecords(
    effectiveNameFilter ? undefined : (selectedStatus || undefined),
    effectiveNameFilter ?? (admissionNoFilter || externalSearchQuery || undefined),
    effectiveNameFilter ? undefined : effectivePatient,
    effectiveNameFilter ? undefined : (practitionerFilter || undefined),
    effectiveNameFilter ? undefined : (dateFrom || undefined),
    effectiveNameFilter ? undefined : (dateTo || undefined),
    refreshKey,
    pageSize,
    (page - 1) * pageSize,
    excludeCancelled,
    filterBranch || undefined
  )

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [selectedStatus, admissionNoFilter, externalSearchQuery, effectivePatient, practitionerFilter, dateFrom, dateTo, effectiveNameFilter, excludeCancelled, filterBranch])

  // --- Admission No: debounced search when dropdown is open ---
  useEffect(() => {
    if (!admissionOpen) return
    const t = setTimeout(async () => {
      try {
        const response = await fetchInpatientRecords(undefined, admissionNoQuery || undefined, effectivePatient, undefined, undefined, undefined, 30, 0, excludeCancelled)
        setAdmissionOptions(response.data.slice(0, 30).map(r => ({ value: r.name, label: `${r.name} - ${r.patient_name || r.patient || ''}` })))
      } catch (err) {
        console.error('Failed to load admission options', err)
        setAdmissionOptions([])
      }
    }, admissionNoQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [admissionNoQuery, admissionOpen, effectivePatient, excludeCancelled])

  // --- Practitioner: debounced search when dropdown is open ---
  useEffect(() => {
    if (!practitionerOpen) return
    const t = setTimeout(async () => {
      try {
        const options = await fetchHealthcarePractitioners(practitionerQuery || undefined)
        setPractitionerOptions(options)
      } catch (err) {
        console.error('Failed to load practitioners', err)
        setPractitionerOptions([])
      }
    }, practitionerQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [practitionerQuery, practitionerOpen])

  const handleAdmit = (recordName: string) => {
    setSelectedRecord(recordName)
    setShowPackages(true)
  }

  const handlePackageSelect = (pkg: InpatientPackage) => {
    setSelectedPackage(pkg)
    setShowPackages(false)
    setShowAdmissionForm(true)
  }

  const handleAdmissionComplete = () => {
    setShowAdmissionForm(false)
    setSelectedRecord(null)
    setSelectedPackage(null)
    refetch()
  }

  const handleScheduleDischarge = (record: InpatientRecord) => {
    setSelectedAdmissionForDischarge(record)
    setShowScheduleDischarge(true)
  }

  const handleDischargeScheduled = () => {
    setShowScheduleDischarge(false)
    setSelectedAdmissionForDischarge(null)
    refetch()
  }

  const handleDischarge = (record: InpatientRecord) => {
    navigateToDischarge(
      {
        name: record.name,
        patient: record.patient,
        patient_name: record.patient_name,
      },
      navigate,
      `${location.pathname}${location.search}`
    )
    setOpenActionRow(null)
  }

  const handleContinueDischarge = (record: InpatientRecord) => {
    handleDischarge(record)
  }

  useEffect(() => {
    if (!openActionRow) {
      setOpenActionRowHasDraft(false)
      return
    }
    let cancelled = false
    fetchDischargeDraftForAdmission(openActionRow)
      .then((d) => {
        if (!cancelled) setOpenActionRowHasDraft(Boolean(d?.name))
      })
      .catch(() => {
        if (!cancelled) setOpenActionRowHasDraft(false)
      })
    return () => {
      cancelled = true
    }
  }, [openActionRow])

  const handleTransferCostCenter = (record: InpatientRecord) => {
    setSelectedAdmissionForTransfer(record)
    setShowTransferCostCenter(true)
    setOpenActionRow(null)
  }

  const handleTransferComplete = () => {
    setShowTransferCostCenter(false)
    setSelectedAdmissionForTransfer(null)
    refetch()
  }

  // Add this function to handle invoice creation
  const handleCreateInvoice = async (admissionName: string) => {
    setActionLoading(admissionName + '_invoice')
    try {
      const invoice = await createInvoiceForInpatientAdmission(admissionName)
      toast.success(`Invoice created: ${invoice.sales_invoice}`)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create invoice')
    } finally {
      setActionLoading(null)
      setOpenActionRow(null)
    }
  }

  // Close actions dropdown when clicking outside (ignore portaled menu and the three-dot trigger)
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

  // Close filter dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-filter-dropdown]')) {
        setAdmissionOpen(false)
        setPractitionerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleAdmissionNoSelect = (opt: { value: string; label: string }) => {
    setSelectedAdmissionOpt(opt)
    setAdmissionNoFilter(opt.value)
    setAdmissionNoQuery('')
    setAdmissionOpen(false)
  }

  const handlePractitionerSelect = (opt: LinkFieldOption) => {
    setSelectedPractitioner(opt)
    setPractitionerFilter(opt.name)
    setPractitionerQuery('')
    setPractitionerOpen(false)
  }

  const handleClearFilters = () => {
    setAdmissionNoFilter('')
    setAdmissionNoQuery('')
    setSelectedAdmissionOpt(null)
    setPractitionerFilter('')
    setPractitionerQuery('')
    setSelectedPractitioner(null)
    setDateFrom('')
    setDateTo('')
    setSelectedStatus('')
    setFilterBranch('')
  }

  const statuses = ['Admission Scheduled', 'Admitted', 'Discharge Scheduled', 'Discharged', 'Cancelled']
  const hasActiveFilters = admissionNoFilter || practitionerFilter || dateFrom || dateTo || selectedStatus || filterBranch
  const inputClass = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white'

  const exportFilteredCsv = () => {
    const headers = ['Case No', 'Patient', 'Admission Date', 'Status']
    const rows = records.map((r) => [
      r.name,
      r.patient_name || r.patient || '',
      formatAdmissionDate(r, { fallback: '' }),
      r.status || '',
    ])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inpatient-admissions-${dateFrom || 'all'}-${dateTo || 'all'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printFilteredList = () => {
    const win = window.open('', '_blank', 'width=1200,height=800')
    if (!win) return
    const rows = records.map((r) => `<tr><td>${r.name}</td><td>${r.patient_name || r.patient || ''}</td><td>${formatAdmissionDate(r, { fallback: '' })}</td><td>${r.status || ''}</td></tr>`).join('')
    win.document.write(`<html><head><title>Inpatient Admission Listing</title></head><body><h3>Inpatient Admission Listing</h3><table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>Case No</th><th>Patient</th><th>Admission Date</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`)
    win.document.close()
    win.print()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading admissions...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Admissions</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
          <p className="text-red-600 text-xs mb-4">
            This might be due to authentication issues. Please ensure you're logged in to Frappe.
          </p>
          <button onClick={() => refetch()} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="flex flex-col flex-1 min-h-0 gap-4">
        {!isInsideCard && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-900">Admission Management</h2>
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
              className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
              title="Add Admission"
            >
              +
            </button>
          )}
          </div>
        </div>
        )}
        {/* Global-context active admission banner */}
        {effectiveNameFilter && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-xs mb-2">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            Filtered by active admission: <span className="font-semibold ml-1">{effectiveNameFilter}</span>
          </div>
        )}

        {/* Filters — same layout as Patient Visit List */}
        {!effectiveNameFilter && showFilters && (
        <div className="flex flex-wrap gap-3 mb-4 items-end">
          {/* Admission No — searchable dropdown */}
          <div data-filter-dropdown className="relative">
            <label className="block text-xs font-medium text-slate-600 mb-1">Case No</label>
            <input
              type="text"
              value={selectedAdmissionOpt ? selectedAdmissionOpt.value : admissionNoQuery}
              onChange={e => {
                setAdmissionNoQuery(e.target.value)
                setSelectedAdmissionOpt(null)
                setAdmissionNoFilter('')
                setAdmissionOpen(true)
              }}
              onFocus={() => setAdmissionOpen(true)}
              placeholder="Search admission..."
              className={`${inputClass} w-44`}
            />
            {admissionOpen && admissionOptions.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {admissionOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleAdmissionNoSelect(opt)}
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

          {/* Practitioner — searchable dropdown */}
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

          {/* Branch — dropdown (defaults to global branch) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Branch</label>
            <select
              value={filterBranch}
              onChange={e => setFilterBranch(e.target.value)}
              className={inputClass}
            >
              <option value="">All branches</option>
              {branchOptions.map(b => <option key={b.name} value={b.name}>{b.label}</option>)}
            </select>
          </div>

          {/* Status — dropdown */}
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

          {hasActiveFilters && (
            <div className="flex items-end">
              <ClearFiltersButton onClick={handleClearFilters} />
            </div>
          )}
        </div>
        )}

        {/* Records Table */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden min-w-0">
          <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full min-w-[1400px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Case No.</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">File No.</th>
                {!patient && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Patient Name</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Admission Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Admission by Doctor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Resident Doctor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Psychologist</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Room No.</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Days</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Branch</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Status</th>
                {onAdmissionSelect && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={(patient ? 10 : 11) + (onAdmissionSelect ? 1 : 0)} className="px-4 py-8 text-center text-slate-500">
                    {hasActiveFilters ? 'No admissions match your filters.' : 'No admissions found'}
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr
                    key={record.name}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => openAdmissionDetail(record)}
                  >
                    {/* Case No — select patient + IP in header (doctor/nurse home) */}
                    <td className="px-4 py-3 text-sm font-medium whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => handleAdmissionIdClick(e, record)}
                        className="text-primary hover:underline text-left focus:outline-none"
                        title="Select this admission in header"
                      >
                        {record.case_no || record.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{record.file_no || '-'}</td>

                    {!patient && (
                      <td
                        className="px-4 py-3 text-sm text-slate-700 cursor-pointer whitespace-nowrap"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (record.patient) onPatientFromAdmission?.(record.patient)
                        }}
                      >
                        <span className="font-medium text-primary hover:underline">{record.patient_name || record.patient || '-'}</span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                      {formatAdmissionDate(record)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{record.admission_doctor_name || record.admission_by_doctor || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{record.resident_doctor_name || record.residents_doctor_no || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{record.psychologist_doctor_name || record.psychologist_doctor || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{record.room_service_no || record.bed_no || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap text-center">{record.expected_length_of_stay ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap" title={record.cost_center || undefined}>{branchLabel(record.cost_center)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusPill status={record.status} color={statusColors[record.status] || 'default'} />
                    </td>

                    {onAdmissionSelect && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <div className="relative inline-block" ref={openActionRow === record.name ? menuRef : undefined}>
                            <button
                              type="button"
                              onClick={() => setOpenActionRow((prev) => (prev === record.name ? null : record.name))}
                              className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                              aria-label="Actions"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                              </svg>
                            </button>
                            <PortalActionsMenu
                              open={openActionRow === record.name}
                              onClose={() => setOpenActionRow(null)}
                              triggerRef={menuRef}
                              minWidth={200}
                            >
                              {/* Add Create Invoice button - visible for most statuses */}
                              {record.status !== 'Cancelled' && record.status !== 'Discharged' && (
                                <button
                                  type="button"
                                  onClick={() => handleCreateInvoice(record.name)}
                                  disabled={actionLoading === record.name + '_invoice'}
                                  className="block w-full text-left px-3 py-2 text-sm text-green-600 hover:bg-green-50 disabled:opacity-50"
                                >
                                  {actionLoading === record.name + '_invoice' ? 'Creating...' : 'Create Invoice'}
                                </button>
                              )}

                              {(record.status === 'Admission Scheduled' || record.status === 'Admitted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditAdmissionName(record.name)
                                    setOpenActionRow(null)
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                >
                                  Edit
                                </button>
                              )}

                              {(record.status === 'Admission Scheduled' || record.status === 'Admitted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUploadDocumentsAdmission(record)
                                    setOpenActionRow(null)
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50"
                                >
                                  Upload Document
                                </button>
                              )}
                              
                              {record.status === 'Admission Scheduled' && (
                                <button
                                  type="button"
                                  onClick={() => { handleAdmit(record.name); setOpenActionRow(null) }}
                                  className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                >
                                  Admit
                                </button>
                              )}
                              {record.status === 'Admitted' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => { handleScheduleDischarge(record); setOpenActionRow(null) }}
                                    className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                  >
                                    Schedule Discharge
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleTransferCostCenter(record)}
                                    className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                  >
                                    Transfer to Another Branch
                                  </button>
                                </>
                              )}
                              {(record.status === 'Admission Scheduled' || record.status === 'Admitted' || record.status === 'Discharge Scheduled') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVisitorAdmission(record)
                                    setShowVisitorModal(true)
                                    setOpenActionRow(null)
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                >
                                  Add Visitor
                                </button>
                              )}

                              {(record.status === 'Admission Scheduled' || record.status === 'Admitted' || record.status === 'Discharge Scheduled') && (
                                <button
                                  type="button"
                                  onClick={() => { 
                                    setDiagnosisModalAdmission(record)
                                    setOpenActionRow(null)
                                  }}
                                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-sky-700 hover:bg-sky-50"
                                >
                                  <Stethoscope className="w-3.5 h-3.5 shrink-0" />
                                  Add Diagnosis
                                </button>
                              )}

                              {(record.status === 'Admission Scheduled' || record.status === 'Admitted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSuicideAssessmentAdmission(record)
                                    setShowSuicideAssessment(true)
                                    setOpenActionRow(null)
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-purple-700 hover:bg-purple-50"
                                >
                                  Suicide Patient Assessment
                                </button>
                              )}
                              {(record.status === 'Admission Scheduled' || record.status === 'Admitted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRecoveryRoomAdmission(record)
                                    setShowRecoveryRoom(true)
                                    setOpenActionRow(null)
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-teal-700 hover:bg-teal-50"
                                >
                                  Recovery Room Record
                                </button>
                              )}
                              {(record.status === 'Admission Scheduled' || record.status === 'Admitted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAnesthesiaAdmission(record)
                                    setShowAnesthesia(true)
                                    setOpenActionRow(null)
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50"
                                >
                                  Anesthesia Record
                                </button>
                              )}
                              {(record.status === 'Admission Scheduled' || record.status === 'Admitted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTimeOutAdmission(record)
                                    setShowTimeOut(true)
                                    setOpenActionRow(null)
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-orange-700 hover:bg-orange-50"
                                >
                                  Time Out Procedure
                                </button>
                              )}
                              {(record.status === 'Admission Scheduled' || record.status === 'Admitted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreEctAdmission(record)
                                    setShowPreEct(true)
                                    setOpenActionRow(null)
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-cyan-700 hover:bg-cyan-50"
                                >
                                  Pre-ECT Checklist
                                </button>
                              )}
                              {(record.status === 'Admission Scheduled' || record.status === 'Admitted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAldereteScoreAdmission(record)
                                    setShowAldereteScore(true)
                                    setOpenActionRow(null)
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-violet-700 hover:bg-violet-50"
                                >
                                  Modified Alderete Score
                                </button>
                              )}
                              {(record.status === 'Admission Scheduled' || record.status === 'Admitted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEctAnesthesiaConsentAdmission(record)
                                    setShowECTAnesthesiaConsent(true)
                                    setOpenActionRow(null)
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
                                >
                                  ECT Anesthesia Consent
                                </button>
                              )}
                              {(record.status === 'Admission Scheduled' || record.status === 'Admitted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreAnesthesiaAdmission(record)
                                    setShowPreAnesthesia(true)
                                    setOpenActionRow(null)
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
                                >
                                  Pre Anesthesia Assessment
                                </button>
                              )}
                              {(record.status === 'Admission Scheduled' || record.status === 'Admitted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPhysicalExamAdmission(record)
                                    setShowPhysicalExam(true)
                                    setOpenActionRow(null)
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-teal-700 hover:bg-teal-50"
                                >
                                  Physical Examination
                                </button>
                              )}
                              {(record.status === 'Admission Scheduled' || record.status === 'Admitted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPatientHistoryAdmission(record)
                                    setShowPatientHistory(true)
                                    setOpenActionRow(null)
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-teal-700 hover:bg-teal-50"
                                >
                                  Patient History
                                </button>
                              )}
                              {(record.status === 'Admission Scheduled' || record.status === 'Admitted' || record.status === 'Discharge Scheduled') && (
                                <button
                                  type="button"
                                  onClick={() => { setDiagnosisAdmission(record); setOpenActionRow(null) }}
                                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-sky-700 hover:bg-sky-50"
                                >
                                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  Diagnosis
                                </button>
                              )}
                              {(record.status === 'Admission Scheduled' || record.status === 'Admitted' || record.status === 'Discharge Scheduled') && (
                                <button
                                  type="button"
                                  onClick={() => { setReferralAdmission(record); setOpenActionRow(null) }}
                                  className="block w-full text-left px-3 py-2 text-sm text-orange-700 hover:bg-orange-50"
                                >
                                  Create Referral
                                </button>
                              )}
                              {openActionRowHasDraft &&
                                record.status !== 'Cancelled' &&
                                record.status !== 'Discharged' && (
                                  <button
                                    type="button"
                                    onClick={() => handleContinueDischarge(record)}
                                    className="block w-full text-left px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50"
                                  >
                                    Continue discharge
                                  </button>
                                )}
                              {record.status === 'Discharge Scheduled' && !openActionRowHasDraft && (
                                <button
                                  type="button"
                                  onClick={() => handleContinueDischarge(record)}
                                  className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                >
                                  Discharge patient
                                </button>
                              )}
                            </PortalActionsMenu>
                          </div>
                          <PrintFormatDropdown
                            doctype="Inpatient Admission"
                            docName={record.name}
                            noLetterhead={0}
                            triggerPrint={1}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
      </div>

      {/* ── Admission Detail Slide-over ── */}
      {detailAdmission && (
        <DetailSlideOver
          title="Inpatient Admission"
          subtitle={detailAdmission}
          onClose={() => setDetailAdmission(null)}
          headerActions={
            <PrintFormatDropdown
              doctype="Inpatient Admission"
              docName={detailAdmission}
              noLetterhead={0}
              triggerPrint={1}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-emerald-200/80 bg-white text-emerald-700 shadow-sm hover:bg-emerald-50"
            />
          }
        >
          <div className="p-2">
            <InpatientAdmissionDetails admissionName={detailAdmission} onUpdate={() => refetch()} />
          </div>
        </DetailSlideOver>
      )}

      {showVisitorModal && visitorAdmission && (
        <AddVisitorModal
          admission={visitorAdmission}
          onClose={() => {
            setShowVisitorModal(false)
            setVisitorAdmission(null)
          }}
          onSuccess={() => {
            refetch()
          }}
        />
      )}

      {/* ── Existing modals ── */}
      {showPackages && selectedRecord && (
        <PackageSelectionModal
          admissionNo={selectedRecord}
          onSelect={handlePackageSelect}
          onClose={() => { setShowPackages(false); setSelectedRecord(null) }}
        />
      )}

      {showAdmissionForm && selectedRecord && selectedPackage && (
        <AdmissionFormModal
          admissionNo={selectedRecord}
          selectedPackage={selectedPackage}
          onComplete={handleAdmissionComplete}
          onClose={() => { setShowAdmissionForm(false); setSelectedRecord(null); setSelectedPackage(null) }}
        />
      )}

      {showScheduleDischarge && selectedAdmissionForDischarge && (
        <ScheduleDischargeModal
          admission={{
            name: selectedAdmissionForDischarge.name,
            patient: selectedAdmissionForDischarge.patient,
            patient_name: selectedAdmissionForDischarge.patient_name
          }}
          onClose={() => { setShowScheduleDischarge(false); setSelectedAdmissionForDischarge(null) }}
          onSuccess={handleDischargeScheduled}
        />
      )}

      {showTransferCostCenter && selectedAdmissionForTransfer && (
        <TransferCostCenterModal
          admission={{
            name: selectedAdmissionForTransfer.name,
            patient: selectedAdmissionForTransfer.patient,
            patient_name: selectedAdmissionForTransfer.patient_name,
            company: selectedAdmissionForTransfer.company,
            cost_center: selectedAdmissionForTransfer.cost_center
          }}
          onClose={() => { setShowTransferCostCenter(false); setSelectedAdmissionForTransfer(null) }}
          onSuccess={handleTransferComplete}
        />
      )}

      {showSuicideAssessment && suicideAssessmentAdmission && (
        <SuicidalPatientAssessmentModal
          admissionNo={suicideAssessmentAdmission.name}
          patient={suicideAssessmentAdmission.patient}
          patientName={suicideAssessmentAdmission.patient_name}
          onClose={() => { setShowSuicideAssessment(false); setSuicideAssessmentAdmission(null) }}
          onSuccess={() => { setShowSuicideAssessment(false); setSuicideAssessmentAdmission(null) }}
        />
      )}

      {showRecoveryRoom && recoveryRoomAdmission && (
        <RecoveryRoomRecordModal
          admissionNo={recoveryRoomAdmission.name}
          patient={recoveryRoomAdmission.patient}
          patientName={recoveryRoomAdmission.patient_name}
          onClose={() => { setShowRecoveryRoom(false); setRecoveryRoomAdmission(null) }}
          onSuccess={() => { setShowRecoveryRoom(false); setRecoveryRoomAdmission(null) }}
        />
      )}

      {showAnesthesia && anesthesiaAdmission && (
        <AnesthesiaRecordModal
          admissionNo={anesthesiaAdmission.name}
          patient={anesthesiaAdmission.patient}
          patientName={anesthesiaAdmission.patient_name}
          onClose={() => { setShowAnesthesia(false); setAnesthesiaAdmission(null) }}
          onSuccess={() => { setShowAnesthesia(false); setAnesthesiaAdmission(null) }}
        />
      )}

      {showTimeOut && timeOutAdmission && (
        <TimeOutProcedureModal
          admissionNo={timeOutAdmission.name}
          patient={timeOutAdmission.patient}
          patientName={timeOutAdmission.patient_name}
          onClose={() => { setShowTimeOut(false); setTimeOutAdmission(null) }}
          onSuccess={() => { setShowTimeOut(false); setTimeOutAdmission(null) }}
        />
      )}

      {showPreEct && preEctAdmission && (
        <PreEctChecklistModal
          admissionNo={preEctAdmission.name}
          patient={preEctAdmission.patient}
          patientName={preEctAdmission.patient_name}
          onClose={() => { setShowPreEct(false); setPreEctAdmission(null) }}
          onSuccess={() => { setShowPreEct(false); setPreEctAdmission(null) }}
        />
      )}

      {showAldereteScore && aldereteScoreAdmission && (
        <ModifiedAldereteScoreModal
          admissionNo={aldereteScoreAdmission.name}
          patient={aldereteScoreAdmission.patient}
          patientName={aldereteScoreAdmission.patient_name}
          onClose={() => { setShowAldereteScore(false); setAldereteScoreAdmission(null) }}
          onSuccess={() => { setShowAldereteScore(false); setAldereteScoreAdmission(null) }}
        />
      )}

      {diagnosisModalAdmission && (
  <InpatientDiagnosisModal
    parentDoctype="Inpatient Admission"
    parentName={diagnosisModalAdmission.name}
    patient={diagnosisModalAdmission.patient}
    patientName={diagnosisModalAdmission.patient_name}
    onClose={() => setDiagnosisModalAdmission(null)}
    onSuccess={() => {
      setDiagnosisModalAdmission(null)
      refetch() // Refresh the list
    }}
  />
)}

      {showECTAnesthesiaConsent && ectAnesthesiaConsentAdmission && (
        <ECTAnesthesiaConsentModal
          admissionNo={ectAnesthesiaConsentAdmission.name}
          patient={ectAnesthesiaConsentAdmission.patient}
          patientName={ectAnesthesiaConsentAdmission.patient_name}
          onClose={() => { setShowECTAnesthesiaConsent(false); setEctAnesthesiaConsentAdmission(null) }}
          onSuccess={() => { setShowECTAnesthesiaConsent(false); setEctAnesthesiaConsentAdmission(null) }}
        />
      )}

      {showPreAnesthesia && preAnesthesiaAdmission && (
        <PreAnesthesiaAssessmentModal
          admissionNo={preAnesthesiaAdmission.name}
          patient={preAnesthesiaAdmission.patient}
          patientName={preAnesthesiaAdmission.patient_name}
          onClose={() => { setShowPreAnesthesia(false); setPreAnesthesiaAdmission(null) }}
          onSuccess={() => { setShowPreAnesthesia(false); setPreAnesthesiaAdmission(null) }}
        />
      )}

      {showPhysicalExam && physicalExamAdmission && (
        <PhysicalExaminationModal
          admissionNo={physicalExamAdmission.name}
          patient={physicalExamAdmission.patient}
          patientName={physicalExamAdmission.patient_name}
          onClose={() => { setShowPhysicalExam(false); setPhysicalExamAdmission(null) }}
          onSuccess={() => { setShowPhysicalExam(false); setPhysicalExamAdmission(null) }}
        />
      )}

      {showPatientHistory && patientHistoryAdmission && (
        <PatientHistoryModal
          admissionNo={patientHistoryAdmission.name}
          patient={patientHistoryAdmission.patient}
          patientName={patientHistoryAdmission.patient_name}
          onClose={() => { setShowPatientHistory(false); setPatientHistoryAdmission(null) }}
          onSuccess={() => { setShowPatientHistory(false); setPatientHistoryAdmission(null) }}
        />
      )}

      {diagnosisAdmission && (
        <PatientDiagnosisModal
          parentDoctype="Inpatient Admission"
          parentName={diagnosisAdmission.name}
          patient={diagnosisAdmission.patient}
          patientName={diagnosisAdmission.patient_name}
          onClose={() => setDiagnosisAdmission(null)}
          onSuccess={() => setDiagnosisAdmission(null)}
        />
      )}

      {referralAdmission && (
        <CreatePatientReferralModal
          initialPatient={referralAdmission.patient}
          initialPatientName={referralAdmission.patient_name}
          referredFromDoctype="Inpatient Admission"
          referredFromDocname={referralAdmission.name}
          onClose={() => setReferralAdmission(null)}
          onSuccess={() => setReferralAdmission(null)}
        />
      )}

      {editAdmissionName && (
        <CreateAdmissionModal
          editAdmissionName={editAdmissionName}
          onClose={() => setEditAdmissionName(null)}
          onSuccess={() => {
            setEditAdmissionName(null)
            refetch()
            if (detailAdmission === editAdmissionName) {
              setDetailAdmission(editAdmissionName)
            }
          }}
        />
      )}

      {uploadDocumentsAdmission && (
        <UploadPatientDocumentsModal
          target={{
            doctype: 'Inpatient Admission',
            name: uploadDocumentsAdmission.name,
            label: `Upload Documents — ${uploadDocumentsAdmission.patient_name || uploadDocumentsAdmission.name}`,
          }}
          onClose={() => setUploadDocumentsAdmission(null)}
          onSuccess={() => {
            setUploadDocumentsAdmission(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}