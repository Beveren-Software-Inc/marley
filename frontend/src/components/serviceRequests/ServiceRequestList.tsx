import { useState, useEffect } from 'react'
import { fetchServiceRequests, createLabTestFromServiceRequest, type ServiceRequest } from '../../services/serviceRequests'
import { toast } from '../../hooks/useToast'
import { StatusPill } from '../ui/StatusPill'

interface ServiceRequestListProps {
  patient?: string
  onLabTestCreated?: () => void
}

const statusColors: Record<string, string> = {
  'Completed': 'success',
  'Pending': 'warning',
  'Cancelled': 'danger',
  'Revoked': 'danger',
  'Active': 'info',
  'Draft': 'warning'
}

export const ServiceRequestList = ({ patient, onLabTestCreated }: ServiceRequestListProps) => {
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadServiceRequests = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchServiceRequests(50, 0, patient, 'Lab Test Template')
        setServiceRequests(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch service requests'))
      } finally {
        setLoading(false)
      }
    }

    loadServiceRequests()
  }, [patient])

  const handleCreateLabTest = async (serviceRequestName: string) => {
    try {
      const result = await createLabTestFromServiceRequest(serviceRequestName)
      toast.success(`Lab Test ${result.name} created successfully`)
      if (onLabTestCreated) {
        onLabTestCreated()
      }
      // Refresh the list
      const response = await fetchServiceRequests(50, 0, patient, 'Lab Test Template')
      setServiceRequests(response)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create lab test'
      toast.error(errorMessage)
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
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full">
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
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {serviceRequests.map((sr) => (
            <tr key={sr.name} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-sm font-medium text-slate-900">
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
                {sr.status && !sr.status.toLowerCase().includes('completed') ? (
                  <button
                    onClick={() => handleCreateLabTest(sr.name)}
                    className="px-3 py-1.5 bg-primary text-white text-xs rounded-md hover:bg-primary/90 transition-colors whitespace-nowrap"
                    title="Create Lab Test from Service Request"
                  >
                    Create Lab Test
                  </button>
                ) : (
                  <span className="text-sm text-slate-400">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

