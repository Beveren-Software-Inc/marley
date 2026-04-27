import { useState, useEffect, useRef } from 'react'
import {
  fetchServiceRequests,
  confirmPayment,
  bookLabAndForward,
  confirmSessionPayment,
  bookSession,
  type ServiceRequest
} from '../../services/serviceRequests'
import { fetchServiceRequestTemplateTypes, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'
import { StatusPill } from '../ui/StatusPill'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { DocDetailView } from '../ui/DocDetailView'
import { EditServiceRequestModal } from './EditServiceRequestModal'
import { BookConsultationSessionModal } from './BookConsultationSessionModal'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { Search, X } from 'lucide-react'

interface ServiceRequestListProps {
  patient?: string
  onLabTestCreated?: () => void
  refreshKey?: string | number
  template_dt?: string // Optional template type filter
  onCreateIPService?: (sr: ServiceRequest) => void
  /** Flag to indicate if we're in nurse/IP context */
  isNurseContext?: boolean
}

const statusColors: Record<string, string> = {
  'Completed': 'success',
  'Pending': 'warning',
  'Cancelled': 'danger',
  'Revoked': 'danger',
  'Active': 'info',
  'Draft': 'warning'
}

const SR_STATUSES = [
  'draft-Request Status',
  'active-Request Status',
  'on-hold-Request Status',
  'revoked-Request Status',
  'completed-Request Status',
  'entered-in-error-Request Status',
]

const refetch = (
  setLoading: (v: boolean) => void,
  setServiceRequests: (v: ServiceRequest[]) => void,
  setError: (v: Error | null) => void,
  patient?: string,
  template_dt?: string,
  statusFilter?: string,
  search?: string
) => {
  setLoading(true)
  fetchServiceRequests(50, 0, patient, template_dt || undefined, statusFilter || undefined, search || undefined)
    .then(setServiceRequests)
    .catch((err) => setError(err instanceof Error ? err : new Error('Failed to fetch service requests')))
    .finally(() => setLoading(false))
}

export const ServiceRequestList = ({ 
  patient, 
  onLabTestCreated, 
  refreshKey, 
  template_dt, 
  onCreateIPService,
  isNurseContext = false 
}: ServiceRequestListProps) => {
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [editServiceRequestName, setEditServiceRequestName] = useState<string | null>(null)
  const [bookingSessionSR, setBookingSessionSR] = useState<ServiceRequest | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  // Filter state
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [templateDtFilter, setTemplateDtFilter] = useState(template_dt || '')
  const [templateTypes, setTemplateTypes] = useState<LinkFieldOption[]>([])

  useEffect(() => {
    fetchServiceRequestTemplateTypes().then(setTemplateTypes).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-portal-actions-menu]')) return
      if (el.closest('button[aria-label="Actions"]')) return
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    setError(null)
    refetch(setLoading, setServiceRequests, setError, patient, templateDtFilter, statusFilter, search)
  }, [patient, refreshKey, templateDtFilter, statusFilter])

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      refetch(setLoading, setServiceRequests, setError, patient, templateDtFilter, statusFilter, search)
    }, 350)
    return () => clearTimeout(t)
  }, [search])

  const doRefetch = () => refetch(setLoading, setServiceRequests, setError, patient, templateDtFilter, statusFilter, search)

  const handleConfirmPayment = async (sr: ServiceRequest) => {
    setOpenActionRow(null)
    setActionLoading(sr.name)
    try {
      await confirmPayment(sr.name)
      toast.success('Payment confirmed')
      doRefetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm payment')
    } finally {
      setActionLoading(null)
    }
  }

  const handleBookLab = async (sr: ServiceRequest) => {
    setOpenActionRow(null)
    setActionLoading(sr.name)
    try {
      const result = await bookLabAndForward(sr.name)
      if (result?.lab_tests && result.count) {
        toast.success(`${result.count} Lab Test${result.count !== 1 ? 's' : ''} created and forwarded to laboratory`)
      } else {
        toast.success(result?.lab_test ? `Lab Test ${result.lab_test} created and forwarded` : 'Forwarded to laboratory')
      }
      onLabTestCreated?.()
      doRefetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to book lab')
    } finally {
      setActionLoading(null)
    }
  }

  const handleEdit = (sr: ServiceRequest) => {
    setOpenActionRow(null)
    setEditServiceRequestName(sr.name)
  }

  const handleConfirmSessionPayment = async (sr: ServiceRequest) => {
    setOpenActionRow(null)
    setActionLoading(sr.name)
    try {
      await confirmSessionPayment(sr.name)
      toast.success('Payment confirmed')
      doRefetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm payment')
    } finally {
      setActionLoading(null)
    }
  }

  const handleBookSession = async (sr: ServiceRequest) => {
    setOpenActionRow(null)
    // Consultation Service Template → open slot-picker modal
    if (sr.template_dt === 'Consultation Service Template') {
      setBookingSessionSR(sr)
      return
    }
    // All other non-lab types → book directly
    setActionLoading(sr.name)
    try {
      const result = await bookSession(sr.name)
      if (result.created) {
        toast.success(`${result.created.doctype} ${result.created.name} created and session booked`)
      } else {
        toast.success('Session booked successfully')
      }
      doRefetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to book session')
    } finally {
      setActionLoading(null)
    }
  }

  const getStatusColor = (status?: string): string => {
    if (!status) return 'default'
    
    const statusLower = status.toLowerCase()
    if (statusLower.includes('completed')) return 'success'
    if (statusLower.includes('pending')) return 'warning'
    if (statusLower.includes('cancelled') || statusLower.includes('revoked')) return 'danger'
    if (statusLower.includes('active')) return 'info'
    return statusColors[status] || 'default'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading service requests...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Service Requests</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-full">
      {/* ── FILTER BAR ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by SR ID..."
            className="w-full pl-8 pr-8 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Template Type filter (only if not fixed by prop) */}
        {!template_dt && (
          <select
            value={templateDtFilter}
            onChange={(e) => setTemplateDtFilter(e.target.value)}
            className="py-2 px-3 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-slate-700 min-w-[170px]"
          >
            <option value="">All Template Types</option>
            {templateTypes.map((t) => (
              <option key={t.name} value={t.name}>{t.label || t.name}</option>
            ))}
          </select>
        )}

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="py-2 px-3 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-slate-700 min-w-[140px]"
        >
          <option value="">All Statuses</option>
          {SR_STATUSES.map((s) => (
            <option key={s} value={s}>{s.split('-')[0].replace(/-/g, ' ')
              .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</option>
          ))}
        </select>

        {/* Clear filters */}
        {(search || statusFilter || (templateDtFilter && !template_dt)) && (
          <button
            type="button"
            onClick={() => { setSearch(''); setStatusFilter(''); if (!template_dt) setTemplateDtFilter('') }}
            className="text-xs text-slate-500 hover:text-slate-700 underline whitespace-nowrap"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-8 text-slate-500 text-sm">Loading...</div>
      ) : serviceRequests.length === 0 ? (
        <div className="flex items-center justify-center p-8 text-slate-500 text-sm">No service requests found</div>
      ) : (
      <table className="w-full min-w-[1000px]">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Service Request ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Patient
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Test Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Practitioner
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Order Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Cost
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[220px]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {serviceRequests.map((sr) => {
            const isLab = sr.template_dt === 'Lab Test Template'
            const isIPService = sr.template_dt === 'Healthcare Service Template'
            const accepted = !!sr.patient_accepted_cost
            const booked = !!sr.booked
            const loadingThis = actionLoading === sr.name
            
            // Determine what action button to show after payment confirmation
            const shouldShowBookingAction = accepted && !booked
            
            return (
              <tr key={sr.name} className="hover:bg-slate-50">
                <td
                  className="px-4 py-3 text-sm font-medium text-primary cursor-pointer hover:underline"
                  onClick={() => setDetailName(sr.name)}
                >
                  {sr.name}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {sr.patient_name || sr.patient || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {sr.template_name || sr.template_dn || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {sr.practitioner_name || sr.practitioner || '-'}
                </td>
                <td className="px-4 py-3">
                  {sr.status ? (
                    <StatusPill
                      status={sr.status}
                      color={getStatusColor(sr.status)}
                    />
                  ) : (
                    <span className="text-sm text-slate-500">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {sr.order_date
                    ? new Date(sr.order_date).toLocaleDateString()
                    : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {typeof sr.cost === 'number' ? sr.cost.toFixed(3) : sr.amount != null ? sr.amount.toFixed(3) : '-'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    
                    <div className="relative inline-block" ref={openActionRow === sr.name ? actionMenuRef : undefined}>
                      <button
                        type="button"
                        onClick={() => setOpenActionRow((prev) => (prev === sr.name ? null : sr.name))}
                        disabled={!!actionLoading}
                        className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        aria-label="Actions"
                      >
                        {loadingThis ? (
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
                      <PortalActionsMenu
                        open={openActionRow === sr.name}
                        onClose={() => setOpenActionRow(null)}
                        triggerRef={actionMenuRef}
                        minWidth={180}
                      >
                        {/* ── CONFIRM PAYMENT (for all types) ── */}
                        {!accepted && (
                          <>
                            {isLab ? (
                              <button
                                type="button"
                                onClick={() => handleConfirmPayment(sr)}
                                disabled={loadingThis}
                                className="block w-full text-left px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                              >
                                Confirm Payment
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleConfirmSessionPayment(sr)}
                                disabled={loadingThis}
                                className="block w-full text-left px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                              >
                                Confirm Payment
                              </button>
                            )}
                          </>
                        )}

                        {/* ── BOOK ACTION (after payment confirmed) ── */}
                        {shouldShowBookingAction && (
                          <>
                            {/* Lab Test Template → Book Lab */}
                            {isLab && (
                              <button
                                type="button"
                                onClick={() => handleBookLab(sr)}
                                disabled={loadingThis}
                                className="block w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 font-medium"
                              >
                                {loadingThis ? '…' : 'Book Lab'}
                              </button>
                            )}
                            
                            {isIPService && isNurseContext && (
                              <button
                                type="button"
                                onClick={() => handleBookSession(sr)}
                                disabled={loadingThis}
                                className="block w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 font-medium"
                              >
                                {loadingThis ? '…' : 'Book the Service'}
                              </button>
                            )}
                            
                            {/* Other templates (non-lab, non-IP) → Book Session */}
                            {!isLab && !isIPService && (
                              <button
                                type="button"
                                onClick={() => handleBookSession(sr)}
                                disabled={loadingThis}
                                className="block w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 font-medium"
                              >
                                {loadingThis ? '…' : 'Book Session'}
                              </button>
                            )}
                          </>
                        )}

                        {isIPService && onCreateIPService && !shouldShowBookingAction && (
                          <button
                            type="button"
                            onClick={() => { setOpenActionRow(null); onCreateIPService(sr) }}
                            className="block w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5"
                          >
                            Create IP Service
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleEdit(sr)}
                          className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                      </PortalActionsMenu>
                    </div>

                    {booked && (
                      <span className="text-xs text-slate-500">Booked</span>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      )}

      {detailName && (
        <DetailSlideOver
          title="Service Request"
          subtitle={detailName}
          onClose={() => setDetailName(null)}
        >
          <DocDetailView doctype="Service Request" name={detailName} onUpdate={doRefetch} />
        </DetailSlideOver>
      )}

      {editServiceRequestName && (
        <EditServiceRequestModal
          serviceRequestName={editServiceRequestName}
          onClose={() => setEditServiceRequestName(null)}
          onSuccess={doRefetch}
        />
      )}

      {bookingSessionSR && (
        <BookConsultationSessionModal
          serviceRequest={bookingSessionSR}
          onClose={() => setBookingSessionSR(null)}
          onSuccess={() => { setBookingSessionSR(null); doRefetch() }}
        />
      )}
    </div>
  )
}