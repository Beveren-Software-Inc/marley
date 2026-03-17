import { useState, useEffect, useRef } from 'react'
import { useInpatientRecords } from '../../hooks/useInpatientRecords'
import { fetchInpatientRecords } from '../../services/inpatientRecords'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { StatusPill } from '../ui/StatusPill'
import { PackageSelectionModal } from './PackageSelectionModal'
import { AdmissionFormModal } from './AdmissionFormModal'
import { ScheduleDischargeModal } from './ScheduleDischargeModal'
import { DischargeModal } from './DischargeModal'
import { TransferCostCenterModal } from './TransferCostCenterModal'
import { InpatientAdmissionDetails } from './InpatientAdmissionDetails'
import { AddVisitorModal } from './AddVisitorModal'
import { SuicidalPatientAssessmentModal } from './SuicidalPatientAssessmentModal'
import { RecoveryRoomRecordModal } from './RecoveryRoomRecordModal'
import { AnesthesiaRecordModal } from './AnesthesiaRecordModal'
import { TimeOutProcedureModal } from './TimeOutProcedureModal'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import type { InpatientRecord, InpatientPackage } from '../../services/inpatientRecords'

const statusColors: Record<string, string> = {
  'Admission Scheduled': 'warning',
  'Admitted': 'success',
  'Discharge Scheduled': 'info',
  'Discharged': 'default',
  'Cancelled': 'danger'
}

interface AdmissionListProps {
  onAdmissionSelect?: (admissionName: string) => void
  searchQuery?: string
  patient?: string
  refreshKey?: string | number
}

export const AdmissionList = ({ onAdmissionSelect, searchQuery: externalSearchQuery = '', patient, refreshKey }: AdmissionListProps = {}) => {
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null)
  const [showPackages, setShowPackages] = useState(false)
  const [showAdmissionForm, setShowAdmissionForm] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<InpatientPackage | null>(null)
  const [showScheduleDischarge, setShowScheduleDischarge] = useState(false)
  const [selectedAdmissionForDischarge, setSelectedAdmissionForDischarge] = useState<InpatientRecord | null>(null)
  const [showDischargeModal, setShowDischargeModal] = useState(false)
  const [selectedAdmissionForFinalDischarge, setSelectedAdmissionForFinalDischarge] = useState<InpatientRecord | null>(null)
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

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Actions dropdown (three-dot menu) — one row open at a time
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Slide-over detail panel (unchanged — opens on row click)
  const [detailAdmission, setDetailAdmission] = useState<string | null>(null)

  const { records, loading, error, refetch } = useInpatientRecords(
    selectedStatus || undefined,
    admissionNoFilter || externalSearchQuery || undefined,
    patient,
    practitionerFilter || undefined,
    dateFrom || undefined,
    dateTo || undefined,
    refreshKey
  )

  // --- Admission No: debounced search when dropdown is open ---
  useEffect(() => {
    if (!admissionOpen) return
    const t = setTimeout(async () => {
      try {
        const results = await fetchInpatientRecords(undefined, admissionNoQuery || undefined, patient, undefined, undefined, undefined)
        setAdmissionOptions(results.slice(0, 30).map(r => ({ value: r.name, label: `${r.name} - ${r.patient_name || r.patient || ''}` })))
      } catch (err) {
        console.error('Failed to load admission options', err)
        setAdmissionOptions([])
      }
    }, admissionNoQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [admissionNoQuery, admissionOpen, patient])

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
    setSelectedAdmissionForFinalDischarge(record)
    setShowDischargeModal(true)
  }

  const handleDischargeComplete = () => {
    setShowDischargeModal(false)
    setSelectedAdmissionForFinalDischarge(null)
    refetch()
  }

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
  }

  const statuses = ['Admission Scheduled', 'Admitted', 'Discharge Scheduled', 'Discharged', 'Cancelled']
  const hasActiveFilters = admissionNoFilter || practitionerFilter || dateFrom || dateTo || selectedStatus
  const inputClass = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white'

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
    <>
      <div className="space-y-4">
        {/* Filters — same layout as Patient Visit List */}
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

        {/* Records Table */}
        <div className="min-w-full">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Case No</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Patient</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Scheduled Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
                {onAdmissionSelect && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={onAdmissionSelect ? 5 : 4} className="px-4 py-8 text-center text-slate-500">
                    {hasActiveFilters ? 'No admissions match your filters.' : 'No admissions found'}
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.name} className="hover:bg-slate-50">

                    {/* Clickable Admission No → opens detail slide-over */}
                    <td className="px-4 py-3 text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => {
                          setDetailAdmission(record.name)
                          onAdmissionSelect?.(record.name)
                        }}
                        className="text-primary hover:underline text-left focus:outline-none"
                        title="View admission details"
                      >
                        {record.name}
                      </button>
                    </td>

                    <td className="px-4 py-3 text-sm text-slate-700">
                      {record.patient_name || record.patient}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {record.scheduled_date ? new Date(record.scheduled_date).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3">
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
                              {record.status === 'Discharge Scheduled' && (
                                <button
                                  type="button"
                                  onClick={() => { handleDischarge(record); setOpenActionRow(null) }}
                                  className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                >
                                  Discharge
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
      </div>

      {/* ── Admission Detail Slide-over ── */}
      {detailAdmission && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end"
          onClick={() => setDetailAdmission(null)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30" />

          {/* Panel */}
          <div
            className="relative z-10 h-full w-full max-w-2xl bg-white shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Inpatient Admission</p>
                <p className="text-sm font-semibold text-slate-800">{detailAdmission}</p>
              </div>
              <div className="flex items-center gap-2">
                <PrintFormatDropdown
                  doctype="Inpatient Admission"
                  docName={detailAdmission}
                  noLetterhead={0}
                  triggerPrint={1}
                  className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                />
                <button
                  type="button"
                  onClick={() => setDetailAdmission(null)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-6">
              <InpatientAdmissionDetails
                admissionName={detailAdmission}
                onUpdate={() => refetch()}
              />
            </div>
          </div>
        </div>
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

      {showDischargeModal && selectedAdmissionForFinalDischarge && (
        <DischargeModal
          admission={{
            name: selectedAdmissionForFinalDischarge.name,
            patient: selectedAdmissionForFinalDischarge.patient,
            patient_name: selectedAdmissionForFinalDischarge.patient_name
          }}
          onClose={() => { setShowDischargeModal(false); setSelectedAdmissionForFinalDischarge(null) }}
          onSuccess={handleDischargeComplete}
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
    </>
  )
}