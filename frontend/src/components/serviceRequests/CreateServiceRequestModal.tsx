import { useEffect, useMemo, useState } from 'react'
import { Calendar, ClipboardList, Layers, Stethoscope, Tag, User, Wallet } from 'lucide-react'
import { fetchPatients, searchPatients, type PatientListItem } from '../../services/patients'
import {
  fetchCostCenters,
  fetchHealthcarePractitioners,
  fetchInpatientAdmissions,
  fetchPatientVisits,
  fetchServiceRequestTemplateTypes,
  fetchServiceRequestTemplates,
  type LinkFieldOption,
} from '../../services/common'
import { createServiceRequest } from '../../services/serviceRequests'
import { toast } from '../../hooks/useToast'
import { useCareContext } from '../../providers/CareContextProvider'
import { useFormatMoney } from '../../hooks/useFormatMoney'
import {
  linkComboboxDropdownClass,
  linkComboboxDropdownClassShort,
  linkComboboxInputClass as inputClass,
} from '../ui/linkComboboxStyles'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_FOOTER_STICKY,
  CREATE_MODAL_OVERLAY,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'

type LabTemplateGroupFilter = 'all' | 'group' | 'single'

interface CreateServiceRequestModalProps {
  onClose: () => void
  onSuccess: () => void
  initialPatient?: string
  initialTemplate?: string
  defaultTemplateType?: string
  /**
   * Doctor, Lab page, and template list “request lab” flows: template type read-only as Lab Test Template,
   * searchable templates, and optional group/single filter (`is_group` on Lab Test Template).
   */
  labTestTemplateOnly?: boolean
}

interface PricingRow {
  patient_category: string
  multiplier?: number | null
  price: number | null
}

interface GroupTemplateRow {
  template_dn: string
  template_label: string
  pricing: PricingRow[]
}

interface PricingResponse {
  is_group?: boolean
  pricing?: PricingRow[]
  group_templates?: GroupTemplateRow[]
}

/** Visual theme for patient category pricing (Military / VIP / Regular / …). */
function getPatientCategoryTheme(category: string): {
  chip: string
  card: string
  ring: string
  dot: string
} {
  const c = (category || '').toLowerCase()
  if (c.includes('military') || c.includes('defence') || c.includes('defense')) {
    return {
      chip: 'bg-sky-600 text-white shadow-sm',
      card: 'border-sky-200/90 bg-gradient-to-br from-sky-50 via-blue-50/70 to-sky-100/50',
      ring: 'ring-2 ring-sky-400/40',
      dot: 'bg-sky-600',
    }
  }
  if (c.includes('vip') || c.includes('premium') || c.includes('executive')) {
    return {
      chip: 'bg-amber-500 text-amber-950 shadow-sm',
      card: 'border-amber-300/90 bg-gradient-to-br from-amber-50 via-amber-100/50 to-orange-100/40',
      ring: 'ring-2 ring-amber-400/45',
      dot: 'bg-amber-500',
    }
  }
  if (c.includes('regular') || c.includes('standard') || c.includes('civilian') || c === 'op' || c.includes('general')) {
    return {
      chip: 'bg-emerald-600 text-white shadow-sm',
      card: 'border-emerald-300/90 bg-gradient-to-br from-emerald-50 via-teal-50/60 to-cyan-50/40',
      ring: 'ring-2 ring-emerald-500/35',
      dot: 'bg-emerald-600',
    }
  }
  return {
    chip: 'bg-emerald-600 text-white shadow-sm',
    card: 'border-emerald-200/90 bg-gradient-to-br from-emerald-50 via-teal-50/50 to-cyan-50/40',
    ring: 'ring-2 ring-emerald-400/35',
    dot: 'bg-emerald-500',
  }
}

const selectClass = inputClass

const labelClass = 'mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500'

const sectionCard = 'rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5'
const sectionTitle = 'mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-900/90'

export const CreateServiceRequestModal = ({
  onClose,
  onSuccess,
  initialPatient,
  initialTemplate,
  defaultTemplateType,
  labTestTemplateOnly = false,
}: CreateServiceRequestModalProps) => {
  const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  const formatMoney = useFormatMoney()

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [templateTypes, setTemplateTypes] = useState<LinkFieldOption[]>([])
  const [templates, setTemplates] = useState<LinkFieldOption[]>([])
  const [templateSearchQuery, setTemplateSearchQuery] = useState('')
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false)
  const [labTemplateFilter, setLabTemplateFilter] = useState<LabTemplateGroupFilter>('all')
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerSearchQuery, setPractitionerSearchQuery] = useState('')
  const [practitionerDropdownOpen, setPractitionerDropdownOpen] = useState(false)
  const [costCenterOptions, setCostCenterOptions] = useState<LinkFieldOption[]>([])
  const [costCenterSearchQuery, setCostCenterSearchQuery] = useState('')
  const [costCenterDropdownOpen, setCostCenterDropdownOpen] = useState(false)
  const [patientVisits, setPatientVisits] = useState<LinkFieldOption[]>([])
  const [admissions, setAdmissions] = useState<LinkFieldOption[]>([])

  const [patientQuery, setPatientQuery] = useState(initialPatient || contextPatient || '')
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientCategory, setPatientCategory] = useState('')
  const [patientOpen, setPatientOpen] = useState(false)

  const [pricingRows, setPricingRows] = useState<PricingRow[]>([])
  const [groupRows, setGroupRows] = useState<GroupTemplateRow[]>([])
  const [selectedGroupTemplates, setSelectedGroupTemplates] = useState<string[]>([])
  /** Selected pricing tier (patient_category) for non-group templates — avoids duplicate-price radio bugs. */
  const [selectedPricingCategory, setSelectedPricingCategory] = useState<string | null>(null)

  const [form, setForm] = useState({
    patient: initialPatient || contextPatient || '',
    template_dt: '',
    template_dn: '',
    practitioner: '',
    patient_visit: mode === 'OP' ? activeVisit || '' : '',
    inpatient_record: mode === 'IP' ? activeAdmission || '' : '',
    cost_center: '',
    order_date: new Date().toISOString().slice(0, 10),
    order_time: new Date().toTimeString().slice(0, 5),
  })

  const isGroupTemplate = groupRows.length > 0

  const getBestPrice = (rows: PricingRow[]) => {
    if (!rows.length) return null
    if (patientCategory) {
      const match = rows.find((r) => r.patient_category === patientCategory && r.price != null)
      if (match?.price != null) return Number(match.price)
    }
    const first = rows.find((r) => r.price != null)
    return first?.price != null ? Number(first.price) : null
  }

  const groupTotal = useMemo(() => {
    if (!isGroupTemplate) return 0
    return selectedGroupTemplates.reduce((total, templateDn) => {
      const row = groupRows.find((entry) => entry.template_dn === templateDn)
      if (!row) return total
      return total + (getBestPrice(row.pricing) || 0)
    }, 0)
  }, [groupRows, isGroupTemplate, patientCategory, selectedGroupTemplates])

  const nonGroupLineTotal = useMemo(() => {
    if (isGroupTemplate) return 0
    if (selectedPricingCategory) {
      const row = pricingRows.find((r) => r.patient_category === selectedPricingCategory)
      return row?.price != null ? Number(row.price) : 0
    }
    return getBestPrice(pricingRows) || 0
  }, [isGroupTemplate, pricingRows, selectedPricingCategory, patientCategory])

  const grandTotal = isGroupTemplate ? groupTotal : nonGroupLineTotal

  useEffect(() => {
    const load = async () => {
      const types = await fetchServiceRequestTemplateTypes()
      setTemplateTypes(types)

      if (labTestTemplateOnly) {
        setForm((prev) => ({ ...prev, template_dt: 'Lab Test Template' }))
        return
      }

      const initialIsType = !!initialTemplate && types.some((t) => t.name === initialTemplate)
      const templateType = initialIsType
        ? initialTemplate || ''
        : defaultTemplateType || (initialTemplate ? 'Lab Test Template' : '')

      if (templateType) {
        setForm((prev) => ({ ...prev, template_dt: templateType }))
      }
    }
    load().catch(() => {})
  }, [defaultTemplateType, initialTemplate, labTestTemplateOnly])

  useEffect(() => {
    if (!form.template_dt) {
      setTemplates([])
      return
    }
    const isGroupParam =
      form.template_dt === 'Lab Test Template' && labTemplateFilter !== 'all'
        ? labTemplateFilter === 'group'
          ? 1
          : 0
        : undefined

    const run = () => {
      fetchServiceRequestTemplates(
        form.template_dt,
        templateSearchQuery.trim() || undefined,
        undefined,
        isGroupParam
      )
        .then((rows) => {
          setTemplates(rows)
          const initialIsType = !!initialTemplate && templateTypes.some((t) => t.name === initialTemplate)
          if (initialTemplate && !initialIsType && !form.template_dn) {
            const matched = rows.find((r) => r.name === initialTemplate || r.label === initialTemplate)
            if (matched) {
              setForm((prev) => ({ ...prev, template_dn: matched.name }))
              setTemplateSearchQuery(matched.label || matched.name)
            }
          }
        })
        .catch(() => setTemplates([]))
    }

    const delay = templateSearchQuery.trim() ? 280 : 0
    const t = setTimeout(run, delay)
    return () => clearTimeout(t)
  }, [form.template_dt, templateSearchQuery, labTemplateFilter, initialTemplate, templateTypes])

  useEffect(() => {
    if (!form.patient) return
    fetchPatientVisits(form.patient).then(setPatientVisits).catch(() => setPatientVisits([]))
    fetchInpatientAdmissions(form.patient).then(setAdmissions).catch(() => setAdmissions([]))
    fetch(`/api/resource/Patient/${encodeURIComponent(form.patient)}?fields=["category"]`)
      .then((r) => r.json())
      .then((data) => setPatientCategory(data?.data?.category || ''))
      .catch(() => setPatientCategory(''))
  }, [form.patient])

  useEffect(() => {
    if (!practitionerDropdownOpen) return
    const run = () => {
      fetchHealthcarePractitioners(practitionerSearchQuery.trim() || undefined)
        .then(setPractitionerOptions)
        .catch(() => setPractitionerOptions([]))
    }
    const delay = practitionerSearchQuery.trim() ? 280 : 0
    const t = setTimeout(run, delay)
    return () => clearTimeout(t)
  }, [practitionerDropdownOpen, practitionerSearchQuery])

  useEffect(() => {
    if (!costCenterDropdownOpen) return
    const run = () => {
      fetchCostCenters(undefined, costCenterSearchQuery.trim() || undefined)
        .then(setCostCenterOptions)
        .catch(() => setCostCenterOptions([]))
    }
    const delay = costCenterSearchQuery.trim() ? 280 : 0
    const t = setTimeout(run, delay)
    return () => clearTimeout(t)
  }, [costCenterDropdownOpen, costCenterSearchQuery])

  useEffect(() => {
    if (!form.template_dt || !form.template_dn) {
      setPricingRows([])
      setGroupRows([])
      setSelectedGroupTemplates([])
      setSelectedPricingCategory(null)
      return
    }
    fetch(
      `/api/method/healthcare.api.service_request.get_service_request_template_pricing?template_dt=${encodeURIComponent(
        form.template_dt
      )}&template_dn=${encodeURIComponent(form.template_dn)}`
    )
      .then((res) => res.json())
      .then((data) => {
        const payload: PricingResponse = data?.message || {}
        const rows = Array.isArray(payload.pricing) ? payload.pricing : []
        const groups = Array.isArray(payload.group_templates) ? payload.group_templates : []
        setPricingRows(rows)
        setGroupRows(groups)
        if (groups.length > 0) {
          setSelectedGroupTemplates(groups.map((row) => row.template_dn))
          setSelectedPricingCategory(null)
        } else {
          setSelectedGroupTemplates([])
          const match =
            rows.find((r) => patientCategory && r.patient_category === patientCategory && r.price != null) ||
            rows.find((r) => r.price != null)
          setSelectedPricingCategory(match?.patient_category ?? null)
        }
      })
      .catch(() => {
        setPricingRows([])
        setGroupRows([])
        setSelectedGroupTemplates([])
        setSelectedPricingCategory(null)
      })
  }, [form.template_dt, form.template_dn, patientCategory])

  useEffect(() => {
    if (!patientOpen) return
    const timer = setTimeout(async () => {
      const rows = patientQuery.trim() ? await searchPatients(patientQuery, 20) : await fetchPatients(20, 0)
      setPatientOptions(rows)
    }, 300)
    return () => clearTimeout(timer)
  }, [patientOpen, patientQuery])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!form.patient || !form.template_dt || !form.template_dn) {
      setError('Patient, Template Type and Template are required.')
      return
    }
    if (mode === 'OP' && !form.patient_visit?.trim()) {
      setError('Select a patient visit for this outpatient request.')
      return
    }
    if (mode === 'IP' && !form.inpatient_record?.trim()) {
      setError('Select an inpatient admission for this inpatient request.')
      return
    }
    if (isGroupTemplate && selectedGroupTemplates.length === 0) {
      setError('Select at least one child template for grouped lab tests.')
      return
    }

    try {
      setSubmitting(true)
      await createServiceRequest({
        patient: form.patient,
        template_dt: form.template_dt,
        template_dn: form.template_dn,
        practitioner: form.practitioner || undefined,
        patient_visit: form.patient_visit || undefined,
        inpatient_record: form.inpatient_record || undefined,
        order_date: form.order_date,
        order_time: form.order_time,
        cost_center: form.cost_center || undefined,
        cost: grandTotal,
        grand_total: grandTotal,
        selected_group_templates: isGroupTemplate ? selectedGroupTemplates : undefined,
      })
      toast.success('Service Request created')
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create service request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-3xl max-h-[92vh] overflow-hidden')}>
        <CreateModalHeader
          title="Create Service Request"
          onClose={onClose}
          icon={<ClipboardList className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
        />

        <form onSubmit={handleSubmit} className={CREATE_MODAL_BODY_GRADIENT}>
          <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
            {error && (
              <div className="rounded-xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm">
                {error}
              </div>
            )}

            {/* Patient & practitioner */}
            <div className={sectionCard}>
              <div className={sectionTitle}>
                <User className="h-4 w-4 text-emerald-600" />
                Patient & ordering clinician
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="relative md:col-span-1">
                  <label className={labelClass}>
                    <span className="text-red-500">*</span> Patient
                  </label>
                  <input
                    value={patientQuery}
                    onChange={(e) => {
                      setPatientQuery(e.target.value)
                      setPatientOpen(true)
                    }}
                    onFocus={() => setPatientOpen(true)}
                    className={inputClass}
                    placeholder="Search by name or ID…"
                  />
                  {patientOpen && (
                    <div className={linkComboboxDropdownClassShort}>
                      {patientOptions.map((patient) => (
                        <button
                          key={patient.name}
                          type="button"
                          className="block w-full px-3 py-2.5 text-left text-sm text-slate-800 transition hover:bg-emerald-50"
                          onMouseDown={() => {
                            setForm((prev) => ({ ...prev, patient: patient.name }))
                            setPatientQuery(patient.patient_name || patient.name)
                            setPatientOpen(false)
                          }}
                        >
                          <span className="font-medium">{patient.patient_name || patient.name}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">{patient.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <label className={labelClass}>
                    <Stethoscope className="h-3.5 w-3.5 text-emerald-500" />
                    Practitioner
                  </label>
                  <input
                    type="text"
                    value={practitionerSearchQuery}
                    onChange={(e) => {
                      setPractitionerSearchQuery(e.target.value)
                      setForm((prev) => ({ ...prev, practitioner: '' }))
                      setPractitionerDropdownOpen(true)
                    }}
                    onFocus={() => setPractitionerDropdownOpen(true)}
                    onBlur={() => {
                      window.setTimeout(() => setPractitionerDropdownOpen(false), 180)
                    }}
                    placeholder="Search practitioner name…"
                    className={inputClass}
                  />
                  {practitionerDropdownOpen && (
                    <div className={linkComboboxDropdownClass}>
                      {practitionerOptions.length === 0 ? (
                        <div className="px-3 py-2.5 text-xs text-slate-500">No practitioners match. Try another search.</div>
                      ) : (
                        practitionerOptions.map((item) => (
                          <button
                            key={item.name}
                            type="button"
                            className="block w-full border-b border-slate-50 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-emerald-50/80"
                            onMouseDown={() => {
                              setForm((prev) => ({ ...prev, practitioner: item.name }))
                              setPractitionerSearchQuery(item.label || item.name)
                              setPractitionerDropdownOpen(false)
                            }}
                          >
                            <span className="font-medium text-slate-900">{item.label || item.name}</span>
                            {item.department ? (
                              <span className="mt-0.5 block text-xs text-slate-500">{item.department}</span>
                            ) : null}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  <p className="mt-1.5 text-[11px] text-slate-500">Type to search; pick a row to select (optional).</p>
                </div>
              </div>
              {patientCategory ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">Patient record category</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getPatientCategoryTheme(patientCategory).chip}`}
                  >
                    {patientCategory}
                  </span>
                  <span className="text-xs text-slate-400">Used to pick default price tier when available.</span>
                </div>
              ) : null}
            </div>

            {/* Template */}
            <div className={sectionCard}>
              <div className={sectionTitle}>
                <Layers className="h-4 w-4 text-emerald-600" />
                Service template
                {labTestTemplateOnly && (
                  <span className="ml-auto rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                    Lab tests
                  </span>
                )}
              </div>
              {form.template_dt === 'Lab Test Template' && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">Show</span>
                  {(
                    [
                      { key: 'all' as const, label: 'All' },
                      { key: 'group' as const, label: 'Group tests' },
                      { key: 'single' as const, label: 'Single tests' },
                    ] as const
                  ).map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setLabTemplateFilter(key)
                        setForm((prev) => ({ ...prev, template_dn: '' }))
                        setTemplateSearchQuery('')
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        labTemplateFilter === key
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'border border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={labelClass}>
                    <span className="text-red-500">*</span> Template type
                  </label>
                  {labTestTemplateOnly ? (
                    <select
                      disabled
                      value="Lab Test Template"
                      aria-readonly
                      className={`${selectClass} cursor-not-allowed bg-emerald-50/70 text-slate-800 opacity-100`}
                    >
                      <option value="Lab Test Template">Lab Test Template</option>
                    </select>
                  ) : (
                    <select
                      value={form.template_dt}
                      onChange={(e) => {
                        const v = e.target.value
                        setForm((prev) => ({ ...prev, template_dt: v, template_dn: '' }))
                        setTemplateSearchQuery('')
                        setLabTemplateFilter('all')
                      }}
                      className={selectClass}
                    >
                      <option value="">Select type…</option>
                      {templateTypes.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.label || item.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className={labelClass}>
                    <span className="text-red-500">*</span>{' '}
                    {labTestTemplateOnly || form.template_dt === 'Lab Test Template' ? 'Lab test template' : 'Template'}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={templateSearchQuery}
                      onChange={(e) => {
                        setTemplateSearchQuery(e.target.value)
                        setForm((prev) => ({ ...prev, template_dn: '' }))
                        setTemplateDropdownOpen(true)
                      }}
                      onFocus={() => setTemplateDropdownOpen(true)}
                      onBlur={() => {
                        window.setTimeout(() => setTemplateDropdownOpen(false), 180)
                      }}
                      disabled={!form.template_dt}
                      placeholder={form.template_dt ? 'Search template name…' : 'Choose template type first…'}
                      className={inputClass}
                    />
                    {templateDropdownOpen && form.template_dt && (
                      <div className={linkComboboxDropdownClass}>
                        {templates.length === 0 ? (
                          <div className="px-3 py-2.5 text-xs text-slate-500">No templates match. Try another search or filter.</div>
                        ) : (
                          templates.map((item) => {
                            const group = Number(item.is_group) === 1
                            return (
                              <button
                                key={item.name}
                                type="button"
                                className="flex w-full items-center justify-between gap-2 border-b border-slate-50 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-emerald-50/80"
                                onMouseDown={() => {
                                  setForm((prev) => ({ ...prev, template_dn: item.name }))
                                  setTemplateSearchQuery(item.label || item.name)
                                  setTemplateDropdownOpen(false)
                                }}
                              >
                                <span className="font-medium text-slate-900">{item.label || item.name}</span>
                                {form.template_dt === 'Lab Test Template' && (
                                  <span
                                    className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                                      group ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {group ? 'Group' : 'Single'}
                                  </span>
                                )}
                              </button>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">Type to search; pick a row to select. Group templates include multiple child tests.</p>
                </div>
              </div>
              {!isGroupTemplate && pricingRows.length > 0 && (
                <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Tag className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  Multiple price tiers below — colors help distinguish Military, VIP, and Regular (and other) categories.
                </p>
              )}
            </div>

            {/* Context & billing */}
            <div className={sectionCard}>
              <div className={sectionTitle}>
                <Calendar className="h-4 w-4 text-emerald-600" />
                Visit, admission & schedule
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {mode === 'OP' && (
                  <div>
                    <label className={labelClass}>Patient visit (OP)</label>
                    <select
                      value={form.patient_visit}
                      onChange={(e) => setForm((prev) => ({ ...prev, patient_visit: e.target.value }))}
                      className={selectClass}
                    >
                      <option value="">None / select visit…</option>
                      {patientVisits.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.label || item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {mode === 'IP' && (
                  <div>
                    <label className={labelClass}>Inpatient admission (IP)</label>
                    <select
                      value={form.inpatient_record}
                      onChange={(e) => setForm((prev) => ({ ...prev, inpatient_record: e.target.value }))}
                      className={selectClass}
                    >
                      <option value="">None / select admission…</option>
                      {admissions.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.label || item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="relative">
                  <label className={labelClass}>Cost center</label>
                  <input
                    type="text"
                    value={costCenterSearchQuery}
                    onChange={(e) => {
                      setCostCenterSearchQuery(e.target.value)
                      setForm((prev) => ({ ...prev, cost_center: '' }))
                      setCostCenterDropdownOpen(true)
                    }}
                    onFocus={() => setCostCenterDropdownOpen(true)}
                    onBlur={() => {
                      window.setTimeout(() => setCostCenterDropdownOpen(false), 180)
                    }}
                    placeholder="Search cost center…"
                    className={inputClass}
                  />
                  {costCenterDropdownOpen && (
                    <div className={linkComboboxDropdownClass}>
                      {costCenterOptions.length === 0 ? (
                        <div className="px-3 py-2.5 text-xs text-slate-500">No cost centers match. Try another search.</div>
                      ) : (
                        costCenterOptions.map((item) => (
                          <button
                            key={item.name}
                            type="button"
                            className="block w-full border-b border-slate-50 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-emerald-50/80"
                            onMouseDown={() => {
                              setForm((prev) => ({ ...prev, cost_center: item.name }))
                              setCostCenterSearchQuery(item.label || item.name)
                              setCostCenterDropdownOpen(false)
                            }}
                          >
                            <span className="font-medium text-slate-900">{item.label || item.name}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  <p className="mt-1.5 text-[11px] text-slate-500">Type to search; pick a row to select (optional).</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Order date</label>
                    <input
                      type="date"
                      value={form.order_date}
                      onChange={(e) => setForm((prev) => ({ ...prev, order_date: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Order time</label>
                    <input
                      type="time"
                      value={form.order_time}
                      onChange={(e) => setForm((prev) => ({ ...prev, order_time: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Group templates */}
            {isGroupTemplate && (
              <div className={`${sectionCard} border-emerald-200/90 bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/40`}>
                <div className={sectionTitle}>
                  <Layers className="h-4 w-4 text-emerald-600" />
                  Tests in this group
                </div>
                <p className="mb-3 text-xs text-slate-600">
                  Tick the child lab tests to include in this request. You can select any number of them. Line amounts use the patient&apos;s
                  category when available.
                </p>
                <div className="space-y-2.5">
                  {groupRows.map((row) => {
                    const checked = selectedGroupTemplates.includes(row.template_dn)
                    const price = getBestPrice(row.pricing) || 0
                    return (
                      <label
                        key={row.template_dn}
                        className={`flex cursor-pointer flex-col gap-2 rounded-xl border px-3 py-3 transition sm:flex-row sm:items-center sm:justify-between ${
                          checked
                            ? 'border-emerald-400 bg-emerald-50/80 ring-2 ring-emerald-400/30'
                            : 'border-slate-200/90 bg-white hover:border-emerald-200'
                        }`}
                      >
                        <span className="flex items-start gap-3 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedGroupTemplates((prev) =>
                                e.target.checked ? [...prev, row.template_dn] : prev.filter((name) => name !== row.template_dn)
                              )
                            }}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>
                            <span className="font-medium text-slate-900">{row.template_label}</span>
                            {row.pricing && row.pricing.length > 0 && (
                              <span className="mt-1.5 flex flex-wrap gap-1.5">
                                {row.pricing.map((p) => {
                                  const t = getPatientCategoryTheme(p.patient_category)
                                  return (
                                    <span
                                      key={`${row.template_dn}-${p.patient_category}`}
                                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${t.chip}`}
                                      title={`${p.patient_category}: ${formatMoney(p.price != null ? Number(p.price) : 0)}`}
                                    >
                                      {p.patient_category}
                                      {p.price != null ? ` · ${formatMoney(Number(p.price))}` : ''}
                                    </span>
                                  )
                                })}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-lg bg-emerald-100/80 px-3 py-1.5 text-right text-sm font-semibold tabular-nums text-emerald-900">
                          {formatMoney(price)}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Pricing tiers */}
            {!isGroupTemplate && pricingRows.length > 0 && (
              <div className={sectionCard}>
                <div className={sectionTitle}>
                  <Wallet className="h-4 w-4 text-emerald-600" />
                  Price tier
                </div>
                <p className="mb-3 text-xs text-slate-600">
                  Pick the rate that applies. <span className="font-semibold text-sky-700">Military</span> uses blue tones;{' '}
                  <span className="font-semibold text-amber-700">VIP</span> and <span className="font-semibold text-emerald-700">regular</span> use
                  amber and green.
                </p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {pricingRows.map((row) => {
                    const price = row.price != null ? Number(row.price) : 0
                    const theme = getPatientCategoryTheme(row.patient_category)
                    const selected = selectedPricingCategory === row.patient_category
                    return (
                      <label
                        key={row.patient_category}
                        className={`relative flex cursor-pointer flex-col gap-2 rounded-xl border-2 p-3.5 transition ${theme.card} ${
                          selected ? theme.ring : 'hover:border-slate-300/90'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="flex items-center gap-2.5">
                            <input
                              type="radio"
                              name="pricing_tier"
                              checked={selected}
                              onChange={() => setSelectedPricingCategory(row.patient_category)}
                              className="mt-0.5 h-4 w-4 border-slate-300 text-emerald-600 focus:ring-emerald-500/40"
                            />
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${theme.chip}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} />
                              {row.patient_category}
                            </span>
                          </span>
                          <span className="text-right text-base font-bold tabular-nums text-slate-900">{formatMoney(price)}</span>
                        </div>
                        {row.multiplier != null && row.multiplier !== 0 && (
                          <p className="pl-7 text-xs text-slate-600">Multiplier ×{row.multiplier}</p>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Total */}
            <div className="flex flex-col gap-3 rounded-xl border border-emerald-300/70 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 px-4 py-4 text-white shadow-md shadow-emerald-600/25 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-center gap-2 text-sm text-emerald-50">
                <Wallet className="h-4 w-4 text-white/90" />
                Estimated total
              </div>
              <div className="text-2xl font-bold tabular-nums tracking-tight text-white drop-shadow-sm">{formatMoney(grandTotal)}</div>
            </div>
          </div>

          <div className={`${CREATE_MODAL_FOOTER_STICKY} justify-end`}>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={CM_BTN_PRIMARY}>
              {submitting ? 'Creating…' : 'Create request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
