import { useState, useEffect } from 'react'
import { fetchECTDetails, type ECTDetail } from '../../services/ectDetails'
import { ECTDetailDetails } from './ECTDetailDetails'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'

interface ECTDetailsListProps {
  patient?: string
  refreshKey?: number | string
  onPatientClick?: (patient: string) => void
}

export const ECTDetailsList = ({ patient, refreshKey, onPatientClick }: ECTDetailsListProps) => {
  const [ectDetails, setEctDetails] = useState<ECTDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailEct, setDetailEct] = useState<string | null>(null)

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
  }, [patient, refreshKey])

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
    <>
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="min-w-full whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                ECT No
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Date
              </th>
              {!patient && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Patient
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Branch
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
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[100px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {ectDetails.map((ect) => (
              <tr key={ect.name} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => setDetailEct(ect.name)}
                    className="text-primary hover:underline text-left focus:outline-none"
                    title="View ECT detail"
                  >
                    {ect.name}
                  </button>
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {ect.date ? new Date(ect.date).toLocaleDateString('en-GB') : '-'}
                  {ect.time && ` ${String(ect.time).slice(0, 5)}`}
                </td>
                {!patient && (
                  <td
                    className="px-4 py-3 text-sm cursor-pointer"
                    onClick={() => ect.patient && onPatientClick?.(ect.patient)}
                  >
                    <span className="font-medium text-primary hover:underline">{ect.patient_name || ect.patient || '-'}</span>
                  </td>
                )}
                <td className="px-4 py-3 text-sm text-slate-700">
                  {ect.cost_center || '—'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {ect.energy || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {ect.duration != null ? `${ect.duration}` : '-'}
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
                <td className="px-4 py-2 align-middle">
                  <div className="flex items-center gap-1.5">
                    <PrintFormatDropdown
                      doctype="ECT Details"
                      docName={ect.name}
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

      {/* Slide-over detail panel */}
      {detailEct && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailEct(null)
          }}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10 h-full w-full max-w-2xl bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">ECT Details</p>
                <p className="text-sm font-semibold text-slate-800">{detailEct}</p>
              </div>
              <div className="flex items-center gap-2">
                <PrintFormatDropdown
                  doctype="ECT Details"
                  docName={detailEct}
                  noLetterhead={0}
                  triggerPrint={1}
                  className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                />
                <button
                  type="button"
                  onClick={() => setDetailEct(null)}
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
              <ECTDetailDetails ectName={detailEct} onUpdate={() => {}} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}