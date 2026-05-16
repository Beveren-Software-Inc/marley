import { useState } from 'react'
import { useWarningMessages } from '../../hooks/useWarningMessages'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { DocDetailView } from '../ui/DocDetailView'
import type { NoPatientWarningScope } from '../../services/warningMessages'

// Helper function to strip HTML tags and clean text
const stripHtml = (html: string | undefined): string => {
  if (!html) return '-'
  
  // Create a temporary div to parse HTML
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  
  // Get text content and clean up whitespace
  const text = tmp.textContent || tmp.innerText || ''
  return text.trim().replace(/\s+/g, ' ') || '-'
}

interface WarningMessagesListProps {
  patient?: string
  /** When there is no patient filter: show only organisation notices, or all warnings (default). */
  noPatientScope?: NoPatientWarningScope
  onPatientClick?: (patient: string) => void
}

export const WarningMessagesList = ({
  patient,
  noPatientScope = 'all',
  onPatientClick,
}: WarningMessagesListProps) => {
  const { warnings, loading, error, refetch } = useWarningMessages(patient, noPatientScope)
  const [detailName, setDetailName] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading warning messages...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Warning Messages</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (warnings.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No warning messages found</div>
      </div>
    )
  }

  return (
    <div className="min-w-full">
      <table className="w-full min-w-[800px]">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {!patient && (
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Patient
              </th>
            )}
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Posting Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Practitioner
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Warning
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Reference
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {warnings.map((warning) => (
            <tr key={warning.name} className="hover:bg-slate-50">
              {!patient && (
                <td
                  className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                  onClick={() => warning.patient && onPatientClick?.(warning.patient)}
                >
                  <span className="font-medium text-primary hover:underline">
                    {warning.patient_name || warning.patient || '-'}
                  </span>
                  {warning.gender && (
                    <div className="text-xs text-slate-500">{warning.gender}</div>
                  )}
                </td>
              )}
              <td className="px-4 py-3 text-sm text-slate-700">
                {warning.type_of_warning || 'Medical'}
              </td>
              <td
                className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                onClick={() => setDetailName(warning.name)}
              >
                <span className="text-primary hover:underline">
                  {warning.posting_date
                    ? new Date(warning.posting_date).toLocaleString()
                    : '-'}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {warning.practitioner_name || warning.practitioner || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                <div className="max-w-md" title={stripHtml(warning.warning)}>
                  {stripHtml(warning.warning)}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {warning.reference_name ? (
                  <div>
                    <div className="text-xs text-slate-500">{warning.reference_doc}</div>
                    <div>{warning.reference_name}</div>
                  </div>
                ) : (
                  '-'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {detailName && (
        <DetailSlideOver
          title="Warning Message"
          subtitle={detailName}
          onClose={() => setDetailName(null)}
        >
          <DocDetailView doctype="Warning Message" name={detailName} onUpdate={refetch} />
        </DetailSlideOver>
      )}
    </div>
  )
}

