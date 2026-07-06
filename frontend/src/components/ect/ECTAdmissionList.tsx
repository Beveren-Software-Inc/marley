import { useEffect, useState } from 'react'
import { fetchECTAdmissions, type ECTAdmission } from '../../services/ectAdmission'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { DocDetailView } from '../ui/DocDetailView'

interface ECTAdmissionListProps {
  patient?: string
  onPatientClick?: (patient: string) => void
}

export const ECTAdmissionList = ({ patient, onPatientClick }: ECTAdmissionListProps) => {
  const [items, setItems] = useState<ECTAdmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchECTAdmissions(50, 0, patient)
        setItems(data)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load ECT Admission'))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [patient])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-slate-600">
        Loading ECT Admission...
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
      <div className="flex items-center justify-center p-4 text-sm text-slate-500">
        No ECT Admission records found
      </div>
    )
  }

  return (
    <>
      <div className="border border-slate-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">
                Name
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">
                Date
              </th>
              {!patient && (
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">
                  Patient
                </th>
              )}
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">
                BP
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase">
                HR
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase w-[70px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((row) => (
              <tr key={row.name} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setDetailName(row.name)}
                    className="text-primary hover:underline"
                    title="View ECT Admission details"
                  >
                    {row.name}
                  </button>
                </td>
                <td className="px-3 py-2">
                  {row.date ? new Date(row.date).toLocaleDateString('en-GB') : '-'}
                </td>
                {!patient && (
                  <td
                    className="px-3 py-2 cursor-pointer"
                    onClick={() => row.patient && onPatientClick?.(row.patient)}
                  >
                    <span className="font-medium text-primary hover:underline">{row.patient_name || row.patient || '-'}</span>
                  </td>
                )}
                <td className="px-3 py-2">{row.bp || '-'}</td>
                <td className="px-3 py-2">{row.hr || '-'}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end">
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

      {detailName && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailName(null)
          }}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10 h-full w-full max-w-2xl bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">ECT Admission</p>
                <p className="text-sm font-semibold text-slate-800">{detailName}</p>
              </div>
              <div className="flex items-center gap-2">
                <PrintFormatDropdown
                  doctype="ECT Admission"
                  docName={detailName}
                  noLetterhead={0}
                  triggerPrint={1}
                  className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                />
                <button
                  type="button"
                  onClick={() => setDetailName(null)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <DocDetailView doctype="ECT Admission" name={detailName} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

