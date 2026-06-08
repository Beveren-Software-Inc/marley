import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_FOOTER_STICKY,
  CREATE_MODAL_OVERLAY,
  CreateModalHeader,
  createModalShellClass,
  createModalTabButtonClass,
} from '../ui/CreateModalChrome'
import {
  linkComboboxDropdownClass,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'
import { ChevronDown, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { createMorseFallScale, type MorseFallScaleDetailRow } from '../../services/morseFallScale'
import {
  fetchCompanies,
  fetchHealthcarePractitioners,
  fetchInpatientAdmissionOptions,
  getCurrentUserPractitioner,
  type LinkFieldOption,
} from '../../services/common'
import { useCareContext } from '../../providers/CareContextProvider'
import { toast } from '../../hooks/useToast'

interface LinkComboboxProps {
  label: string
  value: string
  required?: boolean
  onSelect: (opt: LinkFieldOption) => void
  onClear: () => void
  fetchOptions: (search: string) => Promise<LinkFieldOption[]>
  placeholder?: string
}

const linkComboboxInputClass = `${linkComboboxInputWithClearClass} hover:border-emerald-300/80`

function LinkCombobox({
  label,
  value,
  required,
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
    if (!open) return
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
  }, [query, open, fetchOptions])

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
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            onClear()
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? 'Search...'}
          className={linkComboboxInputClass}
          autoComplete="off"
        />
        <span className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-slate-400">
          {loadingOptions ? (
            <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-primary rounded-full animate-spin" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </span>
      </div>
      {open && (
        <div className={linkComboboxDropdownClass}>
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">
              {loadingOptions ? 'Searching…' : 'No results found'}
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
  onClose,
  onCreated,
}: CreateMorseFallScaleModalProps) {
  const { activeAdmission } = useCareContext()
  const lockedAdmission = activeAdmission || defaultAdmission || ''

  const [activeTab, setActiveTab] = useState<TabId>('assessment')
  const [admissionOptions, setAdmissionOptions] = useState<{ name: string; label: string }[]>([])
  const [companyOptions, setCompanyOptions] = useState<{ name: string; label: string }[]>([])
  const [selectedAdmission, setSelectedAdmission] = useState<string>(lockedAdmission)
  const [practitioner, setPractitioner] = useState('')
  const [practitionerLabel, setPractitionerLabel] = useState('')
  const [ordererNumber, setOrdererNumber] = useState('')
  const [company, setCompany] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPractitionerOptions = useCallback(
    (search: string) => fetchHealthcarePractitioners(search || undefined),
    []
  )

  // Each category selection: index → chosen points (or null if not chosen)
  const [selections, setSelections] = useState<(number | null)[]>(() =>
    STANDARD_CATEGORIES.map(() => null)
  )
  // Extra free-form rows
  const [extraRows, setExtraRows] = useState<MorseFallScaleDetailRow[]>([])

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

  useEffect(() => {
    getCurrentUserPractitioner()
      .then(async (id) => {
        if (!id) return
        setPractitioner(id)
        try {
          const opts = await fetchHealthcarePractitioners(undefined)
          const match = opts.find((o) => o.name === id)
          setPractitionerLabel(match?.label || id)
        } catch {
          setPractitionerLabel(id)
        }
      })
      .catch(() => {})
  }, [])

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
      await createMorseFallScale({
        admission_no: selectedAdmission,
        patient_no: patient ?? '',
        practitioner,
        orderer_number: ordererNumber || undefined,
        company: company || undefined,
        morse_fall_scale_detail: detailRows,
      })
      toast.success('Morse Fall Scale created')
      onCreated()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create Morse Fall Scale'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('w-full max-w-2xl max-h-[92vh] overflow-hidden')}>
        <CreateModalHeader
          title="Create Morse Fall Scale"
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
            <div className="mx-5 mt-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-2.5 text-xs text-red-700 dark:text-red-400 flex-shrink-0">
              {error}
            </div>
          )}

<div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">            {/* Assessment Tab */}
            {activeTab === 'assessment' && (
              <>
                {/* Header fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Inpatient Admission <span className="text-red-500">*</span>
                    </label>
                    {lockedAdmission ? (
                      <div className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 text-sm">
                        {lockedAdmission}
                      </div>
                    ) : (
                      <select
                        value={selectedAdmission}
                        onChange={(e) => setSelectedAdmission(e.target.value)}
                        required
                        className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
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
                      label="Practitioner"
                      required
                      value={practitionerLabel}
                      fetchOptions={fetchPractitionerOptions}
                      placeholder="Search practitioner…"
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
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Orderer Number
                    </label>
                    <input
                      type="text"
                      value={ordererNumber}
                      onChange={(e) => setOrdererNumber(e.target.value)}
                      placeholder="Optional"
                      className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    />
                  </div>

                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Company
                    </label>
                    <select
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
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
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-3">
                    Morse Fall Scale Assessment
                  </h3>
                  <div className="space-y-3">
                    {STANDARD_CATEGORIES.map((cat, catIdx) => (
                      <div
                        key={catIdx}
                        className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden"
                      >
                        <div className="bg-slate-50 dark:bg-slate-700/50 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {cat.label}
                        </div>
                        <div className="px-3 py-2 flex flex-wrap gap-2">
                          {cat.options.map((opt) => {
                            const active = selections[catIdx] === opt.points
                            return (
                              <button
                                key={opt.points}
                                type="button"
                                onClick={() => handleSelection(catIdx, opt.points)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-all ${
                                  active
                                    ? 'bg-blue-600 border-blue-600 text-white font-medium'
                                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600'
                                }`}
                              >
                                <span>{opt.label}</span>
                                <span
                                  className={`font-semibold rounded px-1 text-[10px] ${
                                    active
                                      ? 'bg-blue-500 text-white'
                                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
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
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                      Additional Notes
                    </h3>
                    <button
                      type="button"
                      onClick={() => setExtraRows((prev) => [...prev, { text_message: '', points: 0 }])}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Add Row
                    </button>
                  </div>
                  {extraRows.length > 0 && (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Description</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 w-24">Points</th>
                            <th className="w-8" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {extraRows.map((row, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-1.5">
                                <input
                                  type="text"
                                  value={row.text_message}
                                  onChange={(e) => handleExtraChange(idx, 'text_message', e.target.value)}
                                  placeholder="Description"
                                  className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-3 py-1.5">
                                <input
                                  type="number"
                                  min={0}
                                  value={row.points}
                                  onChange={(e) => handleExtraChange(idx, 'points', e.target.value)}
                                  className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <button
                                  type="button"
                                  onClick={() => setExtraRows((prev) => prev.filter((_, i) => i !== idx))}
                                  className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
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
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-3">
                    Morse Fall Scale (MFS) Score Interpretation
                  </h3>
                  <div className="space-y-3">
                    <div className="bg-white dark:bg-slate-800 rounded-md p-3 border border-blue-100 dark:border-blue-800">
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">MFS Score (0)</span>{' '}
                        = No Risk of falling; good basic nursing care.
                      </p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-md p-3 border border-blue-100 dark:border-blue-800">
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        <span className="font-semibold text-yellow-600 dark:text-yellow-400">MFS Score (&lt;25)</span>{' '}
                        = Low Risk; implement low fall risk intervention
                      </p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-md p-3 border border-blue-100 dark:border-blue-800">
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        <span className="font-semibold text-orange-600 dark:text-orange-400">MFS Score (25 to 45)</span>{' '}
                        = moderate risk; implement moderate fall risk intervention.
                      </p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-md p-3 border border-blue-100 dark:border-blue-800">
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        <span className="font-semibold text-red-600 dark:text-red-400">MFS Score (&gt;45)</span>{' '}
                        = high risk; Implement high fall risk intervention.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Current score indicator */}
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Current Total Score:</span>
                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{totalPoints} pts</span>
                  </div>
                  <div className={`text-xs font-medium px-3 py-1.5 rounded-md inline-block ${risk.color}`}>
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
                  {saving ? 'Saving…' : 'Create'}
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
