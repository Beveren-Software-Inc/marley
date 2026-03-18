import { useEffect, useState } from 'react'
import { DocDetailView } from '../ui/DocDetailView'
import { X, BookOpen } from 'lucide-react'

interface HistoryRecord {
  name: string
  patient: string
  inpatient_admission?: string
  patient_visit?: string
  creation: string
}

interface PatientHistoryListProps {
  patient?: string
  refreshKey?: number
}

export const PatientHistoryList = ({ patient, refreshKey }: PatientHistoryListProps) => {
  const [items, setItems] = useState<HistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError(null)
      try {
        const filters: [string, string, string][] = []
        if (patient) filters.push(['patient', '=', patient])
        const params = new URLSearchParams({
          doctype: 'Patient History',
          fields: JSON.stringify(['name', 'patient', 'inpatient_admission', 'patient_visit', 'creation']),
          filters: JSON.stringify(filters),
          order_by: 'creation desc',
          limit: '50',
        })
        const res = await fetch(`/api/method/frappe.client.get_list?${params}`)
        const data = await res.json()
        setItems(Array.isArray(data?.message) ? data.message : [])
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load records'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [patient, refreshKey])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-sm text-slate-500">
        <span className="w-4 h-4 border-2 border-slate-300 border-t-primary rounded-full animate-spin mr-2" />
        Loading Patient Histories...
      </div>
    )
  }
  if (error) {
    return <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">{error.message}</div>
  }
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <BookOpen className="w-8 h-8 text-slate-300 mb-2" />
        <p className="text-sm text-slate-500 mb-1">No patient history records yet</p>
        <p className="text-xs text-slate-400">Use the + button to record a new history</p>
      </div>
    )
  }

  return (
    <>
      <div className="border border-slate-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Record #</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Patient</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Admission</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Visit</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map(row => (
              <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 py-2">
                  <button type="button" onClick={() => setDetailName(row.name)}
                    className="text-primary hover:underline font-medium text-xs">
                    {row.name}
                  </button>
                </td>
                <td className="px-3 py-2 text-slate-700 text-xs">{row.patient || '—'}</td>
                <td className="px-3 py-2 text-slate-500 text-xs">{row.inpatient_admission || '—'}</td>
                <td className="px-3 py-2 text-slate-500 text-xs">{row.patient_visit || '—'}</td>
                <td className="px-3 py-2 text-slate-500 text-xs">
                  {row.creation ? new Date(row.creation).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Right-side slide-over */}
      {detailName && (
        <div className="fixed inset-0 z-50 flex items-start justify-end"
          onClick={e => { if (e.target === e.currentTarget) setDetailName(null) }}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10 h-full w-full max-w-2xl bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Patient History</p>
                  <p className="text-sm font-semibold text-slate-800">{detailName}</p>
                </div>
              </div>
              <button type="button" onClick={() => setDetailName(null)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200"
                aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <DocDetailView doctype="Patient History" name={detailName} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
