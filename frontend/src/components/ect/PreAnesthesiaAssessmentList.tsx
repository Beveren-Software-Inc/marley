import { useEffect, useState } from 'react'
import { DocDetailView } from '../ui/DocDetailView'
import { X } from 'lucide-react'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'

interface AssessmentRecord {
  name: string
  patient: string
  patient_name?: string
  inpatient_admission?: string
  assessment_date?: string
  asa_class?: string
  fit_for_anesthesia?: string
}

interface PreAnesthesiaAssessmentListProps {
  patient?: string
  refreshKey?: number
  onPatientClick?: (patient: string) => void
}

const fitColors: Record<string, string> = {
  'Yes':         'bg-green-100 text-green-700 border-green-200',
  'No':          'bg-red-100 text-red-700 border-red-200',
  'Conditional': 'bg-amber-100 text-amber-700 border-amber-200',
}

export const PreAnesthesiaAssessmentList = ({ patient, refreshKey, onPatientClick }: PreAnesthesiaAssessmentListProps) => {
  const [items, setItems] = useState<AssessmentRecord[]>([])
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
          doctype: 'Pre Anesthesia Assessment',
          fields: JSON.stringify(['name', 'patient', 'patient_name', 'inpatient_admission', 'assessment_date', 'asa_class', 'fit_for_anesthesia']),
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
    return <div className="flex items-center justify-center p-4 text-sm text-slate-500">Loading Pre Anesthesia Assessments...</div>
  }
  if (error) {
    return <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">{error.message}</div>
  }
  if (!items.length) {
    return <div className="flex items-center justify-center p-4 text-sm text-slate-400">No Pre Anesthesia Assessment records found</div>
  }

  return (
    <>
      <div className="border border-slate-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Record</th>
              {!patient && (
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Patient</th>
              )}
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">ASA</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Fit</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Date</th>
              <th>Actions</th>
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
                {!patient && (
                  <td
                    className="px-3 py-2 cursor-pointer"
                    onClick={() => row.patient && onPatientClick?.(row.patient)}
                  >
                    <span className="font-medium text-primary hover:underline">{row.patient_name || row.patient || '—'}</span>
                  </td>
                )}
                <td className="px-3 py-2">
                  {row.asa_class
                    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">{row.asa_class}</span>
                    : <span className="text-slate-400 text-xs">—</span>}
                </td>
                <td className="px-3 py-2">
                  {row.fit_for_anesthesia
                    ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${fitColors[row.fit_for_anesthesia] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {row.fit_for_anesthesia}
                      </span>
                    : <span className="text-slate-400 text-xs">—</span>}
                </td>
                <td className="px-3 py-2 text-slate-500 text-xs">
                  {row.assessment_date ? new Date(row.assessment_date).toLocaleDateString('en-GB') : '—'}
                </td>

                <td className="px-3 py-2 text-slate-500 text-xs">
                   <div className="flex items-center">
                                                        <PrintFormatDropdown
                                                          doctype="Pre Anesthesia Assessment"
                                                          docName={row.name}
                                                          noLetterhead={0}
                                                          triggerPrint={1}
                                                        />
                                                      </div>
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
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Pre Anesthesia Assessment</p>
                <p className="text-sm font-semibold text-slate-800">{detailName}</p>
              </div>
              <button type="button" onClick={() => setDetailName(null)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200"
                aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <DocDetailView doctype="Pre Anesthesia Assessment" name={detailName} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
