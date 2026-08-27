import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_FOOTER_STICKY,
  CREATE_MODAL_OVERLAY,
  CreateModalHeader,
  MODAL_ERROR_BOX_CLASS,
  MODAL_FIELD_CLASS,
  MODAL_FIELD_CLASS_COMPACT,
  MODAL_LABEL_CLASS,
  MODAL_SELECT_CLASS,
  createModalShellClass,
  createModalTabButtonClass,
} from '../ui/CreateModalChrome'
import {
  linkComboboxDropdownClass,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'
import { ChevronDown, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import {
  createMorseFallScale,
  updateMorseFallScale,
  type MorseFallScale,
  type MorseFallScaleDetailRow,
} from '../../services/morseFallScale'
import {
  fetchCompanies,
  fetchHealthcarePractitioners,
  fetchInpatientAdmissionOptions,
  type LinkFieldOption,
} from '../../services/common'
import { useCareContext } from '../../providers/CareContextProvider'
import { toast } from '../../hooks/useToast'
import {
  LOCKED_PRACTITIONER_INPUT_CLASS,
  useLockedLinkedPractitioner,
} from '../../hooks/useLockedLinkedPractitioner'

interface LinkComboboxProps {
  label: string
  value: string
  required?: boolean
  locked?: boolean
  onSelect: (opt: LinkFieldOption) => void
  onClear: () => void
  fetchOptions: (search: string) => Promise<LinkFieldOption[]>
  placeholder?: string
}

const linkComboboxInputClass = `${linkComboboxInputWithClearClass} hover:border-emerald-300/80`

const modalFieldReadOnlyClass = `${MODAL_FIELD_CLASS} cursor-not-allowed bg-slate-50 text-slate-700`

function LinkCombobox({
  label,
  value,
  required,
  locked,
  onSelect,
  onClear,
  fetchOptions,
  placeholder,
}: LinkComboboxProps) {
  const [query, setQuery] = useState(value)
  const [options, setOptions] = useState<LinkFieldOption[]>([])
  const [open, setOpen] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    if (!open || locked) return
    const t = setTimeout(async () => {
      setLoadingOptions(true)
      try {
        setOptions(await fetchOptions(query))
      } catch {
        setOptions([])
      } finally {
        setLoadingOptions(false)
      }
    }, query.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [query, open, fetchOptions, locked])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <label className={`${MODAL_LABEL_CLASS} text-xs`}>
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      <div className="relative">
        <input
          type="text"
          value={query}
          readOnly={locked}
          onChange={(e) => {
            if (locked) return
            setQuery(e.target.value)
            onClear()
            setOpen(true)
          }}
          onFocus={() => {
            if (!locked) setOpen(true)
          }}
          placeholder={placeholder ?? 'Search...'}
          title={locked ? 'Locked to your linked practitioner' : undefined}
          className={locked ? LOCKED_PRACTITIONER_INPUT_CLASS : linkComboboxInputClass}
          autoComplete="off"
        />
        {!locked ? (
        <span className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-slate-400">
          {loadingOptions ? (
            <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-primary rounded-full animate-spin" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </span>
        ) : null}
      </div>
      {open && !locked && (
        <div className={linkComboboxDropdownClass}>
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">
              {loadingOptions ? 'Searching…' : 'NO RESULTS FOUND'}
            </div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.name}
                type="button"
                className={linkComboboxOptionClassCompact}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(opt)
                  setQuery(opt.label || opt.name)
                  setOpen(false)
                }}
              >
                <span className="font-medium text-slate-800">{opt.label || opt.name}</span>
                {opt.label && opt.label !== opt.name ? (
                  <span className="ml-1.5 text-xs text-slate-400">{opt.name}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

interface CreateMorseFallScaleModalProps {
  patient?: string
  patientName?: string
  defaultAdmission?: string
  editRow?: MorseFallScale
  onClose: () => void
  onCreated: () => void
}

// Standard Morse Fall Scale categories with their scoring options
const STANDARD_CATEGORIES: { label: string; options: { label: string; points: number }[] }[] = [
  {
    label: 'History of Falling',
    options: [
      { label: 'No', points: 0 },
      { label: 'Yes', points: 25 },
    ],
  },
  {
    label: 'Secondary Diagnosis',
    options: [
      { label: 'No', points: 0 },
      { label: 'Yes', points: 15 },
    ],
  },
  {
    label: 'Ambulatory Aid',
    options: [
      { label: 'None / Bed Rest / Nurse Assist', points: 0 },
      { label: 'Crutches / Cane / Walker', points: 15 },
      { label: 'Furniture', points: 30 },
    ],
  },
  {
    label: 'IV / Heparin Lock',
    options: [
      { label: 'No', points: 0 },
      { label: 'Yes', points: 20 },
    ],
  },
  {
    label: 'Gait / Transferring',
    options: [
      { label: 'Normal / Bed Rest / Immobile', points: 0 },
      { label: 'Weak', points: 10 },
      { label: 'Impaired', points: 20 },
    ],
  },
  {
    label: 'Mental Status',
    options: [
      { label: 'Oriented to own ability', points: 0 },
      { label: 'Overestimates / Forgets limitations', points: 15 },
    ],
  },
]

function getRiskLevel(total: number): { label: string; color: string } {
  if (total < 25) return { label: 'No Risk', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
  if (total < 51) return { label: 'Low Risk', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' }
  return { label: 'High Risk', color: 'text-red-700 bg-red-50 border-red-200' }
}

type TabId = 'assessment' | 'criteria'

const TABS: { id: TabId; label: string }[] = [
  { id: 'assessment', label: 'Assessment' },
  { id: 'criteria', label: 'Criteria & Guidelines' },
]

export function CreateMorseFallScaleModal({
  patient,
  patientName,
  defaultAdmission,
  editRow,
  onClose,
  onCreated,
}: CreateMorseFallScaleModalProps) {
  const { activeAdmission } = useCareContext()
  const lockedAdmission = editRow?.admission_no || activeAdmission || defaultAdmission || ''
  const isEditMode = Boolean(editRow)
  const {
    locked: practitionerLocked,
    practitionerId: linkedPractitionerId,
    practitionerLabel: linkedPractitionerLabel,
  } = useLockedLinkedPractitioner()
  const practFieldLocked = practitionerLocked && !isEditMode

  const [activeTab, setActiveTab] = useState<TabId>('assessment')
  const [admissionOptions, setAdmissionOptions] = useState<{ name: string; label: string }[]>([])
  const [companyOptions, setCompanyOptions] = useState<{ name: string; label: string }[]>([])
  const [selectedAdmission, setSelectedAdmission] = useState<string>(lockedAdmission)
  const [practitioner, setPractitioner] = useState(editRow?.practitioner || '')
  const [practitionerLabel, setPractitionerLabel] = useState(editRow?.practitioner_name || editRow?.practitioner || '')
  const [ordererNumber, setOrdererNumber] = useState(editRow?.orderer_number || '')
  const [company, setCompany] = useState(editRow?.company || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPractitionerOptions = useCallback(
    (search: string) => fetchHealthcarePractitioners(search || undefined),
    []
  )

  // Each category selection: index → chosen points (or null if not chosen)
  const [selections, setSelections] = useState<(number | null)[]>(() => {
    const initial: (number | null)[] = STANDARD_CATEGORIES.map(() => null)
    if (!editRow?.morse_fall_scale_detail?.length) return initial
    editRow.morse_fall_scale_detail.forEach((detail) => {
      const text = detail.text_message || ''
      STANDARD_CATEGORIES.forEach((cat, idx) => {
        if (text.startsWith(`${cat.label}:`)) {
          initial[idx] = detail.points
        }
      })
    })
    return initial
  })
  // Extra free-form rows
  const [extraRows, setExtraRows] = useState<MorseFallScaleDetailRow[]>(
    () =>
      editRow?.morse_fall_scale_detail?.filter(
        (detail) => !STANDARD_CATEGORIES.some((cat) => detail.text_message?.startsWith(`${cat.label}:`))
      ) || []
  )

  useEffect(() => {
    if (lockedAdmission) setSelectedAdmission(lockedAdmission)
  }, [lockedAdmission])

  useEffect(() => {
    if (patient && !lockedAdmission) {
      fetchInpatientAdmissionOptions(undefined, patient)
        .then(setAdmissionOptions)
        .catch(() => setAdmissionOptions([]))
    } else {
      setAdmissionOptions([])
    }
  }, [patient, lockedAdmission])

  useEffect(() => {
    fetchCompanies()
      .then((opts) => {
        setCompanyOptions(opts)
        if (opts.length) {
          setCompany((prev) => prev || opts[0].name)
        }
      })
      .catch(() => setCompanyOptions([]))
  }, [])

  // Default Doctor Name to linked practitioner for doctors (not admins); lock on create.
  useEffect(() => {
    if (isEditMode || !linkedPractitionerId) return
    setPractitioner((prev) => prev || linkedPractitionerId)
    setPractitionerLabel((prev) => prev || linkedPractitionerLabel || linkedPractitionerId)
  }, [isEditMode, linkedPractitionerId, linkedPractitionerLabel])

  const totalFromStandard = selections.reduce<number>((sum, pts) => sum + (pts ?? 0), 0)
  const totalFromExtra = extraRows.reduce<number>((sum, r) => sum + (r.points || 0), 0)
  const totalPoints = totalFromStandard + totalFromExtra
  const risk = getRiskLevel(totalPoints)

  const handleSelection = (catIdx: number, points: number) => {
    setSelections((prev) => {
      const next = [...prev]
      next[catIdx] = prev[catIdx] === points ? null : points
      return next
    })
  }

  const handleExtraChange = (idx: number, field: keyof MorseFallScaleDetailRow, value: string | number) => {
    setExtraRows((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: field === 'points' ? Number(value) || 0 : value }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedAdmission) {
      setError('Please select an inpatient admission.')
      return
    }
    if (!practitioner) {
      setError('Please select a practitioner.')
      return
    }

    // Build detail rows: standard categories (only selected ones) + extra rows
    const detailRows: MorseFallScaleDetailRow[] = []
    STANDARD_CATEGORIES.forEach((cat, idx) => {
      const pts = selections[idx]
      if (pts !== null) {
        const optLabel = cat.options.find((o) => o.points === pts)?.label ?? String(pts)
        detailRows.push({ text_message: `${cat.label}: ${optLabel}`, points: pts })
      }
    })
    extraRows.forEach((r) => {
      if (r.text_message?.trim()) detailRows.push(r)
    })

    try {
      setSaving(true)
      const payload = {
        admission_no: selectedAdmission,
        patient_no: patient ?? editRow?.patient_no ?? '',
        practitioner,
        orderer_number: ordererNumber || undefined,
        company: company || undefined,
        morse_fall_scale_detail: detailRows,
      }
      if (editRow) {
        await updateMorseFallScale({ ...payload, name: editRow.name })
      } else {
        await createMorseFallScale(payload)
      }
      toast.success(`Morse Fall Scale ${editRow ? 'updated' : 'created'}`)
      onCreated()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed to ${editRow ? 'update' : 'create'} Morse Fall Scale`
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={`${createModalShellClass('w-full max-w-2xl max-h-[92vh] overflow-hidden')} [color-scheme:light]`}>
        <CreateModalHeader
          title={isEditMode ? 'Edit Morse Fall Scale' : 'Create Morse Fall Scale'}
          icon={<ShieldAlert className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          subtitle={patientName || undefined}
          onClose={onClose}
        >
          <div className="-mb-px mt-3 flex border-b border-emerald-100/80">
            {TABS.map((tab) => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                className={createModalTabButtonClass(activeTab === tab.id)}
              >
                {tab.label}
                {tab.id === 'assessment' && (
                  <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                    {totalPoints} pts
                  </span>
                )}
              </button>
            ))}
          </div>
        </CreateModalHeader>

        <form onSubmit={handleSubmit} className={`${CREATE_MODAL_BODY_GRADIENT} flex flex-1 flex-col min-h-0`}>
          {error && (
            <div className={`mx-5 mt-3 flex-shrink-0 ${MODAL_ERROR_BOX_CLASS}`}>
              {error}
            </div>
          )}

<div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">            {/* Assessment Tab */}
            {activeTab === 'assessment' && (
              <>
                {/* Header fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`${MODAL_LABEL_CLASS} text-xs`}>
                      Inpatient Admission <span className="text-red-500">*</span>
                    </label>
                    {lockedAdmission ? (
                      <div className={modalFieldReadOnlyClass}>
                        {lockedAdmission}
                      </div>
                    ) : (
                      <select
                        value={selectedAdmission}
                        onChange={(e) => setSelectedAdmission(e.target.value)}
                        required
                        className={MODAL_SELECT_CLASS}
                      >
                        <option value="">— Select admission —</option>
                        {admissionOptions.map((a) => (
                          <option key={a.name} value={a.name}>{a.label}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <LinkCombobox
                      label="Username"
                      required
                      value={practitionerLabel}
                      locked={practFieldLocked}
                      fetchOptions={fetchPractitionerOptions}
                      placeholder="Search username…"
                      onSelect={(opt) => {
                        setPractitioner(opt.name)
                        setPractitionerLabel(opt.label || opt.name)
                      }}
                      onClear={() => {
                        setPractitioner('')
                        setPractitionerLabel('')
                      }}
                    />
                  </div>

                  <div>
                    <label className={`${MODAL_LABEL_CLASS} text-xs`}>
                      Orderer Number
                    </label>
                    <input
                      type="text"
                      value={ordererNumber}
                      onChange={(e) => setOrdererNumber(e.target.value)}
                      placeholder="Optional"
                      className={MODAL_FIELD_CLASS}
                    />
                  </div>

                  <div className="col-span-2 md:col-span-1">
                    <label className={`${MODAL_LABEL_CLASS} text-xs`}>
                      Company
                    </label>
                    <select
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className={MODAL_SELECT_CLASS}
                    >
                      <option value="">— None —</option>
                      {companyOptions.map((c) => (
                        <option key={c.name} value={c.name}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Score categories */}
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-emerald-950">
                    Morse Fall Scale Assessment
                  </h3>
                  <div className="space-y-3">
                    {STANDARD_CATEGORIES.map((cat, catIdx) => (
                      <div
                        key={catIdx}
                        className="overflow-hidden rounded-lg border border-emerald-100/80 bg-white shadow-sm"
                      >
                        <div className="border-b border-emerald-100/80 bg-emerald-50/50 px-3 py-2 text-xs font-semibold text-emerald-900">
                          {cat.label}
                        </div>
                        <div className="flex flex-wrap gap-2 px-3 py-2">
                          {cat.options.map((opt) => {
                            const active = selections[catIdx] === opt.points
                            return (
                              <button
                                key={opt.points}
                                type="button"
                                onClick={() => handleSelection(catIdx, opt.points)}
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all ${
                                  active
                                    ? 'border-emerald-600 bg-emerald-600 font-medium text-white shadow-sm'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-800'
                                }`}
                              >
                                <span>{opt.label}</span>
                                <span
                                  className={`rounded px-1 text-[10px] font-semibold ${
                                    active
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {opt.points} pts
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Extra free-form rows */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-950">
                      Additional Notes
                    </h3>
                    <button
                      type="button"
                      onClick={() => setExtraRows((prev) => [...prev, { text_message: '', points: 0 }])}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200/80 bg-white px-2 py-1 text-xs text-emerald-800 transition-colors hover:bg-emerald-50"
                    >
                      <Plus className="w-3 h-3" />
                      Add Row
                    </button>
                  </div>
                  {extraRows.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-emerald-100/80 bg-white">
                      <table className="w-full text-xs">
                        <thead className="border-b border-emerald-100/80 bg-emerald-50/50">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-emerald-900">Description</th>
                            <th className="w-24 px-3 py-2 text-left font-semibold text-emerald-900">Points</th>
                            <th className="w-8" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {extraRows.map((row, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-1.5">
                                <input
                                  type="text"
                                  value={row.text_message}
                                  onChange={(e) => handleExtraChange(idx, 'text_message', e.target.value)}
                                  placeholder="Description"
                                  className={MODAL_FIELD_CLASS_COMPACT}
                                />
                              </td>
                              <td className="px-3 py-1.5">
                                <input
                                  type="number"
                                  min={0}
                                  value={row.points}
                                  onChange={(e) => handleExtraChange(idx, 'points', e.target.value)}
                                  className={MODAL_FIELD_CLASS_COMPACT}
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <button
                                  type="button"
                                  onClick={() => setExtraRows((prev) => prev.filter((_, i) => i !== idx))}
                                  className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Criteria Tab */}
            {activeTab === 'criteria' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-emerald-100/80 bg-emerald-50/40 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-emerald-900">
                    Morse Fall Scale (MFS) Score Interpretation
                  </h3>
                  <div className="space-y-3">
                    <div className="rounded-md border border-emerald-100/80 bg-white p-3">
                      <p className="text-sm text-slate-700">
                        <span className="font-semibold text-emerald-600">MFS Score (0)</span>{' '}
                        = No Risk of falling; good basic nursing care.
                      </p>
                    </div>
                    <div className="rounded-md border border-emerald-100/80 bg-white p-3">
                      <p className="text-sm text-slate-700">
                        <span className="font-semibold text-yellow-600">MFS Score (&lt;25)</span>{' '}
                        = Low Risk; implement low fall risk intervention
                      </p>
                    </div>
                    <div className="rounded-md border border-emerald-100/80 bg-white p-3">
                      <p className="text-sm text-slate-700">
                        <span className="font-semibold text-orange-600">MFS Score (25 to 45)</span>{' '}
                        = moderate risk; implement moderate fall risk intervention.
                      </p>
                    </div>
                    <div className="rounded-md border border-emerald-100/80 bg-white p-3">
                      <p className="text-sm text-slate-700">
                        <span className="font-semibold text-red-600">MFS Score (&gt;45)</span>{' '}
                        = high risk; Implement high fall risk intervention.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-100/80 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">Current Total Score:</span>
                    <span className="text-lg font-bold text-emerald-700">{totalPoints} pts</span>
                  </div>
                  <div className={`inline-block rounded-md px-3 py-1.5 text-xs font-medium ${risk.color}`}>
                    {risk.label}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={`${CREATE_MODAL_FOOTER_STICKY} items-center justify-between`}>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-emerald-900">
                Total: <span className="text-emerald-700">{totalPoints} pts</span>
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${risk.color}`}>
                {risk.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} disabled={saving} className={CM_BTN_CANCEL}>
                Cancel
              </button>
              {activeTab === 'assessment' && (
                <button
                  type="submit"
                  disabled={saving || !selectedAdmission || !practitioner}
                  className={CM_BTN_PRIMARY}
                >
                  {saving ? 'Saving…' : isEditMode ? 'Update' : 'Create'}
                </button>
              )}
              {activeTab === 'criteria' && (
                <button type="button" onClick={() => setActiveTab('assessment')} className={CM_BTN_PRIMARY}>
                  Back to Assessment
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
