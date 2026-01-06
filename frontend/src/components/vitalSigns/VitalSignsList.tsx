import { useState, useEffect } from 'react'
import { fetchVitalSigns, type VitalSign } from '../../services/vitalSigns'

interface VitalSignsListProps {
  patient?: string
}

export const VitalSignsList = ({ patient }: VitalSignsListProps) => {
  const [vitalSigns, setVitalSigns] = useState<VitalSign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadVitalSigns = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchVitalSigns(50, 0, patient)
        setVitalSigns(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch vital signs'))
      } finally {
        setLoading(false)
      }
    }

    loadVitalSigns()
  }, [patient])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading vital signs...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Vital Signs</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (vitalSigns.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No vital signs found</div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Date & Time
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Patient
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Temperature
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Pulse
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              BP
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Respiratory Rate
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              SPO2
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Weight
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              BMI
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {vitalSigns.map((vs) => (
            <tr key={vs.name} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-sm text-slate-700">
                {vs.signs_date ? new Date(vs.signs_date).toLocaleDateString() : '-'}
                {vs.signs_time && ` ${vs.signs_time}`}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {vs.patient_name || vs.patient || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {vs.temperature || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {vs.pulse || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {vs.bp || (vs.bp_systolic && vs.bp_diastolic ? `${vs.bp_systolic}/${vs.bp_diastolic}` : '-')}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {vs.respiratory_rate || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {vs.spo2 || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {vs.weight || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {vs.bmi || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}


