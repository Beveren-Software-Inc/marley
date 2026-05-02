import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { createInternalEmployeeInvoice, type BillingInvoiceItemInput } from '../../services/serviceOrders'
import { fetchCompanies, fetchCostCenters, fetchEmployees } from '../../services/common'
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
  const [employeeOptions, setEmployeeOptions] = useState<Array<{ name: string; label: string }>>([])
  const [employeeName, setEmployeeName] = useState('')
  const [company, setCompany] = useState('')
  const [createdAtCostCenter, setCreatedAtCostCenter] = useState('')
  const [postingDate, setPostingDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [items, setItems] = useState<BillingInvoiceItemInput[]>([emptyItem()])
  const [saving, setSaving] = useState(false)

  const reset = useCallback(() => {
    setActiveTab('details')
    setEmployeeName('')
    setCompany('')
    setCreatedAtCostCenter('')
    setPostingDate('')
    setDueDate('')
    setItems([emptyItem()])
  }, [])

  useEffect(() => {
    if (!isOpen) {
      reset()
      return
    }
    ;(async () => {
      try {
        const [companyData, employeesData] = await Promise.all([fetchCompanies(), fetchEmployees()])
        setCompanies(companyData)
        setEmployeeOptions(employeesData.map((emp) => ({ name: emp.name, label: emp.label || emp.name })))
      } catch {
        toast.error('Failed to load references')
      }
    })()
  }, [isOpen, reset])

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
    try {
      setSaving(true)
      const created = await createInternalEmployeeInvoice({
        employee_name: employeeName.trim(),
        company,
        created_at_cost_center: createdAtCostCenter,
        posting_date: postingDate || undefined,
        due_date: dueDate || undefined,
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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] min-h-[260px] flex flex-col border border-slate-200">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 shrink-0 rounded-t-xl flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">Internal employee invoice</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Creates Customer from employee name if needed; sets <strong className="font-medium text-slate-700">Internal Employee</strong>.
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
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Employee name</label>
                    <input
                      list="internal-billing-employee-datalist"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Type or pick employee"
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                    />
                    <datalist id="internal-billing-employee-datalist">
                      {employeeOptions.map((emp) => (
                        <option key={emp.name} value={emp.label} />
                      ))}
                    </datalist>
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
              <p className="text-xs text-slate-600 mb-2">Stock or service lines used by the employee.</p>
              <BillingInvoiceItemsEditor
                items={items}
                onChange={setItems}
                defaultCostCenter={createdAtCostCenter}
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
