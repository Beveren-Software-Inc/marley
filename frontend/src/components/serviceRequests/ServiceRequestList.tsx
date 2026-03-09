import { useState, useEffect, useRef } from 'react'
import {
  fetchServiceRequests,
  createLabTestFromServiceRequest,
  confirmPayment,
  bookLabAndForward,
  type ServiceRequest
} from '../../services/serviceRequests'
import { toast } from '../../hooks/useToast'
import { StatusPill } from '../ui/StatusPill'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { DocDetailView } from '../ui/DocDetailView'
import { EditServiceRequestModal } from './EditServiceRequestModal'

interface ServiceRequestListProps {
  patient?: string
  onLabTestCreated?: () => void
  refreshKey?: string | number
  template_dt?: string // Optional template type filter
}

const statusColors: Record<string, string> = {
  'Completed': 'success',
  'Pending': 'warning',
  'Cancelled': 'danger',
  'Revoked': 'danger',
  'Active': 'info',
  'Draft': 'warning'
}

const refetch = (
  setLoading: (v: boolean) => void,
  setServiceRequests: (v: ServiceRequest[]) => void,
  setError: (v: Error | null) => void,
  patient?: string,
  template_dt?: string
) => {
  setLoading(true)
  fetchServiceRequests(50, 0, patient, template_dt)
    .then(setServiceRequests)
    .catch((err) => setError(err instanceof Error ? err : new Error('Failed to fetch service requests')))
    .finally(() => setLoading(false))
}

export const ServiceRequestList = ({ patient, onLabTestCreated, refreshKey, template_dt }: ServiceRequestListProps) => {
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [editServiceRequestName, setEditServiceRequestName] = useState<string | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    setError(null)
    refetch(setLoading, setServiceRequests, setError, patient, template_dt)
  }, [patient, refreshKey])

  const doRefetch = () => refetch(setLoading, setServiceRequests, setError, patient, template_dt)

  const handleCreateLabTest = async (serviceRequestName: string) => {
    setOpenActionRow(null)
    setActionLoading(serviceRequestName)
    try {
      const result = await createLabTestFromServiceRequest(serviceRequestName)
      toast.success(`Lab Test ${result.name} created successfully`)
      onLabTestCreated?.()
      doRefetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create lab test')
    } finally {
      setActionLoading(null)
    }
  }

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
      toast.success(result?.lab_test ? `Lab Test ${result.lab_test} created and forwarded` : 'Forwarded to laboratory')
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

  if (serviceRequests.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No service requests found</div>
      </div>
    )
  }

  return (
    <div className="min-w-full">
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
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[220px]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {serviceRequests.map((sr) => {
            const isLab = sr.template_dt === 'Lab Test Template'
            const accepted = !!sr.patient_accepted_cost
            const booked = !!sr.booked
            const loadingThis = actionLoading === sr.name
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
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isLab && booked && (
                      <span className="text-xs text-slate-500">Booked</span>
                    )}
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
                      {openActionRow === sr.name && (
                        <div className="absolute right-0 top-full mt-1 z-10 min-w-[180px] rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                          {isLab && !accepted && (
                            <button
                              type="button"
                              onClick={() => handleConfirmPayment(sr)}
                              disabled={loadingThis}
                              className="block w-full text-left px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                            >
                              Confirm Payment
                            </button>
                          )}
                          {isLab && accepted && !booked && (
                            <button
                              type="button"
                              onClick={() => handleBookLab(sr)}
                              disabled={loadingThis}
                              className="block w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 font-medium"
                            >
                              {loadingThis ? '…' : 'Book Lab'}
                            </button>
                          )}
                          {!isLab && sr.status && !sr.status.toLowerCase().includes('completed') && (
                            <button
                              type="button"
                              onClick={() => handleCreateLabTest(sr.name)}
                              disabled={loadingThis}
                              className="block w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5"
                            >
                              {loadingThis ? '…' : 'Create Lab Test'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEdit(sr)}
                            className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

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
    </div>
  )
}

