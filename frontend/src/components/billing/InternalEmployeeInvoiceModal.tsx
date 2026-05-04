import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Loader2, User, Building2, Briefcase } from 'lucide-react'
import { createInternalEmployeeInvoice, type BillingInvoiceItemInput } from '../../services/serviceOrders'
import { fetchCompanies, fetchCostCenters, fetchEmployees, type EmployeeOption } from '../../services/common'
import { toast } from '../../hooks/useToast'
import { CollapsibleFormSection } from './CollapsibleFormSection'
import { BillingInvoiceItemsEditor } from './BillingInvoiceItemsEditor'

type TabId = 'details' | 'items'

const emptyItem = (): BillingInvoiceItemInput => ({
  item_code: '',
  item_name: '',
  description: '',
  qty: 1,
  rate: 0,
})

interface InternalEmployeeInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function InternalEmployeeInvoiceModal({ isOpen, onClose, onSuccess }: InternalEmployeeInvoiceModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('details')
  const [companies, setCompanies] = useState<Array<{ name: string; label: string }>>([])
  const [costCenters, setCostCenters] = useState<Array<{ name: string; label: string }>>([])
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null)
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [employeeOpen, setEmployeeOpen] = useState(false)
  const [employeeResults, setEmployeeResults] = useState<EmployeeOption[]>([])
  const [employeeSearching, setEmployeeSearching] = useState(false)
  const employeeInputRef = useRef<HTMLInputElement>(null)
  const employeeDropdownRef = useRef<HTMLDivElement>(null)

  const [company, setCompany] = useState('')
  const [createdAtCostCenter, setCreatedAtCostCenter] = useState('')
  const [postingDate, setPostingDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  /** Optional Patient docname — applies Healthcare Settings category multiplier to service item rates */
  const [pricingPatient, setPricingPatient] = useState('')
  const [items, setItems] = useState<BillingInvoiceItemInput[]>([emptyItem()])
  const [saving, setSaving] = useState(false)

  const reset = useCallback(() => {
    setActiveTab('details')
    setSelectedEmployee(null)
    setEmployeeQuery('')
    setEmployeeOpen(false)
    setEmployeeResults([])
    setCompany('')
    setCreatedAtCostCenter('')
    setPostingDate('')
    setDueDate('')
    setPricingPatient('')
    setItems([emptyItem()])
  }, [])

  useEffect(() => {
    if (!isOpen) {
      reset()
      return
    }
    ;(async () => {
      try {
        const companyData = await fetchCompanies()
        setCompanies(companyData)
      } catch {
        toast.error('Failed to load companies')
      }
    })()
  }, [isOpen, reset])

  useEffect(() => {
    if (!employeeOpen) return

    const q = employeeQuery.trim()
    const run = async () => {
      setEmployeeSearching(true)
      try {
        setEmployeeResults(await fetchEmployees(q || undefined))
      } catch {
        setEmployeeResults([])
      } finally {
        setEmployeeSearching(false)
      }
    }

    const id = window.setTimeout(run, q === '' ? 0 : 280)
    return () => window.clearTimeout(id)
  }, [employeeQuery, employeeOpen])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        employeeDropdownRef.current?.contains(t) ||
        employeeInputRef.current?.contains(t)
      ) {
        return
      }
      setEmployeeOpen(false)
    }
    if (isOpen) document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !company) {
      setCostCenters([])
      return
    }
    fetchCostCenters(company)
      .then(setCostCenters)
      .catch(() => toast.error('Failed to load cost centers'))
  }, [isOpen, company])

  const filledLines = items.filter((r) => r.item_code?.trim()).length

  const handleSubmit = async () => {
    if (!selectedEmployee) {
      toast.error('Search and select an employee')
      return
    }
    const employee_name = (selectedEmployee.label || selectedEmployee.name || '').trim()
    if (!employee_name) {
      toast.error('Employee name is missing')
      return
    }

    try {
      setSaving(true)
      const created = await createInternalEmployeeInvoice({
        employee_name,
        company,
        created_at_cost_center: createdAtCostCenter,
        posting_date: postingDate || undefined,
        due_date: dueDate || undefined,
        patient: pricingPatient.trim() || undefined,
        items,
      })
      toast.success(`Internal invoice ${created.name} created`)
      onSuccess()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create internal invoice')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const employeeInputDisplay = selectedEmployee ? selectedEmployee.label || selectedEmployee.name : employeeQuery

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] min-h-[260px] flex flex-col border border-slate-200">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 shrink-0 rounded-t-xl flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">Internal employee invoice</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Creates Customer from employee name if needed; sets{' '}
              <strong className="font-medium text-slate-700">Internal Employee</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 shrink-0 bg-slate-50 px-4">
          {(['details', 'items'] as TabId[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary text-primary bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab === 'details' ? 'Details' : `Items (${filledLines})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {activeTab === 'details' && (
            <>
              <CollapsibleFormSection title="Employee & organization" defaultOpen>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2 relative">
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Employee <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={employeeInputRef}
                      type="text"
                      autoComplete="off"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Search by employee name…"
                      value={employeeInputDisplay}
                      onChange={(e) => {
                        setEmployeeQuery(e.target.value)
                        setSelectedEmployee(null)
                        setEmployeeOpen(true)
                      }}
                      onFocus={() => {
                        setEmployeeOpen(true)
                        if (!employeeQuery.trim() && !selectedEmployee) setEmployeeQuery('')
                      }}
                    />
                    {employeeOpen && (
                      <div
                        ref={employeeDropdownRef}
                        className="absolute left-0 right-0 z-20 mt-1 rounded-md border border-slate-200 bg-white shadow-lg max-h-56 overflow-auto"
                      >
                        {employeeSearching ? (
                          <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            Searching…
                          </div>
                        ) : employeeResults.length > 0 ? (
                          employeeResults.map((emp) => (
                            <button
                              key={emp.name}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0"
                              onClick={() => {
                                setSelectedEmployee(emp)
                                setEmployeeQuery(emp.label || emp.name)
                                setEmployeeOpen(false)
                              }}
                            >
                              <div className="font-medium text-slate-900">{emp.label || emp.name}</div>
                              <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3 shrink-0" />
                                  ID: {emp.name}
                                </span>
                                {emp.department ? (
                                  <span className="flex items-center gap-1">
                                    <Building2 className="w-3 h-3 shrink-0" />
                                    {emp.department}
                                  </span>
                                ) : null}
                                {emp.designation ? (
                                  <span className="flex items-center gap-1">
                                    <Briefcase className="w-3 h-3 shrink-0" />
                                    {emp.designation}
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-xs text-slate-500">
                            {employeeQuery.trim() ? 'No matching employees.' : 'Type to search active employees.'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Company</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                    >
                      <option value="">Select company</option>
                      {companies.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Collection cost center</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                      value={createdAtCostCenter}
                      onChange={(e) => setCreatedAtCostCenter(e.target.value)}
                    >
                      <option value="">Select cost center</option>
                      {costCenters.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Patient (optional — service category multiplier)
                    </label>
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                      placeholder="e.g. PAT-00001"
                      value={pricingPatient}
                      onChange={(e) => setPricingPatient(e.target.value)}
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      For <strong>non-stock</strong> (service) items, rate = template or list price × multiplier from
                      Healthcare Settings for this patient&apos;s category. Saved on the invoice when set.
                    </p>
                  </div>
                </div>
              </CollapsibleFormSection>

              <CollapsibleFormSection title="Dates" defaultOpen={false}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Posting date</label>
                    <input
                      type="date"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      value={postingDate}
                      onChange={(e) => setPostingDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Due date</label>
                    <input
                      type="date"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                </div>
              </CollapsibleFormSection>
            </>
          )}

          {activeTab === 'items' && (
            <CollapsibleFormSection title="Drugs & services" defaultOpen>
              <p className="text-xs text-slate-600 mb-2">
                Search stock / service items like prescriptions — pick from the list to set code and name.
              </p>
              <BillingInvoiceItemsEditor
                items={items}
                onChange={setItems}
                defaultCostCenter={createdAtCostCenter}
                company={company}
                postingDate={postingDate}
                patient={pricingPatient}
                addLabel="Add item line"
              />
            </CollapsibleFormSection>
          )}
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-slate-200 shrink-0 bg-white rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="flex-1 px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm font-semibold"
          >
            {saving ? 'Creating…' : 'Create internal invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}
