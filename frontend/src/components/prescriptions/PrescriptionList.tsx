import { useState, useEffect, useRef } from 'react'
import { fetchPrescriptions, type Prescription, type PrescriptionFilters, createPrescriptionSalesOrder } from '../../services/prescriptions'
import { toast } from '../../hooks/useToast'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { StatusPill } from '../ui/StatusPill'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { PrescriptionSlideOver } from './PrescriptionSlideOver'
import { useCareContext } from '../../providers/CareContextProvider'


const statusColors: Record<string, string> = {
  'Draft': 'default',
  'Submitted': 'info',
  'Pending': 'warning',
  'In Process': 'info',
  'Completed': 'success',
  'Cancelled': 'danger',
}

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'Pending', label: 'Pending' },
  { value: 'In Process', label: 'In Process' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Cancelled', label: 'Cancelled' },
]

interface PrescriptionListProps {
  patient?: string
  refreshKey?: string | number
  onPrescriptionSelect?: (name: string) => void
  onPatientClick?: (patient: string) => void
  careContext?: 'Patient Visit' | 'Inpatient Admission'
}

export const PrescriptionList = ({
  patient,
  refreshKey,
  onPrescriptionSelect,
  onPatientClick,
  careContext: careContextProp,
}: PrescriptionListProps) => {
  const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()

  // Derive care context from global mode when no explicit prop provided.
  const careContext = careContextProp ?? (mode === 'IP' ? 'Inpatient Admission' : 'Patient Visit')
  // Use context patient when no patient prop is passed.
  const effectivePatient = patient ?? (contextPatient || undefined)
  // Precise filter: the specific chosen visit or admission.
  const effectiveVisitFilter = (mode === 'OP' && activeVisit) ? activeVisit : undefined
  const effectiveAdmissionFilter = (mode === 'IP' && activeAdmission) ? activeAdmission : undefined
  // When a specific context is active, hide local filters (same UX as AdmissionList / PatientVisitList).
  const hasContextLock = !!(effectiveVisitFilter || effectiveAdmissionFilter)

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState('')
  const [practitionerFilter, setPractitionerFilter] = useState('')
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const filters: PrescriptionFilters = {
    patient: effectivePatient,
    status: hasContextLock ? undefined : (statusFilter || undefined),
    practitioner: hasContextLock ? undefined : (practitionerFilter || undefined),
    fromDate: hasContextLock ? undefined : (dateFrom || undefined),
    toDate: hasContextLock ? undefined : (dateTo || undefined),
    search: hasContextLock ? undefined : (searchQuery.trim() || undefined),
    careContext,
    patientEncounter: effectiveVisitFilter,
    inpatientRecord: effectiveAdmissionFilter,
  }

  const hasActiveFilters = !!(statusFilter || practitionerFilter || dateFrom || dateTo || searchQuery.trim())
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    fetchPrescriptions(50, 0, filters)
      .then(setPrescriptions)
      .catch((err) => setError(err instanceof Error ? err : new Error('Failed to fetch prescriptions')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [effectivePatient, refreshKey, statusFilter, practitionerFilter, dateFrom, dateTo, searchQuery, careContext, effectiveVisitFilter, effectiveAdmissionFilter])

  useEffect(() => {
    if (!practitionerOpen) return
    const t = setTimeout(async () => {
      try {
        const opts = await fetchHealthcarePractitioners(practitionerQuery || undefined)
        setPractitionerOptions(opts)
      } catch {
        setPractitionerOptions([])
      }
    }, practitionerQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [practitionerQuery, practitionerOpen])

  const handleClearFilters = () => {
    setStatusFilter('')
    setPractitionerFilter('')
    setPractitionerQuery('')
    setDateFrom('')
    setDateTo('')
    setSearchQuery('')
  }

  // Close actions dropdown when clicking outside (ignore portaled menu and trigger button)
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

  const handleOpenInForm = (name: string) => {
    window.open(`/app/patient-medication-order/${encodeURIComponent(name)}`, '_blank')
    setOpenActionRow(null)
  }

  const handleCreateSalesOrder = async (row: Prescription) => {
    try {
      setActionLoading(row.name)
      const res = await createPrescriptionSalesOrder(row.name)
      // Reload list so reference_doctype/reference_document_name are updated
      load()
      // Inform user and keep SO in draft for pharmacy to edit
      toast.success(`Sales Order ${res.sales_order} created as Draft`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create Sales Order'
      toast.error(msg)
    } finally {
      setActionLoading(null)
      setOpenActionRow(null)
    }
  }

  const handleEditSalesOrder = (row: Prescription) => {
    if (!row.reference_document_name) return
    window.open(`/app/sales-order/${encodeURIComponent(row.reference_document_name)}`, '_blank')
    setOpenActionRow(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading prescriptions...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Prescriptions</h3>
          <p className="text-red-700 text-sm">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-full">
      {/* Active-context banner — shown when filtering by a specific visit or admission */}
      {hasContextLock && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-xs mb-2">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          {effectiveVisitFilter
            ? <>Filtered by active visit: <span className="font-semibold ml-1">{effectiveVisitFilter}</span></>
            : <>Filtered by active admission: <span className="font-semibold ml-1">{effectiveAdmissionFilter}</span></>
          }
        </div>
      )}

      {/* Filter bar — hidden when a specific context lock is active */}
      {!hasContextLock && (
      <div className="flex flex-wrap items-end gap-3 px-4 py-3 bg-white border-b border-slate-200">
        <div className="flex flex-col gap-1 min-w-[120px]">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 min-w-[180px] relative">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Practitioner</label>
          <input
            type="text"
            value={practitionerFilter ? (practitionerOptions.find((p) => p.name === practitionerFilter)?.label || practitionerFilter) : practitionerQuery}
            onChange={(e) => {
              setPractitionerQuery(e.target.value)
              setPractitionerFilter('')
              setPractitionerOpen(true)
            }}
            onFocus={() => setPractitionerOpen(true)}
            placeholder="Search practitioner..."
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {practitionerOpen && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-auto">
              {practitionerOptions.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={() => {
                    setPractitionerFilter(p.name)
                    setPractitionerQuery(p.label || p.name)
                    setPractitionerOpen(false)
                  }}
                >
                  {p.label || p.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 min-w-[120px]">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[120px]">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Search</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Prescription / patient..."
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Clear filters
          </button>
        )}
      </div>
      )}

      {prescriptions.length === 0 ? (
        <div className="flex items-center justify-center p-8">
          <div className="text-slate-500">
            {hasActiveFilters ? 'No prescriptions match your filters.' : 'No prescriptions found'}
          </div>
        </div>
      ) : (
      <table className="w-full min-w-[800px]">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Prescription
            </th>
            {!patient && (
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Patient
              </th>
            )}
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Practitioner
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Care Context
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Start / End
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[140px]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {prescriptions.map((row) => (
            <tr key={row.name} className="hover:bg-slate-50">
              <td
                className="px-4 py-3 text-sm cursor-pointer"
                onClick={() => {
                  setDetailName(row.name)
                  onPrescriptionSelect?.(row.name)
                }}
              >
                <span className="font-medium text-primary hover:underline">{row.name}</span>
              </td>
              {!patient && (
                <td
                  className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                  onClick={() => row.patient && onPatientClick?.(row.patient)}
                >
                  <span className="font-medium text-primary hover:underline">{row.patient_name || row.patient || '-'}</span>
                </td>
              )}
              <td className="px-4 py-3 text-sm text-slate-700">
                {row.healthcare_practitioner_name || row.practitioner || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {row.care_context || '-'}
              </td>
              <td className="px-4 py-3">
                <StatusPill
                  status={row.status || 'Draft'}
                  color={statusColors[row.status || ''] || 'default'}
                />
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {row.start_date
                  ? new Date(row.start_date).toLocaleDateString()
                  : '-'}
                {row.end_date ? ` – ${new Date(row.end_date).toLocaleDateString()}` : ''}
              </td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1.5">
                  <div
                    className="relative inline-block"
                    ref={openActionRow === row.name ? menuRef : undefined}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenActionRow((prev) => (prev === row.name ? null : row.name))
                      }
                      className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      aria-label="Actions"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                    <PortalActionsMenu
                      open={openActionRow === row.name}
                      onClose={() => setOpenActionRow(null)}
                      triggerRef={menuRef}
                      minWidth={200}
                    >
                      <button
                        type="button"
                        onClick={() => { setOpenActionRow(null); setDetailName(row.name) }}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                      >
                        View Details
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenInForm(row.name)}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                      >
                        Open in Form
                      </button>
                      {row.reference_doctype === 'Sales Order' && row.reference_document_name ? (
                        <button
                          type="button"
                          onClick={() => handleEditSalesOrder(row)}
                          className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          Edit Sales Order
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={actionLoading === row.name}
                          onClick={() => handleCreateSalesOrder(row)}
                          className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {actionLoading === row.name ? 'Creating Sales Order…' : 'Create Sales Order'}
                        </button>
                      )}
                    </PortalActionsMenu>
                  </div>
                  <PrintFormatDropdown
                    doctype="Patient Medication Order"
                    docName={row.name}
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

      {detailName && (
  <PrescriptionSlideOver
  prescriptionName={detailName}
  onClose={() => setDetailName(null)}
  // onUpdate={() => refetch()} ok tsr
/>
)}
    </div>
  )
}
