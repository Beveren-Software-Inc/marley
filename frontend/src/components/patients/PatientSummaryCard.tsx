import { useEffect, useMemo, useState } from 'react'
import { Ban } from 'lucide-react'
import { fetchPatientSummary, type PatientSummary } from '../../services/patients'
import { useAuth } from '../../providers/AuthProvider'
import { useCareContext } from '../../providers/CareContextProvider'
import { canManagePatientBlacklist } from '../../config/permissions'
import { BlacklistPatientModal } from './BlacklistPatientModal'

interface PatientSummaryCardProps {
  patient?: string
  refreshKey?: number
}

export const PatientSummaryCard = ({ patient, refreshKey = 0 }: PatientSummaryCardProps) => {
  const { user } = useAuth()
  const { userRole } = useCareContext()
  const [summary, setSummary] = useState<PatientSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blacklistOpen, setBlacklistOpen] = useState(false)

  const canBlacklist = useMemo(() => {
    const roles = userRole?.length
      ? userRole
      : user?.roles?.length
        ? user.roles
        : ([user?.role, user?.role_profile_name].filter(Boolean) as string[])
    return canManagePatientBlacklist(roles)
  }, [user, userRole])

  const isBlacklisted = Boolean(summary?.is_blacklist || summary?.is_black_list)

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
  }, [patient, refreshKey])

  return (
    <section
      className={`bg-white border rounded-lg p-3 sm:p-4 shadow-sm h-full min-w-0 ${
        isBlacklisted ? 'border-red-300 ring-1 ring-red-100' : 'border-slate-200'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="font-semibold text-slate-900 text-sm sm:text-base">Patient Information</div>
        <div className="flex flex-wrap items-center gap-2">
          {summary?.id_number && (
            <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-medium">
              CPR / ID: {summary.id_number}
            </span>
          )}
          {summary?.file_no && (
            <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
              File: {summary.file_no}
            </span>
          )}
          {canBlacklist && patient && (
            <button
              type="button"
              onClick={() => setBlacklistOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${
                isBlacklisted
                  ? 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Ban className="h-3.5 w-3.5" />
              Blacklist
            </button>
          )}
        </div>
      </div>
      {isBlacklisted && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2" role="alert">
          <p className="text-sm font-semibold text-red-800">This patient is blacklisted</p>
          {summary?.blacklist_reason ? (
            <p className="mt-0.5 text-xs text-red-700">{summary.blacklist_reason}</p>
          ) : null}
        </div>
      )}
      {loading && (
        <div className="text-sm text-slate-500">Loading patient information...</div>
      )}
      {error && (
        <div className="text-sm text-red-600">Error: {error}</div>
      )}
      {!loading && !error && summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <div className="text-xs font-medium text-slate-500">Name</div>
              <div className="text-slate-900">{summary.patient_name || summary.name}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">CPR / ID Number</div>
              <div className="text-slate-900 font-medium">{summary.id_number || '-'}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Sex</div>
              <div className="text-slate-900">{summary.sex || '-'}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Date of Birth</div>
              <div className="text-slate-900">
                {summary.dob ? new Date(summary.dob).toLocaleDateString('en-GB') : '-'}
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
              <div className={isBlacklisted ? 'text-red-600 font-semibold' : 'text-slate-900'}>
                {isBlacklisted ? 'Yes' : 'No'}
              </div>
            </div>
            {isBlacklisted && summary.blacklist_reason ? (
              <div className="sm:col-span-2">
                <div className="text-xs font-medium text-slate-500">Blacklist reason</div>
                <div className="text-red-800">{summary.blacklist_reason}</div>
              </div>
            ) : null}
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
      {patient ? (
        <BlacklistPatientModal
          open={blacklistOpen}
          patientName={patient}
          patientLabel={summary?.patient_name || summary?.name}
          initialBlacklisted={isBlacklisted}
          initialReason={summary?.blacklist_reason}
          onClose={() => setBlacklistOpen(false)}
          onSaved={(nextFlag, nextReason) => {
            setSummary((prev) =>
              prev
                ? {
                    ...prev,
                    is_blacklist: nextFlag ? 1 : 0,
                    is_black_list: nextFlag ? 1 : 0,
                    blacklist_reason: nextReason,
                  }
                : prev,
            )
          }}
        />
      ) : null}
    </section>
  )
}
