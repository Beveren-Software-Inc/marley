import { useState, useEffect } from 'react'
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

  useEffect(() => {
    setError(null)
    refetch(setLoading, setServiceRequests, setError, patient, template_dt)
  }, [patient, refreshKey])

  const doRefetch = () => refetch(setLoading, setServiceRequests, setError, patient, template_dt)

  const handleCreateLabTest = async (serviceRequestName: string) => {
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
                  <div className="flex flex-wrap gap-1.5">
                    {isLab && !accepted && (
                      <button
                        type="button"
                        onClick={() => handleConfirmPayment(sr)}
                        disabled={loadingThis}
                        className="px-2.5 py-1 bg-amber-600 text-white text-xs rounded-md hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap"
                        title="Confirm payment (patient accepted cost)"
                      >
                        {loadingThis ? '…' : 'Confirm Payment'}
                      </button>
                    )}
                    {isLab && accepted && !booked && (
                      <button
                        type="button"
                        onClick={() => handleBookLab(sr)}
                        disabled={loadingThis}
                        className="px-2.5 py-1 bg-primary text-white text-xs rounded-md hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
                        title="Forward to lab and add approved amount to visit"
                      >
                        {loadingThis ? '…' : 'Book Lab'}
                      </button>
                    )}
                    {!isLab && sr.status && !sr.status.toLowerCase().includes('completed') && (
                      <button
                        type="button"
                        onClick={() => handleCreateLabTest(sr.name)}
                        disabled={loadingThis}
                        className="px-2.5 py-1 bg-primary text-white text-xs rounded-md hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
                        title="Create Lab Test from Service Request"
                      >
                        {loadingThis ? '…' : 'Create Lab Test'}
                      </button>
                    )}
                    {isLab && booked && <span className="text-xs text-slate-500">Booked</span>}
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
    </div>
  )
}

