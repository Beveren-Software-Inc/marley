import { useState, useEffect } from 'react'
import { fetchPatientMedicalHistory, type PatientMedicalHistory } from '../../services/patients'

interface MedicalHistoryViewProps {
  patient?: string
}

export const MedicalHistoryView = ({ patient }: MedicalHistoryViewProps) => {
  const [medicalHistory, setMedicalHistory] = useState<PatientMedicalHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadMedicalHistory = async () => {
      if (!patient) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        const response = await fetchPatientMedicalHistory(patient)
        setMedicalHistory(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch medical history'))
      } finally {
        setLoading(false)
      }
    }

    loadMedicalHistory()
  }, [patient])

  if (!patient) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">Please select a patient to view medical history</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading medical history...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Medical History</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (!medicalHistory) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No medical history found</div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        {/* <h3 className="text-sm font-semibold text-slate-900">Patient Medical History</h3> */}
      </div>
      <div className="max-h-80 overflow-y-auto">
        {medicalHistory.patient_history_details && medicalHistory.patient_history_details.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                  Attribute
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                  Yes / No
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                  Description / Reason
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {medicalHistory.patient_history_details.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-800">
                    {row.attributes || '-'}
                  </td>
                  <td className="px-3 py-2 text-slate-800">
                    {row.yesno || '-'}
                  </td>
                  <td className="px-3 py-2 text-slate-700 whitespace-pre-wrap">
                    {row.description || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-4 py-6 text-sm text-slate-500 text-center">
            No patient medical history has been recorded yet.
          </div>
        )}
      </div>
    </div>
  )
}





