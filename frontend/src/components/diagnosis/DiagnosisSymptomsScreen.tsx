import { useState, useEffect, useCallback } from 'react'
import { getPatientDiagnosis, type PatientDiagnosisRow } from '../../services/common'
import { toast } from '../../hooks/useToast'
import { Plus } from 'lucide-react'
import { useCareContext } from '../../providers/CareContextProvider'
import { PatientDiagnosisModal } from './PatientDiagnosisModal'

interface DiagnosisSymptomsScreenProps {
  selectedPatient: string
  onPatientSelect: (patient: string | undefined) => void
}

function formatDate(val?: string): string {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return val
  }
}

/** Preview Text Editor HTML as plain text */
function stripHtml(html: string): string {
  if (!html || typeof document === 'undefined') return html || ''
  const d = document.createElement('div')
  d.innerHTML = html
  return (d.textContent || d.innerText || '').trim() || '—'
}

export function DiagnosisSymptomsScreen({
  selectedPatient: selectedPatientProp,
  onPatientSelect: _onPatientSelect,
}: DiagnosisSymptomsScreenProps) {
  const { mode, activeVisit, activeAdmission, selectedPatient: selectedPatientCtx } = useCareContext()
  const patient = (selectedPatientProp || selectedPatientCtx || '').trim()

  const parentDoctype = mode === 'IP' ? 'Inpatient Admission' : 'Patient Visit'
  const parentName = mode === 'IP' ? activeAdmission : activeVisit

  const [rows, setRows] = useState<PatientDiagnosisRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showAddModal, setShowAddModal] = useState(false)

  const load = useCallback(async () => {
    if (!patient || !parentName) {
      setRows([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await getPatientDiagnosis(parentDoctype, parentName)
      setRows(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load diagnoses'
      setError(msg)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [patient, parentDoctype, parentName])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const contextLabel = mode === 'IP' ? 'Inpatient (IP)' : 'Outpatient (OP)'
  const contextDocLabel = mode === 'IP' ? 'Admission' : 'Visit'

  return (
    <div className="flex flex-col">
      <div className="p-4 space-y-4">
        {!patient && (
          <div className="bg-slate-100 rounded-lg p-6 text-center text-slate-600 text-sm">
            Select a patient to view diagnoses for the current OP visit or IP admission.
          </div>
        )}

        {patient && (
          <>
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Care context</div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-800">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    mode === 'IP' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {contextLabel}
                </span>
                <span className="text-slate-500">
                  {parentName ? (
                    <>
                      {contextDocLabel}: <span className="font-mono text-slate-700">{parentName}</span>
                    </>
                  ) : (
                    <span className="text-amber-700 font-medium">No active {contextDocLabel.toLowerCase()} selected</span>
                  )}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Diagnoses are read from the <strong>Patient Diagnosis</strong> table on this {contextDocLabel.toLowerCase()}.
                Use the <strong>OP / IP</strong> toggle and pick a visit or admission at the top of the app (same context as
                prescriptions and charts).
              </p>
            </div>

            {!parentName && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center text-amber-900 text-sm">
                <p className="font-semibold mb-1">Choose IP or OP</p>
                <p className="text-amber-800/90 max-w-lg mx-auto">
                  Switch to <strong>OP</strong> and select a <strong>patient visit</strong>, or <strong>IP</strong> and
                  select an <strong>inpatient admission</strong>, using the controls at the top of the screen. Then this
                  page will list diagnoses for that encounter only.
                </p>
              </div>
            )}

            {parentName && (
              <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50/80">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Diagnoses</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Patient Diagnosis · {parentDoctype}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!patient) {
                        toast.error('Select a patient first')
                        return
                      }
                      setShowAddModal(true)
                    }}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white text-lg font-bold leading-none hover:bg-primary/90 transition-colors"
                    title="Add or edit diagnoses"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>

                {error && (
                  <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {error}
                  </div>
                )}

                <div className="p-4">
                  {loading ? (
                    <div className="flex items-center gap-2 py-8 text-slate-500 text-sm justify-center">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Loading…
                    </div>
                  ) : rows.length === 0 ? (
                    <p className="text-sm text-slate-500 italic py-6 text-center">No diagnoses recorded for this encounter yet.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border border-slate-100">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">
                              Diagnosis no.
                            </th>
                            <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                              Name
                            </th>
                            <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                              Group
                            </th>
                            <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                              Details
                            </th>
                            <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">
                              Posting date
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rows.map((row, idx) => (
                            <tr key={row.name || `${row.diagnosis}-${idx}`} className="hover:bg-slate-50/80">
                              <td className="px-3 py-2.5 align-top font-mono text-sm text-slate-800 whitespace-nowrap">
                                {row.disease_no || row.diagnosis || '—'}
                              </td>
                              <td className="px-3 py-2.5 align-top font-medium text-slate-900">
                                {row.diagnosis_name?.trim() || row.diagnosis || '—'}
                              </td>
                              <td className="px-3 py-2.5 align-top text-sm text-slate-600">
                                {row.diagnosis_group_name || '—'}
                              </td>
                              <td
                                className="px-3 py-2.5 text-slate-600 max-w-md align-top"
                                title={stripHtml(row.details || '')}
                              >
                                <span className="line-clamp-3">{stripHtml(row.details || '')}</span>
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap align-top">
                                {formatDate(row.posting_date)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {showAddModal && patient && parentName && (
        <PatientDiagnosisModal
          parentDoctype={parentDoctype}
          parentName={parentName}
          patient={patient}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false)
            setRefreshKey((k) => k + 1)
            toast.success('Diagnoses saved')
          }}
        />
      )}
    </div>
  )
}
