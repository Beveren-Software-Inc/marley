import { useEffect, useState } from 'react'
import { fetchSleepingPatterns, type SleepingPattern } from '../../services/sleepingPattern'

interface SleepingPatternListProps {
  patient?: string
  refreshKey?: string | number
  onRowClick?: (name: string) => void
}

export const SleepingPatternList = ({ patient, refreshKey, onRowClick }: SleepingPatternListProps) => {
  const [rows, setRows] = useState<SleepingPattern[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchSleepingPatterns(50, 0, patient)
        setRows(data)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load Sleeping Pattern'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [patient, refreshKey])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading Sleeping Pattern...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Sleeping Pattern</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No Sleeping Pattern records found</div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Admission</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Patient</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Branch</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row) => (
            <tr
              key={row.name}
              className="hover:bg-slate-50 cursor-pointer"
              onClick={() =>
                onRowClick
                  ? onRowClick(row.name)
                  : window.open(`/app/sleeping-pattern/${encodeURIComponent(row.name)}`, '_blank')
              }
            >
              <td className="px-4 py-3 text-sm text-slate-800">
                {row.date ? new Date(row.date).toLocaleDateString() : '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">{row.admission_no}</td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {row.patient_name || row.file_no || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">{row.branch || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

