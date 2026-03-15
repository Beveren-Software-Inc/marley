import { useEffect, useState, useCallback } from 'react'
import { fetchLabTest, updateLabTestBasic, saveAndSubmitLabTest, type LabTest } from '../../services/labTests'
import {
  fetchHealthcarePractitioners,
  fetchLabTestTemplates,
  fetchMedicalDepartments,
  type LinkFieldOption,
} from '../../services/common'
import { toast } from '../../hooks/useToast'

interface EditLabTestModalProps {
  labTestName: string
  onClose: () => void
  onSuccess?: () => void
}

export const EditLabTestModal = ({ labTestName, onClose, onSuccess }: EditLabTestModalProps) => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [labTest, setLabTest] = useState<LabTest | null>(null)

  const [formData, setFormData] = useState({
    template: '',
    department: '',
    practitioner: '',
    service_unit: '',
    date: '',
    time: '',
    status: '',
    amount: '' as string | number,
    discount_margin: 'Percentage',
    discount: '' as string | number,
    discount_amount: '' as string | number,
    grand_total: '' as string | number,
  })

  const [templateOptions, setTemplateOptions] = useState<LinkFieldOption[]>([])
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateQuery, setTemplateQuery] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<LinkFieldOption | null>(null)

  const [departmentOptions, setDepartmentOptions] = useState<LinkFieldOption[]>([])
  const [departmentOpen, setDepartmentOpen] = useState(false)
  const [departmentQuery, setDepartmentQuery] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState<LinkFieldOption | null>(null)

  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [selectedPractitioner, setSelectedPractitioner] = useState<LinkFieldOption | null>(null)

  const [activeTab, setActiveTab] = useState<'edit' | 'details'>('edit')

  // Calculate discount amount and grand total
  const calculateFinancials = useCallback((data: typeof formData) => {
    const amount = Number(data.amount) || 0
    let discountAmount = 0

    if (data.discount_margin === 'Percentage') {
      const discountPercent = Number(data.discount) || 0
      discountAmount = (amount * discountPercent) / 100
    } else {
      discountAmount = Number(data.discount_amount) || 0
    }

    const grandTotal = amount - discountAmount

    return {
      discountAmount: isNaN(discountAmount) ? '' : discountAmount,
      grandTotal: isNaN(grandTotal) ? '' : grandTotal,
    }
  }, [])

  // Load lab test and base options
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const doc = await fetchLabTest(labTestName)
        setLabTest(doc)
        const initialFormData = {
          template: doc.template || '',
          department: doc.department || '',
          practitioner: doc.practitioner || '',
          service_unit: doc.service_unit || '',
          date: doc.date || new Date().toISOString().split('T')[0],
          time: doc.submitted_date
            ? new Date(doc.submitted_date).toTimeString().slice(0, 5)
            : new Date().toTimeString().slice(0, 5),
          status: doc.status || 'Draft',
          amount: (doc as any).amount ?? '',
          discount_margin: (doc as any).discount_margin || 'Percentage',
          discount: (doc as any).discount ?? '',
          discount_amount: (doc as any).discount_amount ?? '',
          grand_total: (doc as any).grand_total ?? '',
        }
        setFormData(initialFormData)

        const [templates, depts, practs] = await Promise.all([
          fetchLabTestTemplates(undefined, doc.department || undefined),
          fetchMedicalDepartments(),
          fetchHealthcarePractitioners(undefined, doc.department || undefined),
        ])

        setTemplateOptions(templates)
        setDepartmentOptions(depts)
        setPractitionerOptions(practs)

        if (doc.template) {
          const opt = templates.find((t) => t.name === doc.template)
          if (opt) {
            setSelectedTemplate(opt)
            setTemplateQuery(opt.label)
          }
        }

        if (doc.department) {
          const opt = depts.find((d) => d.name === doc.department)
          if (opt) {
            setSelectedDepartment(opt)
            setDepartmentQuery(opt.label)
          }
        }

        if (doc.practitioner) {
          const opt = practs.find((p) => p.name === doc.practitioner)
          if (opt) {
            setSelectedPractitioner(opt)
            setPractitionerQuery(opt.label)
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load lab test')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [labTestName])

  // Search templates when open/query changes
  useEffect(() => {
    if (!templateOpen) return
    const t = setTimeout(async () => {
      try {
        const res = await fetchLabTestTemplates(templateQuery, formData.department || undefined)
        setTemplateOptions(res)
      } catch {
        setTemplateOptions([])
      }
    }, templateQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [templateOpen, templateQuery, formData.department])

  // Search departments
  useEffect(() => {
    if (!departmentOpen) return
    const t = setTimeout(async () => {
      try {
        const res = await fetchMedicalDepartments(departmentQuery || undefined)
        setDepartmentOptions(res)
      } catch {
        setDepartmentOptions([])
      }
    }, departmentQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [departmentOpen, departmentQuery])

  // Search practitioners
  useEffect(() => {
    if (!practitionerOpen) return
    const t = setTimeout(async () => {
      try {
        const res = await fetchHealthcarePractitioners(practitionerQuery || undefined, formData.department || undefined)
        setPractitionerOptions(res)
      } catch {
        setPractitionerOptions([])
      }
    }, practitionerQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [practitionerOpen, practitionerQuery, formData.department])

  const handleChange = (field: keyof typeof formData, value: string) => {
    const updatedFormData = { ...formData, [field]: value }
    setFormData(updatedFormData)

    // Auto-calculate financials when relevant fields change
    if (['amount', 'discount_margin', 'discount', 'discount_amount'].includes(field)) {
      const { discountAmount, grandTotal } = calculateFinancials(updatedFormData)
      setFormData((prev) => ({
        ...prev,
        discount_amount: discountAmount,
        grand_total: grandTotal,
      }))
    }
  }

  const handleTemplateSelect = (opt: LinkFieldOption) => {
    setSelectedTemplate(opt)
    setTemplateQuery(opt.label)
    setTemplateOpen(false)
    handleChange('template', opt.name)
  }

  const handleDepartmentSelect = (opt: LinkFieldOption) => {
    setSelectedDepartment(opt)
    setDepartmentQuery(opt.label)
    setDepartmentOpen(false)
    handleChange('department', opt.name)
  }

  const handlePractitionerSelect = (opt: LinkFieldOption) => {
    setSelectedPractitioner(opt)
    setPractitionerQuery(opt.label)
    setPractitionerOpen(false)
    handleChange('practitioner', opt.name)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!labTest) return
    try {
      setSaving(true)
      setError(null)
      await updateLabTestBasic(labTest.name, {
        template: formData.template || undefined,
        department: formData.department || undefined,
        practitioner: formData.practitioner || undefined,
        service_unit: formData.service_unit || undefined,
        date: formData.date || undefined,
        time: formData.time || undefined,
        status: formData.status || undefined,
      })
      // Billing payload (optional)
      const billingPayload: any = {}
      if (formData.amount !== '') billingPayload.amount = Number(formData.amount)
      if (formData.discount_margin) billingPayload.discount_margin = formData.discount_margin
      if (formData.discount !== '') billingPayload.discount = Number(formData.discount)
      if (formData.discount_amount !== '') billingPayload.discount_amount = Number(formData.discount_amount)
      if (formData.grand_total !== '') billingPayload.grand_total = Number(formData.grand_total)
      if (Object.keys(billingPayload).length > 0) {
        await saveAndSubmitLabTest(labTest.name, billingPayload)
      }
      toast.success('Lab test updated')
      onSuccess?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update lab test')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl px-6 py-4">
          <div className="text-slate-600">Loading lab test...</div>
        </div>
      </div>
    )
  }

  if (!labTest) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Edit Lab Test</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {labTest.name} — patient {labTest.patient_name || labTest.patient}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-4 flex-shrink-0">
          {(['edit', 'details'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab === 'edit' ? 'Edit' : 'Details'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {/* Patient summary (always visible) */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Patient</h3>
            <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-700">
              <div className="font-medium">{labTest.patient_name || labTest.patient}</div>
              <div className="text-xs text-slate-500 mt-0.5">Patient ID: {labTest.patient}</div>
            </div>
          </div>

          {activeTab === 'edit' && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Lab Test Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Lab Test Template
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={selectedTemplate ? selectedTemplate.label : templateQuery}
                      onChange={(e) => {
                        setTemplateQuery(e.target.value)
                        setTemplateOpen(true)
                      }}
                      onFocus={() => setTemplateOpen(true)}
                      placeholder="Search template..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {templateOpen && templateOptions.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg">
                        {templateOptions.map((opt) => (
                          <button
                            key={opt.name}
                            type="button"
                            onClick={() => handleTemplateSelect(opt)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                          >
                            {opt.label || opt.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Department
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={selectedDepartment ? selectedDepartment.label : departmentQuery}
                      onChange={(e) => {
                        setDepartmentQuery(e.target.value)
                        setDepartmentOpen(true)
                      }}
                      onFocus={() => setDepartmentOpen(true)}
                      placeholder="Search department..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {departmentOpen && departmentOptions.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg">
                        {departmentOptions.map((opt) => (
                          <button
                            key={opt.name}
                            type="button"
                            onClick={() => handleDepartmentSelect(opt)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                          >
                            {opt.label || opt.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Requesting Practitioner
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={selectedPractitioner ? selectedPractitioner.label : practitionerQuery}
                      onChange={(e) => {
                        setPractitionerQuery(e.target.value)
                        setPractitionerOpen(true)
                      }}
                      onFocus={() => setTemplateOpen(true)}
                      placeholder="Search practitioner..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {practitionerOpen && practitionerOptions.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg">
                        {practitionerOptions.map((opt) => (
                          <button
                            key={opt.name}
                            type="button"
                            onClick={() => handlePractitionerSelect(opt)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                          >
                            {opt.label || opt.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Service Unit
                  </label>
                  <input
                    type="text"
                    value={formData.service_unit}
                    onChange={(e) => handleChange('service_unit', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => handleChange('date', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Time
                  </label>
                  <input
                    type="time"
                    value={formData.time}
                    onChange={(e) => handleChange('time', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleChange('status', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Requested">Requested</option>
                    <option value="Pending Review">Pending Review</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'details' && labTest && (
            <div className="space-y-4 text-sm text-slate-700">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-1">Test & Request</h3>
                <div className="space-y-0.5">
                  <div>Template: {labTest.template || '—'}</div>
                  <div>Lab Test Name: {labTest.lab_test_name || '—'}</div>
                  <div>Requesting Department: {labTest.requesting_department || '—'}</div>
                  <div>Service Request: {labTest.service_request || '—'}</div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-1">Timeline</h3>
                <div className="space-y-0.5">
                  <div>Result Date: {labTest.result_date || '—'}</div>
                  <div>Submitted: {labTest.submitted_date || '—'}</div>
                  <div>Reviewed Date: {labTest.approved_date || '—'}</div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Billing</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Amount
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={formData.amount}
                      onChange={(e) =>
                        handleChange('amount', e.target.value === '' ? '' : e.target.value)
                      }
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Discount Type
                    </label>
                    <select
                      value={formData.discount_margin}
                      onChange={(e) =>
                        handleChange('discount_margin', e.target.value)
                      }
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    >
                      <option value="Percentage">Percentage (%)</option>
                      <option value="Amount">Amount</option>
                    </select>
                  </div>

                  {formData.discount_margin === 'Percentage' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Discount (%)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={formData.discount}
                        onChange={(e) =>
                          handleChange('discount', e.target.value === '' ? '' : e.target.value)
                        }
                        placeholder="0"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  )}

                  {formData.discount_margin === 'Amount' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Discount Amount
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={formData.discount_amount}
                        onChange={(e) =>
                          handleChange('discount_amount', e.target.value === '' ? '' : e.target.value)
                        }
                        placeholder="0"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Discount Amount
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={formData.discount_amount}
                      readOnly
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm bg-slate-50 text-slate-700"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Grand Total
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={formData.grand_total}
                      readOnly
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm bg-slate-50 text-slate-700 font-semibold"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="px-0 pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}