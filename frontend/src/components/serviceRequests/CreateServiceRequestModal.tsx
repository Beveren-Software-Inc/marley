import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
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

interface CreateServiceRequestModalProps {
  onClose: () => void
  onSuccess: () => void
  initialPatient?: string
  initialTemplate?: string
  defaultTemplateType?: string
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

const formatMoney = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const CreateServiceRequestModal = ({
  onClose,
  onSuccess,
  initialPatient,
  initialTemplate,
  defaultTemplateType,
}: CreateServiceRequestModalProps) => {
  const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [templateTypes, setTemplateTypes] = useState<LinkFieldOption[]>([])
  const [templates, setTemplates] = useState<LinkFieldOption[]>([])
  const [practitioners, setPractitioners] = useState<LinkFieldOption[]>([])
  const [patientVisits, setPatientVisits] = useState<LinkFieldOption[]>([])
  const [admissions, setAdmissions] = useState<LinkFieldOption[]>([])
  const [costCenters, setCostCenters] = useState<LinkFieldOption[]>([])

  const [patientQuery, setPatientQuery] = useState(initialPatient || contextPatient || '')
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientCategory, setPatientCategory] = useState('')
  const [patientOpen, setPatientOpen] = useState(false)

  const [pricingRows, setPricingRows] = useState<PricingRow[]>([])
  const [groupRows, setGroupRows] = useState<GroupTemplateRow[]>([])
  const [selectedGroupTemplates, setSelectedGroupTemplates] = useState<string[]>([])
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null)

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

  const grandTotal = isGroupTemplate ? groupTotal : selectedPrice || 0

  useEffect(() => {
    const load = async () => {
      const [types, practs] = await Promise.all([
        fetchServiceRequestTemplateTypes(),
        fetchHealthcarePractitioners(),
      ])
      setTemplateTypes(types)
      setPractitioners(practs)

      const initialIsType = !!initialTemplate && types.some((t) => t.name === initialTemplate)
      const templateType = initialIsType
        ? initialTemplate || ''
        : defaultTemplateType || (initialTemplate ? 'Lab Test Template' : '')

      if (templateType) {
        setForm((prev) => ({ ...prev, template_dt: templateType }))
      }
    }
    load().catch(() => {})
  }, [defaultTemplateType, initialTemplate])

  useEffect(() => {
    if (!form.template_dt) {
      setTemplates([])
      return
    }
    fetchServiceRequestTemplates(form.template_dt)
      .then((rows) => {
        setTemplates(rows)
        const initialIsType = !!initialTemplate && templateTypes.some((t) => t.name === initialTemplate)
        if (initialTemplate && !initialIsType && !form.template_dn) {
          const matched = rows.find((r) => r.name === initialTemplate || r.label === initialTemplate)
          if (matched) {
            setForm((prev) => ({ ...prev, template_dn: matched.name }))
          }
        }
      })
      .catch(() => setTemplates([]))
  }, [form.template_dt, form.template_dn, initialTemplate, templateTypes])

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
    fetchCostCenters(undefined, undefined).then(setCostCenters).catch(() => setCostCenters([]))
  }, [])

  useEffect(() => {
    if (!form.template_dt || !form.template_dn) {
      setPricingRows([])
      setGroupRows([])
      setSelectedGroupTemplates([])
      setSelectedPrice(null)
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
          setSelectedPrice(null)
        } else {
          setSelectedGroupTemplates([])
          setSelectedPrice(getBestPrice(rows))
        }
      })
      .catch(() => {
        setPricingRows([])
        setGroupRows([])
        setSelectedGroupTemplates([])
        setSelectedPrice(null)
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
    if (!form.patient_visit && !form.inpatient_record) {
      setError('Select either Patient Visit or Inpatient Admission.')
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Create Service Request</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="relative">
              <label className="mb-1 block text-xs font-medium text-slate-600">Patient</label>
              <input
                value={patientQuery}
                onChange={(e) => {
                  setPatientQuery(e.target.value)
                  setPatientOpen(true)
                }}
                onFocus={() => setPatientOpen(true)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="Search patient..."
              />
              {patientOpen && (
                <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded border border-slate-200 bg-white shadow">
                  {patientOptions.map((patient) => (
                    <button
                      key={patient.name}
                      type="button"
                      className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onMouseDown={() => {
                        setForm((prev) => ({ ...prev, patient: patient.name }))
                        setPatientQuery(patient.patient_name || patient.name)
                        setPatientOpen(false)
                      }}
                    >
                      {(patient.patient_name || patient.name) + ` (${patient.name})`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Practitioner</label>
              <select
                value={form.practitioner}
                onChange={(e) => setForm((prev) => ({ ...prev, practitioner: e.target.value }))}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select practitioner</option>
                {practitioners.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.label || item.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Template Type</label>
              <select
                value={form.template_dt}
                onChange={(e) => setForm((prev) => ({ ...prev, template_dt: e.target.value, template_dn: '' }))}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select template type</option>
                {templateTypes.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.label || item.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Template</label>
              <select
                value={form.template_dn}
                onChange={(e) => setForm((prev) => ({ ...prev, template_dn: e.target.value }))}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select template</option>
                {templates.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.label || item.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Patient Visit (OP)</label>
              <select
                value={form.patient_visit}
                onChange={(e) => setForm((prev) => ({ ...prev, patient_visit: e.target.value }))}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select visit</option>
                {patientVisits.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.label || item.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Inpatient Admission (IP)</label>
              <select
                value={form.inpatient_record}
                onChange={(e) => setForm((prev) => ({ ...prev, inpatient_record: e.target.value }))}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select admission</option>
                {admissions.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.label || item.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Cost Center</label>
              <select
                value={form.cost_center}
                onChange={(e) => setForm((prev) => ({ ...prev, cost_center: e.target.value }))}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select cost center</option>
                {costCenters.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.label || item.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isGroupTemplate && (
            <div className="rounded border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-700">Group Templates</p>
              <div className="space-y-2">
                {groupRows.map((row) => {
                  const checked = selectedGroupTemplates.includes(row.template_dn)
                  const price = getBestPrice(row.pricing) || 0
                  return (
                    <label key={row.template_dn} className="flex items-center justify-between gap-3 rounded border border-slate-100 px-2 py-2">
                      <span className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedGroupTemplates((prev) =>
                              e.target.checked ? [...prev, row.template_dn] : prev.filter((name) => name !== row.template_dn)
                            )
                          }}
                        />
                        {row.template_label}
                      </span>
                      <span className="text-xs text-slate-600">{formatMoney(price)}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {!isGroupTemplate && pricingRows.length > 0 && (
            <div className="rounded border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-700">Pricing</p>
              <div className="space-y-2">
                {pricingRows.map((row) => {
                  const price = row.price != null ? Number(row.price) : 0
                  return (
                    <label key={row.patient_category} className="flex items-center justify-between gap-3 rounded border border-slate-100 px-2 py-2">
                      <span className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          checked={selectedPrice === price}
                          onChange={() => setSelectedPrice(price)}
                        />
                        {row.patient_category}
                        {row.multiplier ? ` x${row.multiplier}` : ''}
                      </span>
                      <span className="text-xs text-slate-600">{formatMoney(price)}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          <div className="rounded bg-slate-50 px-3 py-2 text-sm">
            Total: <span className="font-semibold">{formatMoney(grandTotal)}</span>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button type="button" onClick={onClose} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
