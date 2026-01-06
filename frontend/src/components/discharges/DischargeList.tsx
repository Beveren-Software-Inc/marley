import { useState, useEffect } from 'react'
import { fetchDischarges, type Discharge } from '../../services/discharges'
import { StatusPill } from '../ui/StatusPill'

const statusColors: Record<string, string> = {
  'Draft': 'warning',
  'Submitted': 'success',
  'Cancelled': 'danger'
}

interface DischargeListProps {
  patient?: string
  admission?: string
}

export const DischargeList = ({ patient, admission }: DischargeListProps) => {
  const [discharges, setDischarges] = useState<Discharge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadDischarges = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchDischarges(50, 0, patient, admission)
        setDischarges(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch discharges'))
      } finally {
        setLoading(false)
      }
    }

    loadDischarges()
  }, [patient, admission])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading discharges...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Discharges</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (discharges.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No discharges found</div>
      </div>
    )
  }

  const getDocStatus = (docstatus?: number): string => {
    if (docstatus === 0) return 'Draft'
    if (docstatus === 1) return 'Submitted'
    if (docstatus === 2) return 'Cancelled'
    return 'Draft'
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Discharge ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Patient
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Admission No
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Discharge Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Discharge Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Discharged By
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {discharges.map((discharge) => (
            <tr key={discharge.name} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-sm font-medium text-slate-900">
                {discharge.name}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {discharge.patient_name || discharge.file_no || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {discharge.admission || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {discharge.discharge_date 
                  ? new Date(discharge.discharge_date).toLocaleString() 
                  : '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {discharge.discharge_type || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {discharge.discharged_by_user_name || discharge.discharged_by_user || '-'}
              </td>
              <td className="px-4 py-3">
                <StatusPill
                  status={getDocStatus(discharge.docstatus)}
                  color={statusColors[getDocStatus(discharge.docstatus)] || 'default'}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}


