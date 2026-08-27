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
  appendPatientDiagnosis,
  fetchDiagnosis,
  fetchPatientVisits,
  fetchInpatientAdmissions,
  fetchHealthcarePractitioners,
  fetchCostCenters,
  type LinkFieldOption,
} from '../../services/common'
import {
  getMedicalDiagnosisContextDefaults,
  type MedicalDiagnosisContextDefaults,
} from '../../services/medicalDiagnosisEntry'
import { useCareContext } from '../../providers/CareContextProvider'
import { Stethoscope } from 'lucide-react'
import { CreateDiagnosisModal } from './CreateDiagnosisModal'
import { toast } from '../../hooks/useToast'
import {
  fromDatetimeLocalValue,
  parseToDatetimeLocalValue,
  toDatetimeLocalValue,
} from '../../utils/datetimeLocal'
import {
  LOCKED_PRACTITIONER_INPUT_CLASS,
  useLockedLinkedPractitioner,
} from '../../hooks/useLockedLinkedPractitioner'

interface PatientDiagnosisModalProps {
  /** Pre-selected parent — if omitted the modal shows an OP/IP + visit/admission selector */
  parentDoctype?: 'Patient Visit' | 'Inpatient Admission'
  parentName?: string
  patient?: string
  patientName?: string
  /**
   * append — blank row(s) only; save adds without touching existing diagnoses (use for +).
   * manage — load all rows for the visit/admission; save replaces the full set.
   */
  mode?: 'append' | 'manage'
  onClose: () => void
  onSuccess?: () => void
}

interface RowDraft {
  _id: string
  /** Medical Diagnosis Entry document name (when editing existing) */
  name?: string
  diagnosis: string
  diagnosisLabel: string
  diagnosisGroupName: string
  details: string
  posting_date: string
  practitioner: string
  practitionerLabel: string
  cost_center: string
}

function newDraft(defaults?: MedicalDiagnosisContextDefaults): RowDraft {
  return {
    _id: Math.random().toString(36).slice(2),
    diagnosis: '',
    diagnosisLabel: '',
    diagnosisGroupName: '',
    details: '',
    posting_date: toDatetimeLocalValue(),
    practitioner: defaults?.practitioner || '',
    practitionerLabel: defaults?.practitioner_name || defaults?.practitioner || '',
    cost_center: defaults?.cost_center || '',
  }
}

function applyDefaultsToDraft(
  row: RowDraft,
  defaults: MedicalDiagnosisContextDefaults
): RowDraft {
  if (row.name) return row
  return {
    ...row,
    practitioner: row.practitioner || defaults.practitioner || '',
    practitionerLabel:
      row.practitionerLabel ||
      defaults.practitioner_name ||
      defaults.practitioner ||
      '',
    cost_center: row.cost_center || defaults.cost_center || '',
  }
}

export function PatientDiagnosisModal({
  parentDoctype: initialParentDoctype,
  parentName: initialParentName,
  patient,
  patientName,
  mode: modeProp,
  onClose,
  onSuccess,
}: PatientDiagnosisModalProps) {
  const {
    mode: careMode,
    activeVisit,
    activeAdmission,
    selectedPatient: contextPatient,
    userCostCenter,
    costCenterCompany,
  } = useCareContext()

  const resolvedPatient = patient ?? contextPatient
  const resolvedParentDoctype =
    initialParentDoctype ??
    (careMode === 'IP'
      ? 'Inpatient Admission'
      : careMode === 'OP'
        ? 'Patient Visit'
        : undefined)
  const resolvedParentName =
    initialParentName ?? (careMode === 'IP' ? activeAdmission : careMode === 'OP' ? activeVisit : undefined)

  // Standalone (no pre-selected parent) selector state
  const standalone = !resolvedParentDoctype || !resolvedParentName
  const mode = modeProp ?? (standalone ? 'manage' : 'append')
  const [contextType, setContextType] = useState<'Patient Visit' | 'Inpatient Admission'>(
    resolvedParentDoctype ?? 'Patient Visit',
  )
  const [contextName, setContextName] = useState(resolvedParentName ?? '')
  const [visitOptions, setVisitOptions] = useState<LinkFieldOption[]>([])
  const [admissionOptions, setAdmissionOptions] = useState<LinkFieldOption[]>([])

  // Resolved parent (from props, care context, or standalone selector)
  const parentDoctype = standalone ? contextType : resolvedParentDoctype!
  const parentName = standalone ? contextName : resolvedParentName!

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
  const [contextDefaults, setContextDefaults] = useState<MedicalDiagnosisContextDefaults>({})
  const [practitionerQuery, setPractitionerQuery] = useState<Record<string, string>>({})
  const [practitionerOpen, setPractitionerOpen] = useState<Record<string, boolean>>({})
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [costCenterOptions, setCostCenterOptions] = useState<LinkFieldOption[]>([])
  const {
    locked: practitionerLocked,
    practitionerId: linkedPractitionerId,
    practitionerLabel: linkedPractitionerLabel,
  } = useLockedLinkedPractitioner()

  // Pre-fill standalone selector from navbar care context when visit/admission not passed as props
  useEffect(() => {
    if (!standalone) return
    if (careMode === 'IP' && activeAdmission) {
      setContextType('Inpatient Admission')
      setContextName(activeAdmission)
    } else if (careMode === 'OP' && activeVisit) {
      setContextType('Patient Visit')
      setContextName(activeVisit)
    }
  }, [standalone, careMode, activeAdmission, activeVisit])

  // Load visit/admission options when in standalone mode
  useEffect(() => {
    if (!standalone || !resolvedPatient) return
    fetchPatientVisits(resolvedPatient).then(setVisitOptions).catch(() => setVisitOptions([]))
    fetchInpatientAdmissions(resolvedPatient).then(setAdmissionOptions).catch(() => setAdmissionOptions([]))
  }, [standalone, resolvedPatient])

  // Reset context name when switching OP/IP
  useEffect(() => {
    if (standalone) setContextName('')
  }, [contextType]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load context defaults (practitioner, branch) for new rows
  useEffect(() => {
    if (!parentName) {
      setContextDefaults({})
      return
    }
    let cancelled = false
    getMedicalDiagnosisContextDefaults(parentDoctype, parentName)
      .then((fromParent) => {
        if (cancelled) return
        const pract =
          fromParent.practitioner || linkedPractitionerId || ''
        const merged: MedicalDiagnosisContextDefaults = {
          cost_center: fromParent.cost_center || userCostCenter || '',
          practitioner: pract,
          practitioner_name:
            fromParent.practitioner_name ||
            (pract === linkedPractitionerId ? linkedPractitionerLabel : '') ||
            pract,
        }
        if (merged.practitioner && !merged.practitioner_name) {
          merged.practitioner_name = merged.practitioner
        }
        setContextDefaults(merged)
      })
      .catch(() => {
        if (!cancelled) {
          setContextDefaults({
            cost_center: userCostCenter || '',
            practitioner: linkedPractitionerId || '',
            practitioner_name: linkedPractitionerLabel || linkedPractitionerId || '',
          })
        }
      })
    return () => { cancelled = true }
  }, [parentDoctype, parentName, userCostCenter, linkedPractitionerId, linkedPractitionerLabel])

  useEffect(() => {
    fetchCostCenters(costCenterCompany, undefined)
      .then(setCostCenterOptions)
      .catch(() => setCostCenterOptions([]))
  }, [costCenterCompany])

  useEffect(() => {
    const timers: Record<string, ReturnType<typeof setTimeout>> = {}
    for (const [id, open] of Object.entries(practitionerOpen)) {
      if (!open) continue
      const q = practitionerQuery[id] || ''
      timers[id] = setTimeout(() => {
        fetchHealthcarePractitioners(q || undefined)
          .then(setPractitionerOptions)
          .catch(() => setPractitionerOptions([]))
      }, q.trim() ? 300 : 0)
    }
    return () => { Object.values(timers).forEach(clearTimeout) }
  }, [practitionerQuery, practitionerOpen])

  // Apply practitioner/cost-center defaults to new rows without reloading from server
  useEffect(() => {
    if (!Object.keys(contextDefaults).length) return
    setRows((prev) => prev.map((r) => applyDefaultsToDraft(r, contextDefaults)))
  }, [contextDefaults])

  // Load rows whenever parentName changes (manage) or start blank (append)
  useEffect(() => {
    if (!parentName) {
      setRows([])
      setLoading(false)
      return
    }
    if (mode === 'append') {
      setLoading(false)
      setError(null)
      setRows([newDraft(contextDefaults)])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getPatientDiagnosis(parentDoctype, parentName)
      .then((data) => {
        if (cancelled) return
        const mapped = data.map((r) => ({
          _id: Math.random().toString(36).slice(2),
          name: r.name,
          diagnosis: r.diagnosis || '',
          diagnosisLabel: r.diagnosis_label || r.diagnosis_name || r.diagnosis || '',
          diagnosisGroupName: r.diagnosis_group_name || '',
          details: r.details || '',
          posting_date: parseToDatetimeLocalValue(r.posting_date),
          practitioner: r.practitioner || '',
          practitionerLabel: r.practitioner_name || r.practitioner || '',
          cost_center: r.cost_center || '',
        }))
        setRows(mapped.length > 0 ? mapped : [newDraft(contextDefaults)])
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [parentDoctype, parentName, mode])

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

  const addRow = () => setRows((prev) => [...prev, newDraft(contextDefaults)])

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

  const selectPractitioner = (id: string, opt: LinkFieldOption) => {
    setRows((prev) =>
      prev.map((r) =>
        r._id === id
          ? {
              ...r,
              practitioner: opt.name,
              practitionerLabel: opt.label || opt.name,
            }
          : r
      )
    )
    setPractitionerOpen((prev) => ({ ...prev, [id]: false }))
    setPractitionerQuery((prev) => ({ ...prev, [id]: '' }))
  }

  const handleSave = async () => {
    if (!parentName) { toast.error('Please select a Patient Visit or Inpatient Admission'); return }
    const validRows = rows.filter((r) => r.diagnosis.trim())
    const missingPractitioner = validRows.find((r) => !r.practitioner.trim())
    if (missingPractitioner) {
      toast.error('Practitioner is required for each diagnosis row')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const postingDefault = fromDatetimeLocalValue()
      const payload = validRows.map((r) => {
        const posting = fromDatetimeLocalValue(r.posting_date || postingDefault)
        return {
        name: mode === 'manage' ? r.name : undefined,
        diagnosis: r.diagnosis,
        details: r.details,
        posting_date: posting,
        diagnoses_time: posting,
        practitioner: r.practitioner,
        practitioner_name: r.practitionerLabel || r.practitioner,
        cost_center: r.cost_center || contextDefaults.cost_center || userCostCenter || '',
      }
      })
      if (mode === 'append') {
        await appendPatientDiagnosis(parentDoctype, parentName, payload)
      } else {
        await savePatientDiagnosis(parentDoctype, parentName, payload)
      }
      toast.success(mode === 'append' ? 'Diagnosis added' : 'Medical diagnosis saved')
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
          title={mode === 'append' ? 'Add diagnosis' : 'Medical Diagnosis Entry'}
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Practitioner */}
                    <div className="relative">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Doctor <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={
                          practitionerOpen[row._id]
                            ? (practitionerQuery[row._id] ?? '')
                            : row.practitionerLabel
                        }
                        readOnly={practitionerLocked}
                        onFocus={() => {
                          if (practitionerLocked) return
                          setPractitionerOpen((p) => ({ ...p, [row._id]: true }))
                          setPractitionerQuery((p) => ({ ...p, [row._id]: '' }))
                          fetchHealthcarePractitioners(undefined).then(setPractitionerOptions).catch(() => {})
                        }}
                        onChange={(e) => {
                          if (practitionerLocked) return
                          setPractitionerQuery((p) => ({ ...p, [row._id]: e.target.value }))
                          setPractitionerOpen((p) => ({ ...p, [row._id]: true }))
                          updateField(row._id, 'practitioner', '')
                        }}
                        placeholder="Search doctor…"
                        title={practitionerLocked ? 'Locked to your linked practitioner' : undefined}
                        className={
                          practitionerLocked
                            ? LOCKED_PRACTITIONER_INPUT_CLASS
                            : 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 hover:border-emerald-300/80 focus:border-emerald-400/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/25'
                        }
                      />
                      {practitionerOpen[row._id] && !practitionerLocked && practitionerOptions.length > 0 && (
                        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                          {practitionerOptions.map((opt) => (
                            <button
                              key={opt.name}
                              type="button"
                              onMouseDown={() => selectPractitioner(row._id, opt)}
                              className="block w-full text-left px-3 py-2 text-sm hover:bg-primary/5"
                            >
                              {opt.label || opt.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Branch */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Branch</label>
                      <select
                        value={row.cost_center}
                        onChange={(e) => updateField(row._id, 'cost_center', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm hover:border-emerald-300/80 focus:border-emerald-400/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                      >
                        <option value="">Select…</option>
                        {row.cost_center &&
                        !costCenterOptions.some((o) => o.name === row.cost_center) ? (
                          <option value={row.cost_center}>{row.cost_center}</option>
                        ) : null}
                        {costCenterOptions.map((o) => (
                          <option key={o.name} value={o.name}>
                            {o.label || o.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Remarks */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Remarks</label>
                    <textarea
                      rows={2}
                      value={row.details}
                      onChange={(e) => updateField(row._id, 'details', e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm resize-none shadow-sm placeholder:text-slate-400 hover:border-emerald-300/80 focus:border-emerald-400/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                      placeholder="Additional remarks or notes…"
                    />
                  </div>

                  {/* Date */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Posting date</label>
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
