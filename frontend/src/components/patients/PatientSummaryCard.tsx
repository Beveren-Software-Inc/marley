import { useEffect, useState } from 'react'
import { fetchPatientSummary, type PatientSummary } from '../../services/patients'

interface PatientSummaryCardProps {
  patient?: string
}

export const PatientSummaryCard = ({ patient }: PatientSummaryCardProps) => {
  const [summary, setSummary] = useState<PatientSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!patient) {
      setSummary(null)
      return
    }

    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchPatientSummary(patient)
        setSummary(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load patient info')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [patient])

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-slate-900">Patient Information</div>
        {summary?.file_no && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            File: {summary.file_no}
          </span>
        )}
      </div>
      {loading && (
        <div className="text-sm text-slate-500">Loading patient information...</div>
      )}
      {error && (
        <div className="text-sm text-red-600">Error: {error}</div>
      )}
      {!loading && !error && summary && (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <div className="text-xs font-medium text-slate-500">Name</div>
              <div className="text-slate-900">{summary.patient_name || summary.name}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Sex</div>
              <div className="text-slate-900">{summary.sex || '-'}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Date of Birth</div>
              <div className="text-slate-900">
                {summary.dob ? new Date(summary.dob).toLocaleDateString() : '-'}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Marital Status</div>
              <div className="text-slate-900">{summary.marital_status || '-'}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Mobile</div>
              <div className="text-slate-900">{summary.mobile || '-'}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Category</div>
              <div className="text-slate-900">{summary.category || '-'}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Blacklist</div>
              <div className={summary.is_blacklist ? 'text-red-600 font-semibold' : 'text-slate-900'}>
                {summary.is_blacklist ? 'Yes' : 'No'}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Remarks</div>
              <div className="text-slate-900">{summary.remarks || '-'}</div>
            </div>
          </div>

          {/* Documents (Patient Upload Document) — same pattern as Patient Visit detail modal */}
          <div className="mt-4 pt-4 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Documents</h3>
            {!summary.documents || summary.documents.length === 0 ? (
                <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                  No documents uploaded for this patient.
                </div>
              ) : (
                <div className="space-y-2">
                  {summary.documents.map((doc) => (
                    <div
                      key={doc.name || `${doc.document}-${doc.file_name}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">
                          {doc.file_name || doc.document_name || doc.document || 'Document'}
                        </div>
                        <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {doc.document_type && <span>Type: {doc.document_type}</span>}
                          {doc.transaction_no && <span>Txn: {doc.transaction_no}</span>}
                        </div>
                        {doc.upload_remarks && (
                          <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                            {doc.upload_remarks}
                          </div>
                        )}
                      </div>
                      {doc.document && (
                        <a
                          href={doc.document}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 inline-flex items-center px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-md hover:bg-primary/5"
                        >
                          Open
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
        </>
      )}
      {!loading && !error && !summary && (
        <div className="text-sm text-slate-500">
          Select a patient to view information.
        </div>
      )}
    </section>
  )
}

