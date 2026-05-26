import { useState, useEffect, useRef } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  getPatientDiagnosis,
  savePatientDiagnosis,
  fetchDiagnosis,
  fetchPatientVisits,
  fetchInpatientAdmissions,
  type LinkFieldOption,
} from '../../services/common'
import { Stethoscope } from 'lucide-react'
import { CreateDiagnosisModal } from './CreateDiagnosisModal'
import { toast } from '../../hooks/useToast'

interface PatientDiagnosisModalProps {
  /** Pre-selected parent — if omitted the modal shows an OP/IP + visit/admission selector */
  parentDoctype?: 'Patient Visit' | 'Inpatient Admission'
  parentName?: string
  patient?: string
  patientName?: string
  onClose: () => void
  onSuccess?: () => void
}

interface RowDraft {
  _id: string
  diagnosis: string
  diagnosisLabel: string
  diagnosisGroupName: string
  details: string
  posting_date: string
}

function newDraft(): RowDraft {
  return {
    _id: Math.random().toString(36).slice(2),
    diagnosis: '',
    diagnosisLabel: '',
    diagnosisGroupName: '',
    details: '',
    posting_date: new Date().toISOString().slice(0, 16),
  }
}

export function PatientDiagnosisModal({
  parentDoctype: initialParentDoctype,
  parentName: initialParentName,
  patient,
  patientName,
  onClose,
  onSuccess,
}: PatientDiagnosisModalProps) {
  // Standalone (no pre-selected parent) selector state
  const standalone = !initialParentDoctype || !initialParentName
  const [contextType, setContextType] = useState<'Patient Visit' | 'Inpatient Admission'>(
    initialParentDoctype ?? 'Patient Visit'
  )
  const [contextName, setContextName] = useState(initialParentName ?? '')
  const [visitOptions, setVisitOptions] = useState<LinkFieldOption[]>([])
  const [admissionOptions, setAdmissionOptions] = useState<LinkFieldOption[]>([])

  // Resolved parent (from props or from selector)
  const parentDoctype = standalone ? contextType : initialParentDoctype!
  const parentName = standalone ? contextName : initialParentName!

  const [rows, setRows] = useState<RowDraft[]>([])
  const [loading, setLoading] = useState(!standalone)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Diagnosis search state (shared for the add-row search)
  const [searchQuery, setSearchQuery] = useState<Record<string, string>>({})
  const [searchOptions, setSearchOptions] = useState<Record<string, LinkFieldOption[]>>({})
  const [searchOpen, setSearchOpen] = useState<Record<string, boolean>>({})
  const [showCreateDiagnosis, setShowCreateDiagnosis] = useState(false)
  const [createDiagnosisForRowId, setCreateDiagnosisForRowId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load visit/admission options when in standalone mode
  useEffect(() => {
    if (!standalone || !patient) return
    fetchPatientVisits(patient).then(setVisitOptions).catch(() => setVisitOptions([]))
    fetchInpatientAdmissions(patient).then(setAdmissionOptions).catch(() => setAdmissionOptions([]))
  }, [standalone, patient])

  // Reset context name when switching OP/IP
  useEffect(() => {
    if (standalone) setContextName('')
  }, [contextType]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load rows whenever parentName changes (and is set)
  useEffect(() => {
    if (!parentName) { setRows([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    getPatientDiagnosis(parentDoctype, parentName)
      .then((data) => {
        if (cancelled) return
        const mapped = data.map((r) => ({
          _id: Math.random().toString(36).slice(2),
          diagnosis: r.diagnosis || '',
          diagnosisLabel: r.diagnosis_label || r.diagnosis || '',
          diagnosisGroupName: r.diagnosis_group_name || '',
          details: r.details || '',
          posting_date: r.posting_date ? r.posting_date.slice(0, 16) : new Date().toISOString().slice(0, 16),
        }))
        setRows(mapped.length > 0 ? mapped : [newDraft()])
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [parentDoctype, parentName])

  // Debounced search for each row's diagnosis field
  useEffect(() => {
    const timers: Record<string, ReturnType<typeof setTimeout>> = {}
    for (const [id, open] of Object.entries(searchOpen)) {
      if (!open) continue
      const q = searchQuery[id] || ''
      timers[id] = setTimeout(() => {
        fetchDiagnosis(q || undefined).then((opts) => {
          setSearchOptions((prev) => ({ ...prev, [id]: opts }))
        }).catch(() => {})
      }, q.trim() ? 300 : 0)
    }
    return () => { Object.values(timers).forEach(clearTimeout) }
  }, [searchQuery, searchOpen])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSearchOpen({})
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const addRow = () => setRows((prev) => [...prev, newDraft()])

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r._id !== id))

  const updateField = (id: string, field: keyof RowDraft, value: string) => {
    setRows((prev) => prev.map((r) => r._id === id ? { ...r, [field]: value } : r))
  }

  const selectDiagnosis = (id: string, opt: LinkFieldOption) => {
    setRows((prev) =>
      prev.map((r) =>
        r._id === id
          ? {
              ...r,
              diagnosis: opt.name,
              diagnosisLabel: opt.label || opt.name,
              diagnosisGroupName: opt.diagnosis_group_name?.trim() || '',
            }
          : r
      )
    )
    setSearchOpen((prev) => ({ ...prev, [id]: false }))
    setSearchQuery((prev) => ({ ...prev, [id]: '' }))
  }

  const openCreateDiagnosis = (rowId: string) => {
    setCreateDiagnosisForRowId(rowId)
    setShowCreateDiagnosis(true)
    setSearchOpen((p) => ({ ...p, [rowId]: false }))
  }

  const handleSave = async () => {
    if (!parentName) { toast.error('Please select a Patient Visit or Inpatient Admission'); return }
    const validRows = rows.filter((r) => r.diagnosis.trim())
    setSaving(true)
    setError(null)
    try {
      await savePatientDiagnosis(
        parentDoctype,
        parentName,
        validRows.map((r) => ({
          diagnosis: r.diagnosis,
          details: r.details,
          posting_date: r.posting_date || new Date().toISOString().slice(0, 16),
        }))
      )
      toast.success('Diagnosis saved')
      onSuccess?.()
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const contextOptions = contextType === 'Patient Visit' ? visitOptions : admissionOptions
  const typeLabel = parentDoctype === 'Patient Visit' ? 'Patient Visit' : 'Inpatient Admission'

  return (
    <div className={CREATE_MODAL_OVERLAY} onClick={onClose}>
      <div
        className={createModalShellClass('max-w-2xl w-full max-h-[90vh] overflow-hidden')}
        onClick={(e) => e.stopPropagation()}
      >
        <CreateModalHeader
          title="Patient Diagnosis"
          subtitle={
            <>
              {patientName ? <span>{patientName}</span> : null}
              {!standalone && parentName ? (
                <span className="text-emerald-800/60"> · {typeLabel}: {parentName}</span>
              ) : null}
            </>
          }
          icon={<Stethoscope className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
        />

        {/* Body */}
        <div className={`${CREATE_MODAL_BODY_GRADIENT} flex-1 overflow-y-auto px-6 py-4 space-y-3`} ref={dropdownRef}>

          {/* Standalone: OP/IP type + visit/admission selector */}
          {standalone && (
            <div className="rounded-xl border border-emerald-100/80 bg-white p-4 shadow-sm flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-emerald-800/70">Type</label>
                <select
                  value={contextType}
                  onChange={(e) => setContextType(e.target.value as 'Patient Visit' | 'Inpatient Admission')}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm min-w-[160px] hover:border-emerald-300/80 focus:border-emerald-400/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                >
                  <option value="Patient Visit">Patient Visit (OP)</option>
                  <option value="Inpatient Admission">Inpatient Admission (IP)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                <label className="text-xs font-semibold uppercase tracking-wide text-emerald-800/70">
                  {contextType === 'Patient Visit' ? 'Patient Visit' : 'Inpatient Admission'}
                </label>
                <select
                  value={contextName}
                  onChange={(e) => setContextName(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:border-emerald-300/80 focus:border-emerald-400/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                >
                  <option value="">Select…</option>
                  {contextOptions.map((o) => (
                    <option key={o.name} value={o.name}>{o.label || o.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {standalone && !contextName ? (
            <div className="text-center text-slate-400 text-sm py-6 border-2 border-dashed border-emerald-100 rounded-lg">
              Select a {contextType === 'Patient Visit' ? 'Patient Visit' : 'Inpatient Admission'} above to view and edit diagnoses.
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <svg className="w-6 h-6 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading…
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>
              )}

              {rows.length === 0 && (
                <div className="text-center text-slate-400 text-sm py-6 border-2 border-dashed border-emerald-100 rounded-lg">
                  No diagnoses yet. Click <strong>Add Row</strong> or use <strong>+</strong> on the diagnosis field to create one.
                </div>
              )}

              {rows.map((row, idx) => (
                <div key={row._id} className="rounded-xl border border-emerald-100/80 bg-white p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Row {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeRow(row._id)}
                      className="text-red-400 hover:text-red-600 transition-colors"
                      title="Remove row"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  {/* Diagnosis search */}
                  <div className="relative">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Diagnosis <span className="text-red-500">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={searchOpen[row._id] ? (searchQuery[row._id] ?? '') : row.diagnosisLabel}
                        onFocus={() => {
                          setSearchOpen((p) => ({ ...p, [row._id]: true }))
                          setSearchQuery((p) => ({ ...p, [row._id]: '' }))
                          fetchDiagnosis(undefined).then((opts) =>
                            setSearchOptions((p) => ({ ...p, [row._id]: opts }))
                          ).catch(() => {})
                        }}
                        onChange={(e) => {
                          setSearchQuery((p) => ({ ...p, [row._id]: e.target.value }))
                          setSearchOpen((p) => ({ ...p, [row._id]: true }))
                        }}
                        placeholder="Search by disease no or diagnosis name…"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-9 text-sm shadow-sm placeholder:text-slate-400 hover:border-emerald-300/80 focus:border-emerald-400/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openCreateDiagnosis(row._id)
                        }}
                        className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                        title="Create new diagnosis"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>
                    {!searchOpen[row._id] && row.diagnosisGroupName ? (
                      <p className="text-xs text-slate-500 mt-1">{row.diagnosisGroupName}</p>
                    ) : null}
                    {searchOpen[row._id] && (
                      <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                        {(searchOptions[row._id] || []).length === 0 ? (
                          <div className="px-3 py-2 text-sm text-slate-500">
                            No results.{' '}
                            <button
                              type="button"
                              className="text-primary underline text-xs"
                              onMouseDown={() => openCreateDiagnosis(row._id)}
                            >
                              Create new diagnosis
                            </button>
                          </div>
                        ) : (
                          <>
                            {(searchOptions[row._id] || []).map((opt) => (
                              <button
                                key={opt.name}
                                type="button"
                                onMouseDown={() => selectDiagnosis(row._id, opt)}
                                className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-primary/5"
                              >
                                <div className="font-medium text-slate-800">{opt.label || opt.name}</div>
                                {opt.diagnosis_group_name ? (
                                  <div className="text-xs text-slate-500 mt-0.5">{opt.diagnosis_group_name}</div>
                                ) : null}
                              </button>
                            ))}
                            <button
                              type="button"
                              className="block w-full text-left px-3 py-2 text-xs text-primary hover:bg-primary/5 border-t border-slate-100"
                              onMouseDown={() => openCreateDiagnosis(row._id)}
                            >
                              + Create new diagnosis
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Details</label>
                    <textarea
                      rows={2}
                      value={row.details}
                      onChange={(e) => updateField(row._id, 'details', e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm resize-none shadow-sm placeholder:text-slate-400 hover:border-emerald-300/80 focus:border-emerald-400/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                      placeholder="Additional details or notes…"
                    />
                  </div>

                  {/* Date */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
                    <input
                      type="datetime-local"
                      value={row.posting_date}
                      onChange={(e) => updateField(row._id, 'posting_date', e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm hover:border-emerald-300/80 focus:border-emerald-400/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                    />
                  </div>
                </div>
              ))}

              {/* Add row */}
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-2 text-sm text-emerald-700 hover:text-emerald-900 font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Row
              </button>
            </>
          )}
        </div>

        <CreateModalFooter>
          <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className={`${CM_BTN_PRIMARY} flex items-center gap-2`}
          >
            {saving && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </CreateModalFooter>
      </div>

      {showCreateDiagnosis && createDiagnosisForRowId && (
        <CreateDiagnosisModal
          initialDiagnosis={searchQuery[createDiagnosisForRowId] || ''}
          onClose={() => {
            setShowCreateDiagnosis(false)
            setCreateDiagnosisForRowId(null)
          }}
          onSuccess={(created) => {
            selectDiagnosis(createDiagnosisForRowId, created)
            setShowCreateDiagnosis(false)
            setCreateDiagnosisForRowId(null)
          }}
        />
      )}
    </div>
  )
}
