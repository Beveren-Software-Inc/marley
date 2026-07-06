import { useEffect, useState } from 'react'
import { DocDetailView } from '../ui/DocDetailView'
import { X } from 'lucide-react'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'

interface ConsentRecord {
  name: string
  patient: string
  patient_name?: string
  inpatient_admission?: string
  creation: string
}

interface ECTAnesthesiaConsentListProps {
  patient?: string
  refreshKey?: number
  onPatientClick?: (patient: string) => void
}

export const ECTAnesthesiaConsentList = ({ patient, refreshKey, onPatientClick }: ECTAnesthesiaConsentListProps) => {
  const [items, setItems] = useState<ConsentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const filters: [string, string, string][] = []
        if (patient) filters.push(['patient', '=', patient])
        const params = new URLSearchParams({
          doctype: 'ECT Anesthesia Consent',
          fields: JSON.stringify(['name', 'patient', 'patient_name', 'inpatient_admission', 'creation']),
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
      <div className="flex items-center justify-center p-4 text-sm text-slate-500">
        Loading ECT Anesthesia Consent records...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
        {error.message}
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-slate-400">
        No ECT Anesthesia Consent records found
      </div>
    )
  }

  return (
    <>
      <div className="border border-slate-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Consent #</th>
              {!patient && (
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Patient</th>
              )}
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Admission</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Date</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map(row => (
              <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setDetailName(row.name)}
                    className="text-primary hover:underline font-medium text-xs"
                  >
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
                <td className="px-3 py-2 text-slate-500 text-xs">
                  {row.inpatient_admission || '—'}
                </td>
                <td className="px-3 py-2 text-slate-500 text-xs">
                  {row.creation ? new Date(row.creation).toLocaleDateString('en-GB') : '—'}
                </td>
                <td className="px-3 py-2 text-slate-500 text-xs">
                   <div className="flex items-center">
                                      <PrintFormatDropdown
                                        doctype="ECT Admission"
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

      {/* Right-side detail slide-over */}
      {detailName && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end"
          onClick={e => { if (e.target === e.currentTarget) setDetailName(null) }}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10 h-full w-full max-w-2xl bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">ECT Anesthesia Consent</p>
                <p className="text-sm font-semibold text-slate-800">{detailName}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailName(null)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <DocDetailView doctype="ECT Anesthesia Consent" name={detailName} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
