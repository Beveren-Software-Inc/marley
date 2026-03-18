import { useState, useEffect } from 'react'
import {
  searchPatients,
  fetchPatients,
  type PatientListItem
} from '../../services/patients'

import {
  fetchHealthcarePractitioners,
  fetchServiceRequestTemplateTypes,
  fetchServiceRequestTemplates,
  fetchPatientVisits,
  fetchInpatientAdmissions,
  fetchCostCenters,
  type LinkFieldOption,
} from '../../services/common'

import {
  createServiceRequest,
  type CreateServiceRequestData
} from '../../services/serviceRequests'

import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'

interface CreateServiceRequestModalProps {
  onClose: () => void
  onSuccess: () => void
  initialPatient?: string
}

interface PricingRow {
  patient_category: string
  price: number | null
}

export const CreateServiceRequestModal = ({
  onClose,
  onSuccess,
  initialPatient
}: CreateServiceRequestModalProps) => {

  /* ────────────── PATIENT ────────────── */
  const [patientQuery, setPatientQuery] = useState(initialPatient || '')
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(null)
  const [patientCategory, setPatientCategory] = useState('')
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [loadingPatients, setLoadingPatients] = useState(false)

  /* ────────────── LOOKUPS ────────────── */
  const [templateTypes, setTemplateTypes] = useState<LinkFieldOption[]>([])
  const [templates, setTemplates] = useState<LinkFieldOption[]>([])
  const [practitioners, setPractitioners] = useState<LinkFieldOption[]>([])
  const [patientVisits, setPatientVisits] = useState<LinkFieldOption[]>([])
  const [admissions, setAdmissions] = useState<LinkFieldOption[]>([])
  const [costCenters, setCostCenters] = useState<LinkFieldOption[]>([])

  const [practOpen, setPractOpen] = useState(false)
  const [practQuery, setPractQuery] = useState('')
  const [costCenterOpen, setCostCenterOpen] = useState(false)
  const [costCenterSearch, setCostCenterSearch] = useState('')

  /* ────────────── PRICING & DISCOUNT ────────────── */
  const [pricing, setPricing] = useState<PricingRow[]>([])
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null)
  const [discountType, setDiscountType] = useState<'percentage' | 'amount'>('percentage')
  const [discountValue, setDiscountValue] = useState<number>(0)
  const [discountAmount, setDiscountAmount] = useState<number>(0)
  const [grandTotal, setGrandTotal] = useState<number>(0)

  /* ────────────── FORM ────────────── */
  const [formData, setFormData] = useState({
    template_dt: '',
    template_dn: '',
    practitioner: '',
    patient_visit: '',
    inpatient_record: '',
    order_date: new Date().toISOString().split('T')[0],
    order_time: new Date().toTimeString().slice(0, 5),
    department: '',
    cost_center: ''
  })

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* ────────────── INITIAL LOAD ────────────── */
  useEffect(() => {
    fetchServiceRequestTemplateTypes().then(setTemplateTypes)
    fetchHealthcarePractitioners().then(setPractitioners)
  }, [])

  /* ────────────── TEMPLATE CHANGE ────────────── */
  useEffect(() => {
    if (!formData.template_dt) {
      setTemplates([])
      setFormData(p => ({ ...p, template_dn: '' }))
      setPricing([])
      setSelectedPrice(null)
      return
    }

    fetchServiceRequestTemplates(formData.template_dt)
      .then((list) => {
        setTemplates(list)
        setFormData(p => ({ ...p, template_dn: '' }))
        setPricing([])
        setSelectedPrice(null)
      })
      .catch(() => {
        setTemplates([])
        setPricing([])
        setSelectedPrice(null)
      })
  }, [formData.template_dt])

  /* ────────────── LOAD LAB TEST TEMPLATE PRICING ────────────── */
  useEffect(() => {
    if (formData.template_dt !== 'Lab Test Template' || !formData.template_dn) {
      setPricing([])
      setSelectedPrice(null)
      return
    }

    const load = async () => {
      try {
        const res = await fetch(
          `/api/method/healthcare.api.service_request.get_lab_test_template_pricing?template=${encodeURIComponent(formData.template_dn)}`
        )
        const resData = await res.json()
        const pricingRows: PricingRow[] = resData?.message || []

        if (pricingRows.length > 0) {
          setPricing(pricingRows)
          // Auto-select price matching patient's category
          if (patientCategory) {
            const match = pricingRows.find((p) => p.patient_category === patientCategory)
            setSelectedPrice(match?.price ?? null)
          } else {
            setSelectedPrice(null)
          }
        } else {
          setPricing([])
          setSelectedPrice(null)
        }
      } catch (err) {
        console.error('Error loading pricing:', err)
        setPricing([])
        setSelectedPrice(null)
      }
    }

    load()
  }, [formData.template_dt, formData.template_dn, patientCategory])

  /* ────────────── RECALCULATE GRAND TOTAL ────────────── */
  useEffect(() => {
    let total = selectedPrice || 0

    if (discountType === 'percentage' && discountValue > 0) {
      const discount = (total * discountValue) / 100
      setDiscountAmount(discount)
      total -= discount
    } else if (discountType === 'amount' && discountValue > 0) {
      setDiscountAmount(discountValue)
      total -= discountValue
    } else {
      setDiscountAmount(0)
    }

    setGrandTotal(Math.max(0, total))
  }, [selectedPrice, discountType, discountValue])

  /* ────────────── LOAD VISITS + ADMISSIONS ────────────── */
  useEffect(() => {
    if (!selectedPatient) return

    fetchPatientVisits(selectedPatient.name)
      .then(setPatientVisits)
      .catch(() => setPatientVisits([]))

    fetchInpatientAdmissions(selectedPatient.name)
      .then(setAdmissions)
      .catch(() => setAdmissions([]))
  }, [selectedPatient])

  /* ────────────── PATIENT SEARCH ────────────── */
  useEffect(() => {
    if (!patientOpen) return

    const search = async () => {
      setLoadingPatients(true)
      try {
        const results =
          patientQuery.trim() === ''
            ? await fetchPatients(20, 0)
            : await searchPatients(patientQuery, 20)

        setPatients(results)
      } finally {
        setLoadingPatients(false)
      }
    }

    const t = setTimeout(search, 300)
    return () => clearTimeout(t)
  }, [patientQuery, patientOpen])

  /* ────────────── PRACTITIONER SEARCH ────────────── */
  useEffect(() => {
    if (!practOpen) return

    const t = setTimeout(async () => {
      const res = await fetchHealthcarePractitioners(practQuery || undefined)
      setPractitioners(res)
    }, 300)

    return () => clearTimeout(t)
  }, [practQuery, practOpen])

  /* ────────────── COST CENTER LOOKUP ────────────── */
  useEffect(() => {
    if (!costCenterOpen) return

    const t = setTimeout(() => {
      fetchCostCenters(undefined, costCenterSearch || undefined)
        .then(setCostCenters)
        .catch(() => setCostCenters([]))
    }, costCenterSearch.trim() === '' ? 0 : 300)

    return () => clearTimeout(t)
  }, [costCenterOpen, costCenterSearch])

  /* ────────────── SUBMIT ────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedPatient) {
      setError('Please select a patient')
      return
    }

    if (!formData.template_dt || !formData.template_dn) {
      setError('Please select template')
      return
    }

    if (!formData.cost_center) {
      setError('Please select Cost Center')
      return
    }

    if (!formData.patient_visit && !formData.inpatient_record) {
      setError('Please select either Patient Visit or Inpatient Admission')
      return
    }

    if (selectedPrice === null) {
      setError('Please select a price from pricing table')
      return
    }

    try {
      setSubmitting(true)

      const payload: CreateServiceRequestData = {
        patient: selectedPatient.name,
        template_dt: formData.template_dt,
        template_dn: formData.template_dn,
        practitioner: formData.practitioner || undefined,
        patient_visit: formData.patient_visit || undefined,
        inpatient_record: formData.inpatient_record || undefined,
        order_date: formData.order_date,
        order_time: formData.order_time,
        department: formData.department || undefined,
        cost_center: formData.cost_center || undefined,
        cost: selectedPrice,
        // discount_value (Select) stores the margin type; discount (Percent) stores the % value
        discount_value: discountType === 'percentage' ? 'Percentage' : 'Fixed Amount',
        discount: discountType === 'percentage' ? discountValue : 0,
        discount_amount: discountAmount,
        grand_total: grandTotal,
      }

      console.log('Submitting payload:', payload)
      await createServiceRequest(payload)

      toast.success('Service request created')
      onSuccess()
      onClose()

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create service request'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">

        {/* HEADER */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">
            Create Service Request
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* ═══════════ PATIENT ═══════════ */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Patient <span className="text-red-500">*</span>
            </label>

            <div className="relative">
              <input
                type="text"
                value={
                  selectedPatient
                    ? selectedPatient.patient_name || selectedPatient.name
                    : patientQuery
                }
                onChange={(e) => {
                  setPatientQuery(e.target.value)
                  setSelectedPatient(null)
                  setPatientCategory('')
                  setPatientOpen(true)
                }}
                onFocus={() => setPatientOpen(true)}
                placeholder="Search patient..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />

              {patientOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                  {loadingPatients ? (
                    <div className="px-3 py-2 text-xs text-slate-500">Loading...</div>
                  ) : patients.length ? (
                    patients.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-0 transition"
                        onClick={() => {
                          setSelectedPatient(p)
                          setPatientQuery(p.patient_name || p.name)
                          // IMPORTANT: Use 'category' field from Patient
                          setPatientCategory((p as any).category || '')
                          console.log('Selected patient category:', (p as any).category)
                          setPatientOpen(false)
                        }}
                      >
                        <div className="font-medium text-slate-900">{p.patient_name || p.name}</div>
                        <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {(p as any).file_number && <span>File: {(p as any).file_number}</span>}
                          {(p as any).id_number && <span>ID: {(p as any).id_number}</span>}
                          {(p as any).category && <span>Category: {(p as any).category}</span>}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-slate-500">No patients found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ═══════════ PRACTITIONER ═══════════ */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Practitioner
            </label>

            <div className="relative">
              <input
                type="text"
                value={formData.practitioner}
                onChange={(e) => {
                  setFormData({ ...formData, practitioner: e.target.value })
                  setPractQuery(e.target.value)
                  setPractOpen(true)
                }}
                onFocus={() => setPractOpen(true)}
                placeholder="Search practitioner..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />

              {practOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                  {practitioners.length ? (
                    practitioners.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-0 transition"
                        onClick={() => {
                          setFormData({ ...formData, practitioner: p.name })
                          setPractOpen(false)
                        }}
                      >
                        {p.label || p.name}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-slate-500">No practitioners found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ═══════════ VISIT + ADMISSION ═══════════ */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Patient Visit <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.patient_visit}
                onChange={(e) => setFormData({ ...formData, patient_visit: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
              >
                <option value="">Select visit</option>
                {patientVisits.map((v) => (
                  <option key={v.name} value={v.name}>{v.label || v.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Inpatient Admission <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.inpatient_record}
                onChange={(e) => setFormData({ ...formData, inpatient_record: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
              >
                <option value="">Select admission</option>
                {admissions.map((a) => (
                  <option key={a.name} value={a.name}>{a.label || a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ═══════════ TEMPLATE ═══════════ */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Template Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.template_dt}
                onChange={(e) => setFormData({ ...formData, template_dt: e.target.value, template_dn: '' })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
              >
                <option value="">Select type</option>
                {templateTypes.map((t) => (
                  <option key={t.name} value={t.name}>{t.label || t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Template <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.template_dn}
                disabled={!formData.template_dt}
                onChange={(e) => setFormData({ ...formData, template_dn: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-white disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="">Select template</option>
                {templates.map((t) => (
                  <option key={t.name} value={t.name}>{t.label || t.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ═══════════ PRICING TABLE ═══════════ */}
          {formData.template_dt === 'Lab Test Template' && pricing.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
              <label className="block text-sm font-semibold text-slate-900 mb-3">
                Select Price by Patient Category <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {pricing.map((row, idx) => (
                  <label key={idx} className={`flex items-center gap-3 p-2 rounded cursor-pointer transition ${row.patient_category === patientCategory ? 'bg-green-50 border border-green-200' : 'hover:bg-white'}`}>
                    <input
                      type="radio"
                      name="pricing"
                      checked={selectedPrice === row.price}
                      onChange={() => setSelectedPrice(row.price || null)}
                      className="w-4 h-4 text-primary focus:ring-primary border-slate-300"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-slate-900">
                        {row.patient_category}
                      </span>
                      {row.patient_category === patientCategory && (
                        <span className="ml-2 text-xs text-green-600 font-medium">(Patient's category)</span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {row.price?.toFixed(2) || 'N/A'}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ═══════════ DISCOUNT ═══════════ */}
          {selectedPrice !== null && (
            <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
              <label className="block text-sm font-semibold text-slate-900 mb-1">
                Discount & Total
              </label>
              <p className="text-xs text-slate-500 mb-4">Base price: <strong>{(selectedPrice || 0).toFixed(2)}</strong></p>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">
                    Discount Margin
                  </label>
                  <select
                    value={discountType}
                    onChange={(e) => { setDiscountType(e.target.value as 'percentage' | 'amount'); setDiscountValue(0) }}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="amount">Fixed Amount</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">
                    {discountType === 'amount' ? 'Discount Amount' : 'Discount (%)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">
                    Calculated Discount
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={discountAmount.toFixed(2)}
                    className="w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
                  />
                </div>
              </div>

              <div className="bg-white rounded-md border border-slate-200 p-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">Grand Total</span>
                <span className="text-lg font-bold text-primary">{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* ═══════════ COST CENTER ═══════════ */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Cost Center <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={
                  costCenterOpen
                    ? costCenterSearch
                    : formData.cost_center
                      ? costCenters.find((c) => c.name === formData.cost_center)?.label ?? formData.cost_center
                      : ''
                }
                onChange={(e) => {
                  setCostCenterSearch(e.target.value)
                  if (!costCenterOpen) setCostCenterOpen(true)
                }}
                onFocus={() => setCostCenterOpen(true)}
                placeholder="Search cost center..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />

              {costCenterOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                  {costCenters.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-500">No cost centers found</div>
                  ) : (
                    costCenters.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-0 transition"
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, cost_center: c.name }))
                          setCostCenterSearch('')
                          setCostCenterOpen(false)
                        }}
                      >
                        <div className="font-medium text-slate-800">{c.label || c.name}</div>
                        {c.label && c.label !== c.name && (
                          <div className="text-xs text-slate-500">{c.name}</div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ═══════════ ORDER DATE & TIME ═══════════ */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Order Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.order_date}
                onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Order Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={formData.order_time}
                onChange={(e) => setFormData({ ...formData, order_time: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>

          {/* ═══════════ ACTIONS ═══════════ */}
          <div className="flex justify-end gap-3 pt-5 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {submitting ? 'Creating…' : 'Create Service Request'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}