import { useState, useEffect, useRef } from 'react'
import {
  getPatientDiagnosis,
  savePatientDiagnosis,
  fetchDiagnosis,
  createDiagnosis,
  fetchPatientVisits,
  fetchInpatientAdmissions,
  type LinkFieldOption,
} from '../../services/common'
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
  details: string
  posting_date: string
}

function newDraft(): RowDraft {
  return {
    _id: Math.random().toString(36).slice(2),
    diagnosis: '',
    diagnosisLabel: '',
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
  const [creatingFor, setCreatingFor] = useState<string | null>(null)
  const [newDiagnosisValue, setNewDiagnosisValue] = useState('')
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
        setRows(
          data.map((r) => ({
            _id: Math.random().toString(36).slice(2),
            diagnosis: r.diagnosis || '',
            diagnosisLabel: r.diagnosis || '',
            details: r.details || '',
            posting_date: r.posting_date ? r.posting_date.slice(0, 16) : new Date().toISOString().slice(0, 16),
          }))
        )
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
      prev.map((r) => r._id === id ? { ...r, diagnosis: opt.name, diagnosisLabel: opt.label || opt.name } : r)
    )
    setSearchOpen((prev) => ({ ...prev, [id]: false }))
    setSearchQuery((prev) => ({ ...prev, [id]: '' }))
  }

  const handleCreateDiagnosis = async (id: string) => {
    const val = newDiagnosisValue.trim()
    if (!val) return
    setCreatingFor(id)
    try {
      const name = await createDiagnosis(val)
      selectDiagnosis(id, { name, label: val })
      setCreatingFor(null)
      setNewDiagnosisValue('')
      toast.success('Diagnosis created')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create')
      setCreatingFor(null)
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
              {standalone ? 'Patient Diagnosis' : typeLabel}
            </p>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Patient Diagnosis
              {patientName && <span className="text-sm font-normal text-slate-500">— {patientName}</span>}
            </h2>
            {!standalone && <p className="text-xs text-slate-400 mt-0.5">{parentName}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3" ref={dropdownRef}>

          {/* Standalone: OP/IP type + visit/admission selector */}
          {standalone && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</label>
                <select
                  value={contextType}
                  onChange={(e) => setContextType(e.target.value as 'Patient Visit' | 'Inpatient Admission')}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm min-w-[160px]"
                >
                  <option value="Patient Visit">Patient Visit (OP)</option>
                  <option value="Inpatient Admission">Inpatient Admission (IP)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {contextType === 'Patient Visit' ? 'Patient Visit' : 'Inpatient Admission'}
                </label>
                <select
                  value={contextName}
                  onChange={(e) => setContextName(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
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
            <div className="text-center text-slate-400 text-sm py-6 border-2 border-dashed border-slate-200 rounded-lg">
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
                <div className="text-center text-slate-400 text-sm py-6 border-2 border-dashed border-slate-200 rounded-lg">
                  No diagnoses recorded yet. Click <strong>Add Row</strong> to begin.
                </div>
              )}

              {rows.map((row, idx) => (
                <div key={row._id} className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Row {idx + 1}</span>
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
                      placeholder="Search diagnosis…"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {searchOpen[row._id] && (
                      <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                        {(searchOptions[row._id] || []).length === 0 ? (
                          <div className="px-3 py-2 text-sm text-slate-400">
                            No results.
                            <button
                              type="button"
                              className="ml-2 text-primary underline text-xs"
                              onClick={() => {
                                setNewDiagnosisValue(searchQuery[row._id] || '')
                                setSearchOpen((p) => ({ ...p, [row._id]: false }))
                              }}
                            >
                              Create "{searchQuery[row._id]}"
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
                                {opt.label || opt.name}
                              </button>
                            ))}
                            <button
                              type="button"
                              className="block w-full text-left px-3 py-2 text-xs text-primary hover:bg-primary/5 border-t border-slate-100"
                              onMouseDown={() => {
                                setNewDiagnosisValue(searchQuery[row._id] || '')
                                setSearchOpen((p) => ({ ...p, [row._id]: false }))
                              }}
                            >
                              + Create new diagnosis
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Inline create new diagnosis */}
                    {newDiagnosisValue !== '' && !searchOpen[row._id] && (
                      <div className="mt-2 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
                        <input
                          type="text"
                          value={newDiagnosisValue}
                          onChange={(e) => setNewDiagnosisValue(e.target.value)}
                          className="flex-1 text-sm bg-transparent outline-none"
                          placeholder="New diagnosis name"
                        />
                        <button
                          type="button"
                          disabled={creatingFor === row._id}
                          onClick={() => handleCreateDiagnosis(row._id)}
                          className="text-xs bg-primary text-white rounded px-2 py-1 disabled:opacity-50"
                        >
                          {creatingFor === row._id ? '…' : 'Create'}
                        </button>
                        <button type="button" onClick={() => setNewDiagnosisValue('')} className="text-slate-400 hover:text-slate-600">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Details</label>
                    <textarea
                      rows={2}
                      value={row.details}
                      onChange={(e) => updateField(row._id, 'details', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Additional details or notes…"
                    />
                  </div>

                  {/* Date */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
                    <input
                      type="datetime-local"
                      value={row.posting_date}
                      onChange={(e) => updateField(row._id, 'posting_date', e.target.value)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
              ))}

              {/* Add row */}
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Row
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 shrink-0 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="px-5 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {saving && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
