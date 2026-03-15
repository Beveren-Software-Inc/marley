import { useEffect, useState } from 'react'
import { fetchLongActingMedicineList, type LongActingMedicineRow } from '../../services/longActingMedicine'
import { Pill } from 'lucide-react'

const statusColors: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  Active: 'bg-green-100 text-green-800 border-green-200',
  Paused: 'bg-amber-100 text-amber-800 border-amber-200',
  Completed: 'bg-blue-100 text-blue-800 border-blue-200',
}

function formatDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface LongActingMedicineListProps {
  patient?: string
  refreshKey?: string | number
}

export const LongActingMedicineList = ({ patient, refreshKey }: LongActingMedicineListProps) => {
  const [list, setList] = useState<LongActingMedicineRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!patient) {
      setList([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    fetchLongActingMedicineList(patient)
      .then(setList)
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load')
        setList([])
      })
      .finally(() => setLoading(false))
  }, [patient, refreshKey])

  if (!patient) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-500 text-sm">
        Select a patient to view long acting medicine
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-600 text-sm">
        Loading…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-slate-500 text-sm text-center border border-dashed border-slate-200 rounded-lg">
        <Pill className="w-8 h-8 text-slate-300 mb-2" />
        <p>No long acting medicine for this patient</p>
        <p className="text-xs mt-1">Add from Prescription with “Long Acting Medication” ticked</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-slate-600">Name</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600">Frequency</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600">Start</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600">Next run</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {list.map((row) => (
            <tr key={row.name} className="hover:bg-slate-50">
              <td className="px-3 py-2">
                <a
                  href={`/app/long-acting-medicine/${encodeURIComponent(row.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  {row.name}
                </a>
              </td>
              <td className="px-3 py-2 text-slate-700">{row.frequency || '—'}</td>
              <td className="px-3 py-2 text-slate-700">{formatDate(row.start_date)}</td>
              <td className="px-3 py-2 text-slate-700">{formatDate(row.next_run_date)}</td>
              <td className="px-3 py-2">
                <span
                  className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium border ${
                    statusColors[row.status || 'Draft'] ?? 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {row.status || 'Draft'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
