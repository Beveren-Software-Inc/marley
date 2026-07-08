import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchCostCenters,
  fetchHealthcarePractitioners,
  fetchInpatientAdmissionOptions,
  fetchPatientVisits,
  getCurrentUserPractitioner,
  syncCostCenterFromCareEpisode,
  type LinkFieldOption,
} from '../../services/common'
import {
  applyEnvironmentalChecklistTemplate,
  createEnvironmentalChecklist,
  fetchDefaultEnvironmentalChecklistTemplate,
  fetchEnvironmentalChecklist,
  fetchEnvironmentalChecklistTemplates,
  updateEnvironmentalChecklist,
  type EnvironmentalChecklistDetail,
  type EnvironmentalChecklistTemplate,
} from '../../services/environmentalChecklist'
import { toast } from '../../hooks/useToast'
import { useRejectEditModeWhenLocked } from '../../hooks/useRejectEditModeWhenLocked'
import { useCareContext } from '../../providers/CareContextProvider'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_FOOTER_STICKY,
  CREATE_MODAL_OVERLAY,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  linkComboboxDropdownClass,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'
import { ChevronDown, ClipboardCheck } from 'lucide-react'

interface LinkComboboxProps {
  label: string
  value: string
  onSelect: (opt: LinkFieldOption) => void
  onClear: () => void
  fetchOptions: (search: string) => Promise<LinkFieldOption[]>
  placeholder?: string
}

const linkComboboxInputClass =
  `${linkComboboxInputWithClearClass} hover:border-emerald-300/80`

const LinkCombobox = ({ label, value, onSelect, onClear, fetchOptions, placeholder }: LinkComboboxProps) => {
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
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
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

interface EnvironmentalChecklistModalProps {
  patient: string
  patientName?: string
  defaultAdmission?: string
  defaultVisit?: string
  checklistName?: string
  onClose: () => void
  onSuccess: () => void
}

export function EnvironmentalChecklistModal({
  patient,
  patientName,
  defaultAdmission,
  defaultVisit,
  checklistName,
  onClose,
  onSuccess,
}: EnvironmentalChecklistModalProps) {
  const { mode, userCostCenter, costCenterCompany, activeAdmission, activeVisit } = useCareContext()
  const isEdit = Boolean(checklistName)
  useRejectEditModeWhenLocked(isEdit, onClose)
  const isCreate = !isEdit
  const hidePatientVisit = isCreate && mode === 'IP' && Boolean(defaultAdmission)
  const hideInpatientAdmission = isCreate && mode === 'OP' && Boolean(defaultVisit)
  const [inpatientAdmission, setInpatientAdmission] = useState(defaultAdmission || '')
  const [patientVisit, setPatientVisit] = useState(defaultVisit || '')
  const [costCenter, setCostCenter] = useState(userCostCenter || '')
  const [costCenterLabel, setCostCenterLabel] = useState(userCostCenter || '')
  const [practitioner, setPractitioner] = useState('')
  const [practitionerLabel, setPractitionerLabel] = useState('')
  const [templates, setTemplates] = useState<EnvironmentalChecklistTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [details, setDetails] = useState<EnvironmentalChecklistDetail[]>([])
  const [recordName, setRecordName] = useState(checklistName || '')
  const [admissionOptions, setAdmissionOptions] = useState<{ name: string; label: string }[]>([])
  const [visitOptions, setVisitOptions] = useState<{ name: string; label: string }[]>([])
  const [loading, setLoading] = useState(Boolean(checklistName))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPractitionerOptions = useCallback(
    (search: string) => fetchHealthcarePractitioners(search || undefined),
    []
  )

  const fetchCostCenterOptions = useCallback(
    (search: string) => fetchCostCenters(costCenterCompany, search || undefined),
    [costCenterCompany]
  )

  useEffect(() => {
    if (isEdit) return
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
  }, [isEdit])

  useEffect(() => {
    if (!isEdit && userCostCenter && !costCenter) {
      setCostCenter(userCostCenter)
      setCostCenterLabel(userCostCenter)
    }
  }, [isEdit, userCostCenter, costCenter])

  useEffect(() => {
    if (!patient) return
    if (!hideInpatientAdmission) {
      fetchInpatientAdmissionOptions(undefined, patient)
        .then(setAdmissionOptions)
        .catch(() => setAdmissionOptions([]))
    }
    if (!hidePatientVisit) {
      fetchPatientVisits(patient)
        .then(setVisitOptions)
        .catch(() => setVisitOptions([]))
    }
  }, [patient, hideInpatientAdmission, hidePatientVisit])

  useEffect(() => {
    if (defaultAdmission) setInpatientAdmission(defaultAdmission)
  }, [defaultAdmission])

  useEffect(() => {
    if (defaultVisit) setPatientVisit(defaultVisit)
  }, [defaultVisit])

  useEffect(() => {
    if (!isCreate) return
    if (hidePatientVisit) setPatientVisit('')
    if (hideInpatientAdmission) setInpatientAdmission('')
  }, [isCreate, hidePatientVisit, hideInpatientAdmission])

  useEffect(() => {
    if (isEdit) return
    const visitRef = mode === 'OP' ? (patientVisit || activeVisit || '') : undefined
    const admissionRef = mode === 'IP' ? (inpatientAdmission || activeAdmission || '') : undefined
    if (!visitRef && !admissionRef) return
    if (mode !== 'OP' && mode !== 'IP') return

    let cancelled = false
    void syncCostCenterFromCareEpisode(mode, {
      patientVisit: visitRef || undefined,
      inpatientRecord: admissionRef || undefined,
      visits: visitOptions as LinkFieldOption[],
      admissions: admissionOptions as LinkFieldOption[],
    }).then((cc) => {
      if (cancelled || !cc) return
      setCostCenter(cc)
      setCostCenterLabel(cc)
    })
    return () => {
      cancelled = true
    }
  }, [
    isEdit,
    mode,
    patientVisit,
    inpatientAdmission,
    activeVisit,
    activeAdmission,
    visitOptions,
    admissionOptions,
  ])

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const templateList = await fetchEnvironmentalChecklistTemplates()
        setTemplates(templateList)
        if (!isEdit) {
          const defaultTemplate =
            templateList.find((t) => t.default) ||
            (await fetchDefaultEnvironmentalChecklistTemplate())
          if (defaultTemplate?.name) {
            setSelectedTemplate(defaultTemplate.name)
          }
        }
      } catch (err) {
        console.error('Failed to load templates', err)
      }
    }
    loadTemplates()
  }, [isEdit])

  useEffect(() => {
    if (!checklistName) return
    const loadExisting = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchEnvironmentalChecklist(checklistName)
        setRecordName(data.name)
        setInpatientAdmission(data.inpatient_admission || '')
        setPatientVisit(data.patient_visit || '')
        setCostCenter(data.cost_center || userCostCenter || '')
        setCostCenterLabel(data.cost_center || userCostCenter || '')
        setPractitioner(data.practitioner || '')
        setPractitionerLabel(data.practitioner_name || data.practitioner || '')
        setSelectedTemplate(data.environmental_checklist_template || '')
        setDetails(data.details || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load checklist')
      } finally {
        setLoading(false)
      }
    }
    loadExisting()
  }, [checklistName])

  useEffect(() => {
    if (isEdit || !selectedTemplate || recordName) return
    const loadTemplatePreview = async () => {
      try {
        setLoading(true)
        setError(null)
        const template = templates.find((t) => t.name === selectedTemplate)
        const items = template?.checklist_items || []
        setDetails(
          items.map((item, index) => ({
            name: `preview-${index}`,
            item_name: item.item_name,
            checked: false,
          }))
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load template items')
      } finally {
        setLoading(false)
      }
    }
    loadTemplatePreview()
  }, [isEdit, selectedTemplate, templates, recordName])

  const handleTemplateChange = async (templateName: string) => {
    setSelectedTemplate(templateName)
    if (!templateName) {
      setDetails([])
      return
    }

    if (recordName) {
      try {
        setLoading(true)
        setError(null)
        const data = await applyEnvironmentalChecklistTemplate(recordName, templateName)
        setDetails(data.details || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to apply template')
      } finally {
        setLoading(false)
      }
    }
  }

  const handleToggleChecked = (rowName: string) => {
    setDetails((prev) =>
      prev.map((row) =>
        row.name === rowName ? { ...row, checked: !row.checked } : row
      )
    )
  }

  const handleSave = async () => {
    if (!patient) {
      setError('Patient is required.')
      return
    }
    if (!selectedTemplate) {
      setError('Environmental Checklist Template is required.')
      return
    }

    try {
      setSaving(true)
      setError(null)

      let activeName = recordName
      if (!activeName) {
        const created = await createEnvironmentalChecklist({
          patient,
          inpatient_admission: hideInpatientAdmission ? undefined : (inpatientAdmission || undefined),
          patient_visit: hidePatientVisit ? undefined : (patientVisit || undefined),
          template_name: selectedTemplate,
          cost_center: costCenter || undefined,
          practitioner: practitioner || undefined,
        })
        activeName = created.name
        const checkedByItem = Object.fromEntries(details.map((row) => [row.item_name, row.checked]))
        const mergedDetails = (created.details || []).map((row) => ({
          ...row,
          checked: checkedByItem[row.item_name] ?? row.checked,
        }))
        await updateEnvironmentalChecklist(activeName, mergedDetails, {
          costCenter: costCenter || undefined,
          practitioner: practitioner || undefined,
        })
      } else {
        await updateEnvironmentalChecklist(activeName, details, {
          costCenter: costCenter || undefined,
          practitioner: practitioner || undefined,
        })
      }

      toast.success(isEdit ? 'Environmental Checklist updated' : 'Environmental Checklist created')
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save environmental checklist'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('w-full max-w-3xl max-h-[92vh] overflow-hidden')}>
        <CreateModalHeader
          title={isEdit ? 'Environmental Checklist' : 'New Environmental Checklist'}
          icon={<ClipboardCheck className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          subtitle={patientName || patient}
          onClose={onClose}
        />

        <div className={`${CREATE_MODAL_BODY_GRADIENT} flex flex-1 flex-col min-h-0`}>
          {error && (
            <div className="mx-5 mt-3 bg-red-50 border border-red-200 rounded-md p-2.5 text-xs text-red-700 flex-shrink-0">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {!hideInpatientAdmission && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Inpatient Admission</label>
                  {isCreate && mode === 'IP' && defaultAdmission ? (
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      {defaultAdmission}
                    </div>
                  ) : (
                    <select
                      value={inpatientAdmission}
                      onChange={(e) => setInpatientAdmission(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                    >
                      <option value="">— Optional —</option>
                      {admissionOptions.map((option) => (
                        <option key={option.name} value={option.name}>{option.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {!hidePatientVisit && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Patient Visit</label>
                  {isCreate && mode === 'OP' && defaultVisit ? (
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      {defaultVisit}
                    </div>
                  ) : (
                    <select
                      value={patientVisit}
                      onChange={(e) => setPatientVisit(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                    >
                      <option value="">— Optional —</option>
                      {visitOptions.map((option) => (
                        <option key={option.name} value={option.name}>{option.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <LinkCombobox
                label="Doctor Name"
                value={practitionerLabel}
                placeholder="Search doctor..."
                fetchOptions={fetchPractitionerOptions}
                onSelect={(opt) => {
                  setPractitioner(opt.name)
                  setPractitionerLabel(opt.label || opt.name)
                }}
                onClear={() => {
                  setPractitioner('')
                  setPractitionerLabel('')
                }}
              />

              <LinkCombobox
                label="Branch"
                value={costCenterLabel}
                placeholder="Search branch..."
                fetchOptions={fetchCostCenterOptions}
                onSelect={(opt) => {
                  setCostCenter(opt.name)
                  setCostCenterLabel(opt.label || opt.name)
                }}
                onClear={() => {
                  setCostCenter('')
                  setCostCenterLabel('')
                }}
              />

              <div className={hideInpatientAdmission || hidePatientVisit ? '' : 'md:col-span-2'}>
                <label className="block text-xs font-medium text-slate-600 mb-1">Template</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                  disabled={loading || templates.length === 0}
                >
                  <option value="">Choose a template...</option>
                  {templates.map((template) => (
                    <option key={template.name} value={template.name}>
                      {template.name}
                      {template.default ? ' (Default)' : ''}
                      {` (${template.checklist_items?.length || 0} items)`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="text-sm text-slate-500">Loading checklist items...</div>
            ) : details.length === 0 ? (
              <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3 text-sm text-blue-700">
                Select a template to load checklist items.
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
                  <h3 className="text-sm font-semibold text-slate-700">Checklist Items</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Completed: {details.filter((d) => d.checked).length} / {details.length}
                  </p>
                </div>
                <div className="max-h-[420px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase w-12">#</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Item</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-slate-600 uppercase w-24">Done</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {details.map((row, index) => (
                        <tr key={row.name} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-sm text-slate-500 text-center">{index + 1}</td>
                          <td className="px-4 py-2 text-sm text-slate-800">{row.item_name}</td>
                          <td className="px-4 py-2 text-sm text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 text-primary border-slate-300 rounded focus:ring-primary"
                              checked={row.checked}
                              onChange={() => handleToggleChecked(row.name)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className={`${CREATE_MODAL_FOOTER_STICKY} justify-end gap-2`}>
            <button type="button" onClick={onClose} disabled={saving} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || !selectedTemplate || details.length === 0}
              className={CM_BTN_PRIMARY}
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Checklist'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
