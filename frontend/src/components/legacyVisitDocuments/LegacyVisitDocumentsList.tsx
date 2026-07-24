import { useEffect, useState } from 'react'
import {
  fetchPatientLegacyVisitDocuments,
  type LegacyVisitDocument,
} from '../../services/legacyVisitDocuments'
import {
  PatientDocumentAttachmentPreview,
  viewPatientDocument,
} from '../ui/PatientDocumentAttachmentPreview'

interface LegacyVisitDocumentsListProps {
  patient?: string
  /** Compact stacked cards (default) or a table for Patient History. */
  layout?: 'cards' | 'table'
}

function formatDate(value?: string): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB')
}

export const LegacyVisitDocumentsList = ({
  patient,
  layout = 'cards',
}: LegacyVisitDocumentsListProps) => {
  const [documents, setDocuments] = useState<LegacyVisitDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!patient) {
      setDocuments([])
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const rows = await fetchPatientLegacyVisitDocuments(patient)
        if (!cancelled) setDocuments(rows)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to fetch legacy documents'))
          setDocuments([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [patient])

  if (!patient) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="text-slate-500 text-sm">Select a patient to view legacy documents.</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="text-slate-600 text-sm">Loading legacy documents…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold mb-1 text-sm">Error Loading Legacy Documents</h3>
          <p className="text-red-700 text-sm">{error.message}</p>
        </div>
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="text-slate-500 text-sm">No legacy documents found for this patient.</div>
      </div>
    )
  }

  if (layout === 'table') {
    return (
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase">
                  Date
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase">
                  Type
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase">
                  Document Code
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase">
                  Legacy Visit
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase">
                  File No
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase">
                  File
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase">
                  Preview
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {documents.map((doc) => (
                <tr key={doc.name} className="hover:bg-slate-50 align-top">
                  <td className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap">
                    {formatDate(doc.date_created)}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-800">
                    {doc.document_type || 'Patient Documentation'}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-700 font-mono text-xs">
                    {doc.document_name || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-700">
                    {doc.legacy_visit || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-700">
                    {doc.legacy_patient_file_no || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-600 max-w-[180px]">
                    <div className="truncate" title={doc.file_name || undefined}>
                      {doc.file_name || '—'}
                    </div>
                    {doc.document ? (
                      <button
                        type="button"
                        onClick={() => viewPatientDocument(doc.document)}
                        className="mt-1 text-xs font-medium text-primary hover:underline"
                      >
                        Open
                      </button>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 min-w-[160px]">
                    {doc.document ? (
                      <PatientDocumentAttachmentPreview
                        url={doc.document}
                        fileName={doc.file_name || doc.document_name}
                        compact
                      />
                    ) : (
                      <span className="text-sm text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {documents.map((doc) => (
        <div
          key={doc.name}
          className="rounded-lg border border-slate-200 bg-white overflow-hidden"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 bg-slate-50/80 border-b border-slate-200">
            <div className="min-w-0 space-y-1">
              <div className="text-sm font-semibold text-slate-900 truncate">
                {doc.document_type || 'Patient Documentation'}
                {doc.document_name ? (
                  <span className="font-normal text-slate-500"> · {doc.document_name}</span>
                ) : null}
              </div>
              <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                {doc.date_created && <span>Date: {formatDate(doc.date_created)}</span>}
                {doc.legacy_visit && <span>Legacy Visit: {doc.legacy_visit}</span>}
                {doc.legacy_patient_file_no && (
                  <span>File No: {doc.legacy_patient_file_no}</span>
                )}
                {doc.patient_visit && <span>Visit: {doc.patient_visit}</span>}
                {doc.file_name && <span className="truncate max-w-[240px]">{doc.file_name}</span>}
              </div>
              {doc.upload_remarks && (
                <div className="text-xs text-slate-500 line-clamp-2">{doc.upload_remarks}</div>
              )}
            </div>
          </div>
          {doc.document ? (
            <div className="px-4 py-3">
              <PatientDocumentAttachmentPreview
                url={doc.document}
                fileName={doc.file_name || doc.document_name}
                compact
              />
            </div>
          ) : (
            <div className="px-4 py-3 text-sm text-slate-500">No file attached.</div>
          )}
        </div>
      ))}
    </div>
  )
}
