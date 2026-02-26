import { useEffect, useState } from 'react'
import { fetchMorseFallScales, type MorseFallScale } from '../../services/morseFallScale'

interface MorseFallScaleListProps {
  patient?: string
}

export const MorseFallScaleList = ({ patient }: MorseFallScaleListProps) => {
  const [rows, setRows] = useState<MorseFallScale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchMorseFallScales(50, 0, patient)
        setRows(data)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load Morse Fall Scale'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [patient])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading Morse Fall Scale...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Morse Fall Scale</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No Morse Fall Scale records found</div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Admission</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Patient</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Company</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Total Points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row) => (
            <tr
              key={row.name}
              className="hover:bg-slate-50 cursor-pointer"
              onClick={() => window.open(`/app/morse-fall-scale/${encodeURIComponent(row.name)}`, '_blank')}
            >
              <td className="px-4 py-3 text-sm text-slate-800">{row.admission_no}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{row.patient_no}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{row.company || '-'}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{row.total_points ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

