// IPServiceDetailView.tsx
import { useState, useEffect } from 'react'
import { apiRequest } from '../../services/apiClient'
import { useFormatMoney } from '../../hooks/useFormatMoney'

interface IPServiceDetailViewProps {
  name: string
  onUpdate?: () => void
}

interface IPServiceDetail {
  name: string
  admission_no: string
  file_number: string
  patient_full_name: string
  type?: string
  category?: string
  cost_center?: string
  service_request?: string
  total_amount: number
  creation: string
  modified: string
  services: Array<{
    date: string
    service_code: string
    service_name: string
    service_type?: string
    amount: number
    note?: string
    user?: string
    invoice_num?: string
  }>
}

export const IPServiceDetailView = ({ name, onUpdate: _onUpdate}: IPServiceDetailViewProps) => {
  const formatCurrency = useFormatMoney()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<IPServiceDetail | null>(null)

  useEffect(() => {
    const fetchDetail = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await apiRequest<IPServiceDetail>(
          `/api/resource/IP Service/${encodeURIComponent(name)}`
        )
        setData(response)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load IP Service details')
      } finally {
        setLoading(false)
      }
    }

    if (name) {
      fetchDetail()
    }
  }, [name])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-700 text-sm">{error || 'Failed to load IP Service details'}</p>
      </div>
    )
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    try {
      return new Date(dateStr).toLocaleString()
    } catch {
      return dateStr
    }
  }

  const formatAmount = (amount?: number) => {
    if (amount === undefined || amount === null) return '-'
    return formatCurrency(amount)
  }

  return (
    <div className="space-y-6">
      {/* Header info */}
      <div className="bg-slate-50 rounded-lg p-4 space-y-2">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{data.name}</h3>
            <p className="text-xs text-slate-500 mt-1">
              Created: {formatDate(data.creation)} | Modified: {formatDate(data.modified)}
            </p>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            data.type === 'External Service' 
              ? 'bg-purple-100 text-purple-700' 
              : 'bg-blue-100 text-blue-700'
          }`}>
            {data.type || 'Not specified'}
          </span>
        </div>
      </div>

      {/* Patient & Admission Info */}
      <div className="border border-slate-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Patient & Admission
        </h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-slate-500">Patient Name:</span>
            <p className="font-medium text-slate-800">{data.patient_full_name || '-'}</p>
          </div>
          <div>
            <span className="text-slate-500">File Number:</span>
            <p className="font-medium text-slate-800">{data.file_number || '-'}</p>
          </div>
          <div>
            <span className="text-slate-500">Admission No:</span>
            <p className="font-medium text-primary">{data.admission_no || '-'}</p>
          </div>
          <div>
            <span className="text-slate-500">Category:</span>
            <p className="font-medium text-slate-800">{data.category || '-'}</p>
          </div>
        </div>
      </div>

      {/* Service Info */}
      <div className="border border-slate-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Service Details
        </h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-slate-500">Service Request:</span>
            <p className="font-medium text-primary">{data.service_request || '-'}</p>
          </div>
          <div>
            <span className="text-slate-500">Cost Center:</span>
            <p className="font-medium text-slate-800">{data.cost_center || '-'}</p>
          </div>
        </div>
      </div>

      {/* Services Table */}
      <div className="border border-slate-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Services Rendered
        </h4>
        
        {data.services && data.services.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Date</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Service Code</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Service Name</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">Amount</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.services.map((service, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-700">{formatDate(service.date)}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs">{service.service_code}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{service.service_name || '-'}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800">
                      {formatAmount(service.amount)}
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-xs truncate max-w-[150px]">
                      {service.note || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right font-semibold text-slate-800">
                    Total:
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-primary">
                    {formatAmount(data.total_amount)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500 text-center py-4">No services listed</p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={() => window.open(`/app/ip-service/${encodeURIComponent(data.name)}`, '_blank')}
          className="px-3 py-1.5 text-sm text-primary hover:text-primary/80 border border-primary/30 rounded-md hover:bg-primary/5 transition"
        >
          Open in New Tab
        </button>
        <button
          type="button"
          onClick={() => window.open(`/app/ip-service/${encodeURIComponent(data.name)}?print`, '_blank')}
          className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-md hover:bg-slate-50 transition"
        >
          Print
        </button>
      </div>
    </div>
  )
}