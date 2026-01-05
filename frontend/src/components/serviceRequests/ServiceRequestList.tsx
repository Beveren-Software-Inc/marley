import { useState, useEffect } from 'react'
import { fetchServiceRequests, createLabTestFromServiceRequest, type ServiceRequest } from '../../services/serviceRequests'
import { toast } from '../../hooks/useToast'

interface ServiceRequestListProps {
  patient?: string
  onLabTestCreated?: () => void
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

  const getStatusColor = (status?: string) => {
    if (!status) return 'bg-slate-100 text-slate-700'
    
    const statusLower = status.toLowerCase()
    if (statusLower.includes('completed')) return 'bg-green-100 text-green-700'
    if (statusLower.includes('pending')) return 'bg-yellow-100 text-yellow-700'
    if (statusLower.includes('cancelled') || statusLower.includes('revoked')) return 'bg-red-100 text-red-700'
    return 'bg-blue-100 text-blue-700'
  }

  if (loading) {
    return <div className="text-sm text-slate-500">Loading service requests...</div>
  }

  if (error) {
    return <div className="text-sm text-red-600">Error: {error.message}</div>
  }

  if (serviceRequests.length === 0) {
    return <div className="text-sm text-slate-500">No service requests found</div>
  }

  return (
    <div className="space-y-2">
      {serviceRequests.map((sr) => (
        <div
          key={sr.name}
          className="border border-slate-200 rounded-md p-3 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-slate-900 truncate">
                {sr.template_name || sr.template_dn || sr.name}
              </div>
              {sr.patient_name && (
                <div className="text-xs text-slate-600 mt-1">
                  Patient: {sr.patient_name}
                </div>
              )}
              {sr.practitioner_name && (
                <div className="text-xs text-slate-600">
                  Practitioner: {sr.practitioner_name}
                </div>
              )}
              {sr.order_date && (
                <div className="text-xs text-slate-500 mt-1">
                  Order Date: {new Date(sr.order_date).toLocaleDateString()}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              {sr.status && (
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(sr.status)}`}>
                  {sr.status}
                </span>
              )}
              {sr.status && !sr.status.toLowerCase().includes('completed') && (
                <button
                  onClick={() => handleCreateLabTest(sr.name)}
                  className="px-3 py-1.5 bg-primary text-white text-xs rounded-md hover:bg-primary/90 transition-colors"
                  title="Create Lab Test from Service Request"
                >
                  Create Lab Test
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

