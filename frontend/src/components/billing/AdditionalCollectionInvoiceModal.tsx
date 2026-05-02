import { useState, useEffect, useCallback } from 'react'
import { X, Loader2, RefreshCw } from 'lucide-react'
import {
  fetchRelatedSalesOrders,
  createAdditionalCollectionInvoice,
  type BillingInvoiceItemInput,
  type RelatedSalesOrder,
} from '../../services/serviceOrders'
import {
  fetchCompanies,
  fetchCostCenters,
  fetchPatientVisits,
  fetchInpatientAdmissions,
  type LinkFieldOption,
} from '../../services/common'
import { toast } from '../../hooks/useToast'
import { CollapsibleFormSection } from './CollapsibleFormSection'
import { BillingInvoiceItemsEditor } from './BillingInvoiceItemsEditor'

type TabId = 'details' | 'items'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount)
}

const emptyItem = (): BillingInvoiceItemInput => ({
  item_code: '',
  item_name: '',
  description: '',
  qty: 1,
  rate: 0,
})

interface AdditionalCollectionInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  initialPatient?: string
}

export function AdditionalCollectionInvoiceModal({
  isOpen,
  onClose,
  onSuccess,
  initialPatient,
}: AdditionalCollectionInvoiceModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('details')
  const [companies, setCompanies] = useState<Array<{ name: string; label: string }>>([])
  const [costCenters, setCostCenters] = useState<Array<{ name: string; label: string }>>([])
  const [referenceType, setReferenceType] = useState<'Patient Visit' | 'Inpatient Admission'>('Patient Visit')
  const [referenceName, setReferenceName] = useState('')
  const [patient, setPatient] = useState('')
  const [customer, setCustomer] = useState('')
  const [company, setCompany] = useState('')
  const [createdAtCostCenter, setCreatedAtCostCenter] = useState('')
  const [postingDate, setPostingDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [relatedOrders, setRelatedOrders] = useState<RelatedSalesOrder[]>([])
  const [selectedOrders, setSelectedOrders] = useState<string[]>([])
  const [additionalItems, setAdditionalItems] = useState<BillingInvoiceItemInput[]>([emptyItem()])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [saving, setSaving] = useState(false)
  const [encounterOptions, setEncounterOptions] = useState<LinkFieldOption[]>([])
  const [loadingEncounters, setLoadingEncounters] = useState(false)

  const reset = useCallback(() => {
    setActiveTab('details')
    setReferenceType('Patient Visit')
    setReferenceName('')
    setPatient('')
    setCustomer('')
    setCompany('')
    setCreatedAtCostCenter('')
    setPostingDate('')
    setDueDate('')
    setRelatedOrders([])
    setSelectedOrders([])
    setAdditionalItems([emptyItem()])
    setEncounterOptions([])
    setLoadingEncounters(false)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      reset()
      return
    }
    if (initialPatient) setPatient(initialPatient)
    ;(async () => {
      try {
        const companyData = await fetchCompanies()
        setCompanies(companyData)
      } catch {
        toast.error('Failed to load companies')
      }
    })()
  }, [isOpen, initialPatient, reset])

  useEffect(() => {
    if (!isOpen || !company) {
      setCostCenters([])
      return
    }
    fetchCostCenters(company)
      .then(setCostCenters)
      .catch(() => toast.error('Failed to load cost centers'))
  }, [isOpen, company])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    ;(async () => {
      setLoadingEncounters(true)
      try {
        const patientFilter = patient.trim() || undefined
        const rows =
          referenceType === 'Patient Visit'
            ? await fetchPatientVisits(patientFilter)
            : await fetchInpatientAdmissions(patientFilter)
        if (!cancelled) setEncounterOptions(rows)
      } catch {
        if (!cancelled) {
          setEncounterOptions([])
          toast.error('Failed to load visits / admissions')
        }
      } finally {
        if (!cancelled) setLoadingEncounters(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, referenceType, patient])

  useEffect(() => {
    if (!isOpen) return
    setReferenceName('')
    setRelatedOrders([])
    setSelectedOrders([])
  }, [isOpen, referenceType, patient])

  const pullOrdersFromEncounter = useCallback(
    async (opts?: { navigateToItems?: boolean; verbose?: boolean; encounterRef?: string }) => {
      const ref = (opts?.encounterRef ?? referenceName).trim()
      if (!ref) {
        if (opts?.verbose) toast.error('Select a patient visit or admission')
        return
      }
      try {
        setLoadingOrders(true)
        const rows = await fetchRelatedSalesOrders(referenceType, ref)
        setRelatedOrders(rows)
        setSelectedOrders(rows.map((r) => r.name))
        setCompany((prev) => prev || rows[0]?.company || '')
        setCustomer((prev) => prev || rows[0]?.customer || '')
        if (opts?.verbose) {
          if (rows.length > 0) {
            toast.success(`Loaded ${rows.length} billable order(s) — review lines on Items`)
          } else {
            toast.info('No linked orders for this encounter — add manual lines on Items')
          }
          if (opts.navigateToItems !== false) setActiveTab('items')
        } else if (rows.length > 0 && opts?.navigateToItems !== false) {
          setActiveTab('items')
        }
      } catch (error) {
        if (opts?.verbose) toast.error(error instanceof Error ? error.message : 'Failed to load billable orders')
      } finally {
        setLoadingOrders(false)
      }
    },
    [referenceType, referenceName]
  )

  const manualLinesCount = additionalItems.filter((r) => r.item_code?.trim()).length
  const itemsTabBadge = `${selectedOrders.length} orders · ${manualLinesCount} manual`

  const handleSubmit = async () => {
    try {
      setSaving(true)
      const created = await createAdditionalCollectionInvoice({
        reference_type: referenceType,
        reference_name: referenceName.trim(),
        patient: patient.trim() || undefined,
        customer: customer.trim() || undefined,
        company,
        created_at_cost_center: createdAtCostCenter,
        posting_date: postingDate || undefined,
        due_date: dueDate || undefined,
        sales_orders: selectedOrders,
        additional_items: additionalItems,
      })
      toast.success(`Invoice ${created.name} created`)
      onSuccess()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create invoice')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] min-h-[280px] flex flex-col border border-slate-200">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 shrink-0 rounded-t-xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-slate-900">Additional collection invoice</h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Sets <strong className="font-medium text-slate-700">Created At</strong> (collection cost center) on Sales Invoice.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end md:self-start">
              <button
                type="button"
                onClick={() => void pullOrdersFromEncounter({ verbose: true })}
                disabled={loadingOrders || !referenceName.trim()}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-primary text-primary bg-white hover:bg-primary hover:text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                {loadingOrders ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Load billable orders
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex border-t border-slate-100 mt-3 -mx-4 px-4 pt-2 bg-slate-50">
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
                {tab === 'details' ? 'Details' : `Items & billing (${itemsTabBadge})`}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {activeTab === 'details' && (
            <>
              <CollapsibleFormSection title="Reference & billing party" defaultOpen>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Patient (optional)</label>
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Patient doc name — narrows the list below"
                      value={patient}
                      onChange={(e) => setPatient(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Encounter type</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                      value={referenceType}
                      onChange={(e) =>
                        setReferenceType(e.target.value as 'Patient Visit' | 'Inpatient Admission')
                      }
                    >
                      <option value="Patient Visit">Patient Visit</option>
                      <option value="Inpatient Admission">Inpatient Admission</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Visit / Admission ID</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-white font-mono disabled:opacity-60"
                      value={referenceName}
                      disabled={loadingEncounters}
                      onChange={(e) => {
                        const v = e.target.value
                        setReferenceName(v)
                        if (v.trim()) void pullOrdersFromEncounter({ verbose: false, navigateToItems: true, encounterRef: v })
                      }}
                    >
                      <option value="">
                        {loadingEncounters ? 'Loading encounters…' : 'Select visit / admission'}
                      </option>
                      {encounterOptions.map((o) => (
                        <option key={o.name} value={o.name}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Recent records (latest 20). Enter patient above to filter.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Customer</label>
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Customer name / ID"
                      value={customer}
                      onChange={(e) => setCustomer(e.target.value)}
                    />
                  </div>
                </div>
              </CollapsibleFormSection>

              <CollapsibleFormSection title="Company & collection site" defaultOpen>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            <div className="space-y-4">
              <CollapsibleFormSection title="Billable orders (labs, medication, IP services)" defaultOpen>
                <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                  Rows are billing documents for this encounter. The green badge summarises the type (labs, medication, IP
                  service, …); lines underneath list each charge. Tick what to include on the invoice.
                </p>
                {relatedOrders.length === 0 ? (
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Choose encounter on Details, then <strong className="font-medium text-slate-700">Load billable orders</strong>{' '}
                    (top right). You will land on this tab to review items.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {relatedOrders.map((so) => (
                      <label
                        key={so.name}
                        className="block rounded-lg border border-slate-200 hover:bg-slate-50/80 cursor-pointer text-sm overflow-hidden"
                      >
                        <div className="flex items-stretch gap-3 px-3 py-2.5">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary shrink-0 mt-0.5"
                            checked={selectedOrders.includes(so.name)}
                            onChange={(e) =>
                              setSelectedOrders((prev) =>
                                e.target.checked ? [...prev, so.name] : prev.filter((x) => x !== so.name)
                              )
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 gap-y-1">
                              <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-100">
                                {so.order_kind_label || 'Billing order'}
                              </span>
                              {so.transaction_date ? (
                                <span className="text-[11px] text-slate-500">{so.transaction_date}</span>
                              ) : null}
                              <span className="text-[11px] text-slate-400">· {so.status}</span>
                            </div>
                            <p className="text-[11px] font-mono text-slate-500 mt-1 truncate" title={so.name}>
                              Ref: {so.name}
                            </p>
                            {(so.items?.length ?? 0) > 0 ? (
                              <ul className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                                {so.items!.map((line, idx) => (
                                  <li
                                    key={`${so.name}-${idx}-${line.item_code}`}
                                    className="flex justify-between gap-2 text-xs text-slate-700"
                                  >
                                    <span
                                      className="min-w-0 truncate"
                                      title={[line.item_name, line.description].filter(Boolean).join(' — ') || line.item_code}
                                    >
                                      {(line.item_name || line.description || line.item_code || '').trim() || '—'}
                                    </span>
                                    <span className="shrink-0 tabular-nums text-slate-600">
                                      ×{Number(line.qty)}
                                      {line.amount != null && !Number.isNaN(Number(line.amount))
                                        ? ` · ${formatCurrency(Number(line.amount))}`
                                        : ''}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-[11px] text-slate-400 mt-2 italic">No lines listed on this order.</p>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-slate-900 shrink-0 tabular-nums self-start pt-0.5">
                            {formatCurrency(so.grand_total)}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </CollapsibleFormSection>

              <CollapsibleFormSection title="Additional manual lines" defaultOpen>
                <p className="text-xs text-slate-600 mb-2">
                  Optional extra charge lines (same behaviour as pulling items from selected orders above).
                </p>
                <BillingInvoiceItemsEditor
                  items={additionalItems}
                  onChange={setAdditionalItems}
                  defaultCostCenter={createdAtCostCenter}
                  addLabel="Add manual line"
                />
              </CollapsibleFormSection>
            </div>
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
            {saving ? 'Creating…' : 'Create invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}
