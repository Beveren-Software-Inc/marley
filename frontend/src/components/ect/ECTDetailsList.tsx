import { useState, useEffect } from 'react'
import { fetchECTDetails, type ECTDetail } from '../../services/ectDetails'

interface ECTDetailsListProps {
  patient?: string
}

export const ECTDetailsList = ({ patient }: ECTDetailsListProps) => {
  const [ectDetails, setEctDetails] = useState<ECTDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadECTDetails = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchECTDetails(50, 0, patient)
        setEctDetails(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch ECT details'))
      } finally {
        setLoading(false)
      }
    }

    loadECTDetails()
  }, [patient])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading ECT details...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading ECT Details</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (ectDetails.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No ECT details found</div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Patient
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Energy
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Duration
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Success
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Doctor
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Nurse
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {ectDetails.map((ect) => (
            <tr key={ect.name} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-sm text-slate-700">
                {ect.date ? new Date(ect.date).toLocaleDateString() : '-'}
                {ect.time && ` ${ect.time}`}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {ect.patient_name || ect.patient || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {ect.energy || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {ect.duration ? `${ect.duration}` : '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {ect.success || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {ect.doctors_name || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {ect.nurse_name || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}





